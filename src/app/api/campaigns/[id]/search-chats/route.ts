import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 120;

const DEFAULT_BASE_URL = "https://text.pollinations.ai/openai";

// Different models to try as fallbacks
const FALLBACK_MODELS = ["openai", "mistral", "claude-hybridspace", "qwen"];

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = 3000): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || (apiKey ? "https://api.openai.com/v1" : DEFAULT_BASE_URL);
  const models = apiKey ? [process.env.OPENAI_MODEL || "gpt-4o-mini"] : FALLBACK_MODELS;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

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
          console.error(`[LLM] ${model} returned ${res.status}`);
          break; // try next model
        }

        const text = await res.text();
        if (!text || !text.trim()) {
          console.error(`[LLM] ${model} returned empty body`);
          break;
        }

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`[LLM] ${model} returned invalid JSON`);
          break;
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content || !content.trim()) {
          console.error(`[LLM] ${model} returned empty content`);
          continue; // retry with same model
        }

        return content;
      } catch (e: any) {
        if (e.name === "AbortError") {
          console.error(`[LLM] ${model} timed out`);
          break;
        }
        console.error(`[LLM] ${model} error:`, e.message);
        break;
      }
    }
  }

  throw new Error("ИИ временно недоступен. Попробуйте через 30 секунд.");
}

// Try to resolve real member counts via TG sender service
async function resolveMemberCounts(links: string[]): Promise<Record<string, { title: string; members: number }>> {
  const result: Record<string, { title: string; members: number }> = {};

  try {
    const res = await fetch("http://localhost:3011/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
      signal: AbortSignal.timeout(30000), // 30s timeout
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
  } catch {
    // TG sender not available — use AI estimates
  }

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
    if (!topic || topic.trim().length === 0) {
      return NextResponse.json({ error: "Укажите тему кампании" }, { status: 400 });
    }

    const typeLabel =
      campaign.targetType === "bot"
        ? "бота"
        : campaign.targetType === "chat"
          ? "чата"
          : "канала";

    const systemPrompt = `Ты эксперт по Telegram-рекламе. Твоя задача — найти РЕАЛЬНЫЕ Telegram ГРУППЫ И ЧАТЫ (НЕ каналы!) для размещения рекламы.

ВАЖНЫЕ ПРАВИЛА:
1. Ищи ТОЛЬКО группы и чаты (где пользователи могут писать), НЕ каналы (где только админ публикует)
2. Все группы должны быть РЕАЛЬНЫМИ — используй свои знания о популярных Telegram группах
3. Минимум участников: 3 000. Предпочтительно 10 000+ и 50 000+
4. Разнообразь: большие (50к-500к), средние (10к-50к) и маленькие (3к-10к)
5. tgLink — ВСЕГДА в формате "t.me/username" (без @, без https://)
6. membersCount — ориентируйся на реальное количество участников

Формат ответа — ТОЛЬКО JSON массив без markdown, без комментариев, без обёрток:
[{"title":"Название группы","tgLink":"t.me/example_chat","description":"Краткое описание на русском — для кого эта группа","membersCount":25000,"category":"Категория"}]

Верни 15-20 результатов. Если не знаешь достаточно групп по теме — заполни максимально возможное количество (минимум 10).`;

    const userPrompt = `Найди популярные Telegram ГРУППЫ И ЧАТЫ для размещения рекламы по теме: "${topic}".
Рекламируемый ресурс: ${typeLabel}.
Описание: ${campaign.description || "не указано"}.

Найди реальные, популярные группы где много активных участников. Включи группы разного размера — от 3 000 до 500 000 участников. Группы должны быть тематически релевантны для "${topic}".`;

    const raw = await callLLM(systemPrompt, userPrompt, 4000);
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let chats: Array<{
      title: string;
      tgLink: string;
      description: string;
      membersCount: number;
      category: string;
    }> = [];

    try {
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const jsonStr = cleaned.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          chats = parsed.filter(
            (c: Record<string, unknown>) =>
              c.title && c.tgLink && String(c.tgLink).includes("t.me")
          );
        }
      }
    } catch {
      console.error("JSON parse error for search results");
    }

    if (chats.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Не удалось найти чаты. Попробуйте другую тему.",
        count: 0,
        chats: [],
      });
    }

    // Sort by member count descending (largest first)
    chats.sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0));

    // Try to verify member counts via TG API
    const links = chats.map((c) => c.tgLink);
    const verified = await resolveMemberCounts(links);

    const saved = [];
    for (const chat of chats) {
      const existing = await db.targetChat.findFirst({
        where: { campaignId: id, tgLink: chat.tgLink },
      });
      if (existing) continue;

      // Use verified member count if available
      const v = verified[chat.tgLink];
      const membersCount = v ? v.members : (chat.membersCount || null);
      const title = v && v.title ? v.title : chat.title;

      try {
        const saved_chat = await db.targetChat.create({
          data: {
            campaignId: id,
            title,
            tgLink: chat.tgLink,
            description: chat.description || null,
            membersCount,
            category: chat.category || null,
            status: "found",
          },
        });
        saved.push(saved_chat);
      } catch (e) {
        console.error("Save chat error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      count: saved.length,
      chats: saved,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка поиска чатов";
    console.error("Search chats error:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}