import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 60;

const POLLINATIONS_URL = "https://text.pollinations.ai/openai/chat/completions";

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }

    try {
      const res = await fetch(POLLINATIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.status === 429) continue;
      if (!res.ok) { console.error(`[ADS] HTTP ${res.status}`); continue; }

      const text = await res.text();
      if (!text?.trim()) continue;

      let data: any;
      try { data = JSON.parse(text); } catch { continue; }

      const content = data.choices?.[0]?.message?.content;
      if (!content?.trim()) continue;

      return content;
    } catch (e: any) {
      console.error(`[ADS] Error:`, e.message?.slice(0, 100));
      continue;
    }
  }

  throw new Error("ИИ временно недоступен. Попробуйте через минуту.");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const count = Math.min(Math.max(body.count || 3, 1), 10);

    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Кампания не найдена" }, { status: 404 });

    const topic = campaign.topic || campaign.name;
    if (!topic?.trim()) return NextResponse.json({ error: "Укажите тему кампании" }, { status: 400 });

    const typeLabel = campaign.targetType === "bot" ? "бота" : campaign.targetType === "chat" ? "чата" : "канала";

    const systemPrompt = `You write Telegram ad copy in Russian. Return ONLY a JSON array of strings. Each string = one ad variant. No markdown. 3-8 sentences each, 2-4 emoji, with CTA.`;

    const userPrompt = `Topic: ${topic}\nAdvertise: ${campaign.targetUrl || "N/A"} (Telegram ${typeLabel})\nDesc: ${campaign.description || "none"}\n\nWrite ${count} ad variants for "${campaign.name}".${campaign.targetUrl ? ` Link: ${campaign.targetUrl}` : ""}`;

    const raw = await callLLM(systemPrompt, userPrompt);
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let texts: string[] = [];
    try {
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(cleaned.substring(start, end + 1));
        if (Array.isArray(parsed)) {
          texts = parsed.filter((t: unknown) => typeof t === "string" && t.trim().length > 0);
        }
      }
    } catch {
      console.error("[ADS] JSON parse error");
    }

    if (texts.length === 0) {
      return NextResponse.json({ error: "Не удалось сгенерировать тексты. Попробуйте ещё раз." }, { status: 500 });
    }

    const maxVariant = await db.adPost.aggregate({ where: { campaignId: id }, _max: { variant: true } });
    let nextVariant = (maxVariant._max.variant || 0) + 1;

    const saved = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        saved.push(await db.adPost.create({
          data: { campaignId: id, content: texts[i], variant: nextVariant + i, status: "generated" },
        }));
      } catch (e) {
        console.error("[ADS] Save error:", e);
      }
    }

    return NextResponse.json({ success: true, count: saved.length, posts: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка генерации";
    console.error("[ADS]", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}