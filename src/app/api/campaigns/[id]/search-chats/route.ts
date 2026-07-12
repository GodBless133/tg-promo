import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 120;

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY не настроен. Добавьте ключ в переменные окружения Railway.");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API ошибка ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
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

    const systemPrompt = `Ты эксперт по поиску Telegram каналов и чатов для рекламы.
Твоя задача — предложить реальные или правдоподобные Telegram каналы/чаты по заданной тематике.

ПРАВИЛА:
- tgLink ВСЕГДА начинается с "t.me/"
- membersCount — реалистичное число от 500 до 100000
- description — 1-2 предложения на русском, что это за канал
- category — категория на русском

Формат ответа — ТОЛЬКО JSON массив без markdown, без комментариев:
[{"title":"Имя канала","tgLink":"t.me/example","description":"Описание канала","membersCount":5000,"category":"Категория"}]

Верни 4-8 результатов. Если знаешь реальные популярные каналы по теме — используй их.`;

    const userPrompt = `Найди Telegram каналы и чаты для размещения рекламы по теме: "${topic}".
Тип рекламируемого ресурса: ${campaign.targetType === "bot" ? "бот" : campaign.targetType === "chat" ? "чат" : "канал"}.
Описание: ${campaign.description || "не указано"}.

Предложи подходящие каналы/чаты для размещения рекламы.`;

    const raw = await callLLM(systemPrompt, userPrompt);
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
        error: "Не удалось найти каналы. Попробуйте другую тему.",
        count: 0,
        chats: [],
      });
    }

    // Save to DB, skip duplicates
    const saved = [];
    for (const chat of chats) {
      const existing = await db.targetChat.findFirst({
        where: { campaignId: id, tgLink: chat.tgLink },
      });
      if (existing) continue;

      try {
        const saved_chat = await db.targetChat.create({
          data: {
            campaignId: id,
            title: chat.title,
            tgLink: chat.tgLink,
            description: chat.description || null,
            membersCount: chat.membersCount || null,
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
    const message = e instanceof Error ? e.message : "Ошибка поиска каналов";
    console.error("Search chats error:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}