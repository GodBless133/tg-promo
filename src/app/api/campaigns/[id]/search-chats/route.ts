import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 120;

const DEFAULT_BASE_URL = "https://text.pollinations.ai/openai";
const FALLBACK_MODELS = ["openai", "mistral", "qwen"];

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = 3000): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || (apiKey ? "https://api.openai.com/v1" : DEFAULT_BASE_URL);
  const models = apiKey ? [process.env.OPENAI_MODEL || "gpt-4o-mini"] : FALLBACK_MODELS;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.8,
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (res.status === 429) continue;
        if (!res.ok) {
          console.error(`[SEARCH] ${model} HTTP ${res.status}`);
          break;
        }

        const text = await res.text();
        if (!text?.trim()) {
          console.error(`[SEARCH] ${model} empty body`);
          break;
        }

        let data: any;
        try { data = JSON.parse(text); } catch {
          console.error(`[SEARCH] ${model} invalid JSON response`);
          break;
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content?.trim()) {
          console.error(`[SEARCH] ${model} empty content`);
          continue;
        }

        console.log(`[SEARCH] Got ${content.length} chars from ${model}`);
        return content;
      } catch (e: any) {
        if (e.name === "AbortError") {
          console.error(`[SEARCH] ${model} timeout`);
          break;
        }
        console.error(`[SEARCH] ${model} error:`, e.message);
        break;
      }
    }
  }

  throw new Error("ИИ временно недоступен. Попробуйте через 30 секунд.");
}

/** Normalize a Telegram link to t.me/username format */
function normalizeTgLink(link: unknown): string | null {
  if (!link || typeof link !== "string") return null;
  const s = link.trim();
  if (s.startsWith("t.me/")) return s;
  if (s.startsWith("@")) return "t.me/" + s.slice(1);
  if (s.startsWith("https://t.me/")) return "t.me/" + s.slice(13);
  if (s.startsWith("http://t.me/")) return "t.me/" + s.slice(12);
  // Bare username (no special chars)
  if (/^[a-zA-Z_]\w{2,30}$/.test(s)) return "t.me/" + s;
  return null;
}

/** Parse LLM output into chat objects, very forgiving */
function parseChats(raw: string): Array<{ title: string; tgLink: string; description: string; membersCount: number; category: string }> {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // Find JSON array
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) {
    console.error("[SEARCH] No JSON array found in:", cleaned.slice(0, 200));
    return [];
  }

  const jsonStr = cleaned.substring(start, end + 1);

  let parsed: any[];
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[SEARCH] JSON parse failed:", (e as Error).message);
    // Try to fix common issues: trailing commas
    try {
      parsed = JSON.parse(jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const chats: Array<{ title: string; tgLink: string; description: string; membersCount: number; category: string }> = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title || "").trim();
    const tgLink = normalizeTgLink(item.tgLink || item.link || item.username);
    if (!title || !tgLink) continue;

    chats.push({
      title,
      tgLink,
      description: String(item.description || "").trim(),
      membersCount: parseInt(item.membersCount || item.members || item.subscribers || "0", 10) || 0,
      category: String(item.category || item.cat || "").trim(),
    });
  }

  console.log(`[SEARCH] Parsed ${chats.length} valid chats from ${parsed.length} items`);
  return chats;
}

// Verify member counts via TG sender
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
      if (data.results) {
        for (const r of data.results) {
          if (r.link && r.members > 0) {
            result[r.link] = { title: r.title || "", members: r.members };
          }
        }
      }
    }
  } catch { /* TG sender not available */ }
  return result;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: "Кампания не найдена" }, { status: 404 });
    }

    const topic = campaign.topic || campaign.name;
    if (!topic?.trim()) {
      return NextResponse.json({ error: "Укажите тему кампании" }, { status: 400 });
    }

    const typeLabel =
      campaign.targetType === "bot" ? "бота"
        : campaign.targetType === "chat" ? "чата"
        : "канала";

    const systemPrompt = `Ты эксперт по Telegram-рекламе. Найди РЕАЛЬНЫЕ Telegram ГРУППЫ для рекламы.

ПРАВИЛА:
- Только группы/чаты (НЕ каналы и НЕ боты)
- Реальные группы, минимум 3000 участников
- tgLink в формате "t.me/username"
- membersCount — примерное реальное число участников

Ответь ТОЛЬКО JSON массив (без markdown):
[{"title":"Имя","tgLink":"t.me/name","description":"Описание на русском","membersCount":10000,"category":"Категория"}]

Верни 15 результатов.`;

    const userPrompt = `Найди 15 популярных Telegram ГРУПП по теме "${topic}" для рекламы ${typeLabel}.
Описание: ${campaign.description || "не указано"}.
Группы от 3000 до 500000 участников.`;

    const raw = await callLLM(systemPrompt, userPrompt, 3000);
    let chats = parseChats(raw);

    // If first attempt failed, try with simpler prompt
    if (chats.length === 0) {
      console.log("[SEARCH] First attempt empty, retrying with simpler prompt...");
      const simplePrompt = `Назови 15 популярных Telegram групп по теме "${topic}". Формат: JSON массив с полями title, tgLink (в формате t.me/name), description, membersCount, category.`;
      const raw2 = await callLLM(
        "Возвращай только JSON массив. Никакого markdown.",
        simplePrompt,
        2000
      );
      chats = parseChats(raw2);
    }

    if (chats.length === 0) {
      return NextResponse.json({ success: false, error: "Не удалось найти чаты. Попробуйте другую тему.", count: 0, chats: [] });
    }

    // Sort by members desc
    chats.sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0));

    // Verify via TG API if available
    const verified = await resolveMemberCounts(chats.map((c) => c.tgLink));

    const saved = [];
    for (const chat of chats) {
      const existing = await db.targetChat.findFirst({ where: { campaignId: id, tgLink: chat.tgLink } });
      if (existing) continue;

      const v = verified[chat.tgLink];
      try {
        const saved_chat = await db.targetChat.create({
          data: {
            campaignId: id,
            title: v?.title || chat.title,
            tgLink: chat.tgLink,
            description: chat.description || null,
            membersCount: v?.members || chat.membersCount || null,
            category: chat.category || null,
            status: "found",
          },
        });
        saved.push(saved_chat);
      } catch (e) {
        console.error("Save chat error:", e);
      }
    }

    return NextResponse.json({ success: true, count: saved.length, chats: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка поиска чатов";
    console.error("[SEARCH] Fatal:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}