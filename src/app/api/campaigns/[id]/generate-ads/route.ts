import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const count = body.count || 3;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const zai = await ZAI.create();

  const existingPosts = await db.adPost.findMany({
    where: { campaignId: id },
    orderBy: { variant: "desc" },
    select: { variant: true, content: true },
  });
  const nextVariant = (existingPosts[0]?.variant || 0) + 1;

  const targetTypeLabel =
    campaign.targetType === "bot"
      ? "бота"
      : campaign.targetType === "chat"
      ? "чата"
      : "канала";

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `Ты — профессиональный копирайтер для Telegram-рекламы. 
Твоя задача — написать привлекательный рекламный текст.

Тематика: ${campaign.topic || campaign.name}
Рекламируемый ресурс: ${campaign.targetUrl}
Тип ресурса: Telegram ${targetTypeLabel}
Описание: ${campaign.description || "без описания"}

Правила:
- Текст должен быть кратким и цепляющим (3-8 предложений)
- Используй эмодзи умеренно (2-4 штуки)
- Убедительный призыв к действию (CTA)
- Упомяни ссылку: ${campaign.targetUrl}
- Стиль: дружелюбный, ненавязчивый
- Адаптирован для Telegram формата

Сгенерируй ${count} уникальных вариантов рекламного текста.
Верни ТОЛЬКО валидный JSON массив строк, каждая строка — один вариант текста. Без markdown обёрток.`,
      },
      {
        role: "user",
        content: `Сгенерируй ${count} вариантов рекламного текста для Telegram ${targetTypeLabel} "${campaign.name}" по теме "${campaign.topic || campaign.name}".`,
      },
    ],
    thinking: { type: "disabled" },
  });

  let adTexts: string[] = [];
  try {
    const raw = completion.choices[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      adTexts = parsed.filter((t: unknown) => typeof t === "string" && t.length > 0);
    }
  } catch (e) {
    console.error("Failed to parse ad texts:", e);
    adTexts = [completion.choices[0]?.message?.content || "Не удалось сгенерировать текст"];
  }

  const posts = [];
  for (let i = 0; i < adTexts.length; i++) {
    const post = await db.adPost.create({
      data: {
        campaignId: id,
        content: adTexts[i],
        variant: nextVariant + i,
        status: "generated",
      },
    });
    posts.push(post);
  }

  return NextResponse.json({ success: true, count: posts.length, posts });
}