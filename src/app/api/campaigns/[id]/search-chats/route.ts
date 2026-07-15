import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 120;

const POLLINATIONS_URL = "https://text.pollinations.ai/openai/chat/completions";

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  // Pollinations uses a reasoning model that burns tokens on "thinking".
  // Use high max_tokens and simple prompts for reliability.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const wait = 3000 + attempt * 2000; // 3s, 5s, 7s
      console.log(`[SEARCH] Retry ${attempt} in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
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
          temperature: 0.7,
          max_tokens: 8000,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (res.status === 429) continue;

      if (!res.ok) {
        console.error(`[SEARCH] HTTP ${res.status} attempt ${attempt}`);
        continue;
      }

      const text = await res.text();
      if (!text?.trim()) {
        console.error(`[SEARCH] Empty body attempt ${attempt}`);
        continue;
      }

      let data: any;
      try { data = JSON.parse(text); } catch {
        console.error(`[SEARCH] Bad JSON body attempt ${attempt}`);
        continue;
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        // Reasoning model sometimes returns empty content — retry
        console.error(`[SEARCH] Empty content attempt ${attempt} (reasoning may have used all tokens)`);
        continue;
      }

      console.log(`[SEARCH] OK — ${content.length} chars on attempt ${attempt}`);
      return content;
    } catch (e: any) {
      console.error(`[SEARCH] Error attempt ${attempt}:`, e.message?.slice(0, 100));
      continue;
    }
  }

  throw new Error("ИИ временно недоступен. Попробуйте через минуту.");
}

function normalizeTgLink(link: unknown): string | null {
  if (!link || typeof link !== "string") return null;
  const s = link.trim();
  if (s.startsWith("t.me/")) return s;
  if (s.startsWith("@")) return "t.me/" + s.slice(1);
  if (s.startsWith("https://t.me/")) return "t.me/" + s.slice(13);
  if (/^[a-zA-Z_]\w{2,30}$/.test(s)) return "t.me/" + s;
  return null;
}

function parseChats(raw: string): Array<{ title: string; tgLink: string; description: string; membersCount: number; category: string }> {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) {
    console.error("[SEARCH] No JSON array found. Raw:", cleaned.slice(0, 300));
    return [];
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    // Fix trailing commas
    try {
      parsed = JSON.parse(cleaned.substring(start, end + 1).replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
    } catch (e) {
      console.error("[SEARCH] JSON parse failed:", (e as Error).message);
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => item?.title && normalizeTgLink(item.tgLink || item.link || item.username))
    .map((item) => ({
      title: String(item.title).trim(),
      tgLink: normalizeTgLink(item.tgLink || item.link || item.username)!,
      description: String(item.description || "").trim(),
      membersCount: parseInt(item.membersCount || item.members || "0", 10) || 0,
      category: String(item.category || item.cat || "").trim(),
    }));
}

async function resolveMemberCounts(links: string[]): Promise<Record<string, { title: string; members: number }>> {
  const result: Record<string, { title: string; members: number }> = {};
  try {
    const res = await fetch("http://localhost:3011/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const r of (data.results || []) as Array<{ link: string; title: string; members: number }>) {
        if (r.link && r.members > 0) result[r.link] = { title: r.title || "", members: r.members };
      }
    }
  } catch { /* not available */ }
  return result;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Кампания не найдена" }, { status: 404 });

    const topic = campaign.topic || campaign.name;
    if (!topic?.trim()) return NextResponse.json({ error: "Укажите тему кампании" }, { status: 400 });

    // Short prompt — reasoning model needs less context to produce output
    const systemPrompt = `You are a Telegram ads expert. Return a JSON array of 15 real Telegram GROUPS (not channels) for ads.
Each object: {"title":"Group Name","tgLink":"t.me/username","description":"Short Russian description","membersCount":50000,"category":"Category"}
Rules: real groups only, 3000+ members, tgLink format "t.me/username". JSON only, no markdown.`;

    const userPrompt = `Find 15 popular Telegram groups for ads about: "${topic}".
Include groups with 3000 to 500000 members. Mix of large and medium groups. All in Russian context.`;

    const raw = await callLLM(systemPrompt, userPrompt);
    let chats = parseChats(raw);

    // Retry with even simpler prompt if nothing parsed
    if (chats.length === 0) {
      console.log("[SEARCH] 0 chats parsed, retrying with minimal prompt...");
      const raw2 = await callLLM(
        "Return ONLY a JSON array of objects with: title, tgLink (format t.me/name), membersCount, description, category. No markdown.",
        `List 15 real Telegram groups about "${topic}" for advertising.`
      );
      chats = parseChats(raw2);
    }

    if (chats.length === 0) {
      return NextResponse.json({ success: false, error: "Не удалось найти чаты. Попробуйте ещё раз.", count: 0, chats: [] });
    }

    chats.sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0));

    const verified = await resolveMemberCounts(chats.map((c) => c.tgLink));

    const saved = [];
    for (const chat of chats) {
      const existing = await db.targetChat.findFirst({ where: { campaignId: id, tgLink: chat.tgLink } });
      if (existing) continue;

      const v = verified[chat.tgLink];
      try {
        saved.push(await db.targetChat.create({
          data: {
            campaignId: id,
            title: v?.title || chat.title,
            tgLink: chat.tgLink,
            description: chat.description || null,
            membersCount: v?.members || chat.membersCount || null,
            category: chat.category || null,
            status: "found",
          },
        }));
      } catch (e) {
        console.error("Save error:", e);
      }
    }

    return NextResponse.json({ success: true, count: saved.length, chats: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка поиска";
    console.error("[SEARCH]", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}