import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 60;

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
      temperature: 0.8,
      max_tokens: 1500,
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
    const body = await req.json();
    const count = Math.min(Math.max(body.count || 3, 1), 10);

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

    const systemPrompt = `Ты — профессиональный копирайтер для Telegram-рекламы.
Правила:
- Текст 3-8 предложений
- Используй 2-4 эмодзи (не больше)
- Обязательно добавь призыв к действию (CTA)
- Текст должен быть привлекательным и продающим
- Верни ТОЛЬКО JSON массив строк (каждая строка — отдельный вариант рекламы)
- Без markdown, без комментариев`;

    const userPrompt = `Тема: ${topic}
Рекламируемый ресурс: ${campaign.targetUrl || "не указан"}
Тип: Telegram ${typeLabel}
Описание: ${campaign.description || "нет"}

Сгенерируй ${count} вариантов рекламы для "${campaign.name}".${campaign.targetUrl ? ` Ссылка: ${campaign.targetUrl}` : ""}`;

    const raw = await callLLM(systemPrompt, userPrompt);
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let texts: string[] = [];

    try {
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start !== -1 && end > start) {
        const jsonStr = cleaned.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          texts = parsed.filter(
            (t: unknown) => typeof t === "string" && t.trim().length > 0
          );
        }
      }
    } catch {
      console.error("JSON parse error for ad texts");
    }

    if (texts.length === 0) {
      return NextResponse.json({
        error: "Не удалось сгенерировать тексты. Попробуйте ещё раз.",
      }, { status: 500 });
    }

    // Get next variant number
    const maxVariant = await db.adPost.aggregate({
      where: { campaignId: id },
      _max: { variant: true },
    });
    let nextVariant = (maxVariant._max.variant || 0) + 1;

    const saved = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        const post = await db.adPost.create({
          data: {
            campaignId: id,
            content: texts[i],
            variant: nextVariant + i,
            status: "generated",
          },
        });
        saved.push(post);
      } catch (e) {
        console.error("Save ad error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      count: saved.length,
      posts: saved,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка генерации текстов";
    console.error("Generate ads error:", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}