import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const topic = campaign.topic || campaign.name;

  // Step 1: Web search for Telegram chats
  const zai = await ZAI.create();

  const searchQueries = [
    `Telegram чаты ${topic} реклама`,
    `Telegram группы ${topic} промоутер`,
    `Telegram каналы ${topic} для рекламы`,
    `купить рекламу Telegram ${topic} каталог`,
  ];

  const allResults: Array<{
    name: string;
    url: string;
    snippet: string;
    host_name: string;
  }> = [];

  for (const query of searchQueries) {
    try {
      const results = await zai.functions.invoke("web_search", {
        query,
        num: 10,
      });
      if (Array.isArray(results)) {
        for (const r of results) {
          allResults.push({
            name: r.name || "",
            url: r.url || "",
            snippet: r.snippet || "",
            host_name: r.host_name || "",
          });
        }
      }
    } catch (e) {
      console.error(`Search failed for "${query}":`, e);
    }
  }

  // Step 2: Use LLM to extract structured Telegram chat info
  const contextForLLM = allResults
    .slice(0, 30)
    .map((r, i) => `[${i + 1}] ${r.name}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `Ты эксперт по поиску Telegram чатов и каналов для рекламы. 
Тебе даны результаты веб-поиска. Извлеки из них конкретные Telegram чаты, каналы или группы, подходящие для размещения рекламы по теме "${topic}".

Верни ТОЛЬКО валидный JSON массив без markdown обёрток. Каждый элемент массива — объект:
{
  "title": "Название чата/канала",
  "tgLink": "ссылка на Telegram чат (t.me/...)",
  "description": "Краткое описание",
  "membersCount": примерное число участников (число),
  "category": "категория чата"
}

Если не можешь найти tgLink, используй URL из результатов поиска. 
Верни от 5 до 15 результатов. Важно: вернуть чистый JSON массив.`,
      },
      {
        role: "user",
        content: contextForLLM,
      },
    ],
    thinking: { type: "disabled" },
  });

  let extractedChats: Array<{
    title: string;
    tgLink: string;
    description: string;
    membersCount: number;
    category: string;
  }> = [];

  try {
    const raw = completion.choices[0]?.message?.content || "[]";
    // Clean potential markdown wrappers
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      extractedChats = parsed;
    }
  } catch (e) {
    console.error("Failed to parse LLM response:", e);
    // Fallback: create entries from search results
    extractedChats = allResults.slice(0, 10).map((r) => ({
      title: r.name,
      tgLink: r.url,
      description: r.snippet,
      membersCount: 0,
      category: "",
    }));
  }

  // Step 3: Save to database
  const chats = [];
  for (const chat of extractedChats) {
    if (!chat.title || !chat.tgLink) continue;
    const created = await db.targetChat.create({
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
    chats.push(created);
  }

  return NextResponse.json({
    success: true,
    count: chats.length,
    chats,
  });
}