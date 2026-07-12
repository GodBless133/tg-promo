import http from "node:http";
import ZAI from "z-ai-web-dev-sdk";

const PORT = 3010;

let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zai) {
    zai = await ZAI.create();
  }
  return zai;
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

async function handleSearchChats(body: Record<string, unknown>) {
  const { topic } = body;
  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return { error: "Укажите тему кампании" };
  }

  const zai = await getZAI();

  // Step 1: Web search - 3 focused queries
  const searchQueries = [
    `site:t.me ${topic} чат канал`,
    `Telegram каналы ${topic} реклама каталог t.me`,
    `лучшие Telegram чаты ${topic} список`,
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
        num: 8,
      });
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.name && r.url) {
            allResults.push({
              name: r.name,
              url: r.url,
              snippet: r.snippet || "",
              host_name: r.host_name || "",
            });
          }
        }
      }
    } catch (e) {
      console.error(`Search failed for "${query}":`, e);
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueResults = allResults.filter((r) => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });

  if (uniqueResults.length === 0) {
    return { success: false, error: "Не удалось найти результаты по данной теме", count: 0, chats: [] };
  }

  // Step 2: Use LLM to extract structured Telegram chat info
  const contextForLLM = uniqueResults
    .slice(0, 20)
    .map((r, i) => `[${i + 1}] ${r.name}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");

  let extractedChats: Array<{
    title: string;
    tgLink: string;
    description: string;
    membersCount: number;
    category: string;
  }> = [];

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `Ты эксперт по поиску Telegram чатов и каналов для рекламы.
Анализируй результаты веб-поиска и извлекай ТОЛЬКО реальные Telegram чаты/каналы.

ПРАВИЛА:
- tgLink ВСЕГДА должен начинаться с t.me/ или https://t.me/
- Если в результатах нет точной t.me ссылки, ПРОПУСТИ этот результат
- membersCount — число (оцени примерно от 500 до 50000)
- title — только название канала/чата, без лишнего текста
- description — 1 предложение на русском

Формат ответа — ТОЛЬКО JSON массив без markdown:
[{"title":"Название","tgLink":"t.me/name","description":"Описание","membersCount":5000,"category":"Категория"}]

Верни от 3 до 8 результатов с валидными t.me ссылками.`,
        },
        {
          role: "user",
          content: contextForLLM,
        },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      extractedChats = parsed.filter(
        (c: { title?: string; tgLink?: string }) =>
          c.title && c.title.length > 0 && c.tgLink && c.tgLink.length > 0 && c.tgLink.includes("t.me")
      );
    }
  } catch (e) {
    console.error("LLM extraction failed, using raw results:", e);
    extractedChats = uniqueResults.slice(0, 8).map((r) => ({
      title: r.name.replace(/[-|].*$/, "").trim(),
      tgLink: r.url.includes("t.me") ? r.url : `t.me/${r.host_name.replace("t.me/", "")}`,
      description: r.snippet.slice(0, 150),
      membersCount: 0,
      category: "",
    }));
  }

  return { success: true, count: extractedChats.length, chats: extractedChats };
}

async function handleGenerateAds(body: Record<string, unknown>) {
  const { topic, name, targetUrl, targetType, description, count = 3 } = body;

  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return { error: "Укажите тему кампании" };
  }

  const numCount = Math.min(Math.max(Number(count) || 3, 1), 10);
  const targetTypeLabel =
    targetType === "bot" ? "бота" : targetType === "chat" ? "чата" : "канала";

  const zai = await getZAI();

  let adTexts: string[] = [];

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `Ты — профессиональный копирайтер для Telegram-рекламы.
Напиши привлекательный рекламный текст.

Тематика: ${topic}
Рекламируемый ресурс: ${targetUrl || "не указана"}
Тип ресурса: Telegram ${targetTypeLabel}
Описание: ${description || "без описания"}

Правила:
- Краткий и цепляющий текст (3-8 предложений)
- Эмодзи умеренно (2-4 штуки)
- Убедительный призыв к действию (CTA)
${targetUrl ? `- Упомяни ссылку: ${targetUrl}` : ""}
- Дружелюбный, ненавязчивый стиль
- Адаптирован для Telegram

Сгенерируй ${numCount} уникальных вариантов.
Верни ТОЛЬКО JSON массив строк без markdown. Каждая строка — один текст.`,
        },
        {
          role: "user",
          content: `Сгенерируй ${numCount} вариантов рекламы для Telegram ${targetTypeLabel} "${name || "проект"}" по теме "${topic}".`,
        },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      adTexts = parsed.filter((t: unknown) => typeof t === "string" && t.trim().length > 0);
    }
  } catch (e) {
    console.error("LLM generation failed:", e);
    adTexts = [
      `🔥 ${topic} — узнай больше! ${targetUrl || "Переходи по ссылке"}. Не пропусти! 👀`,
    ];
  }

  if (adTexts.length === 0) {
    return { error: "Не удалось сгенерировать тексты. Попробуйте ещё раз." };
  }

  return { success: true, count: adTexts.length, texts: adTexts };
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, { status: "ok", service: "ai-service" });
    return;
  }

  if (req.method === "POST" && req.url === "/search-chats") {
    try {
      const body = await readBody(req);
      const result = await handleSearchChats(body);
      const status = result.error && !result.success ? 400 : 200;
      json(res, result, status);
    } catch (e) {
      console.error("Search error:", e);
      json(res, { error: `Ошибка поиска: ${e instanceof Error ? e.message : "неизвестная ошибка"}` }, 500);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/generate-ads") {
    try {
      const body = await readBody(req);
      const result = await handleGenerateAds(body);
      const status = result.error && !result.success ? 500 : 200;
      json(res, result, status);
    } catch (e) {
      console.error("Generate error:", e);
      json(res, { error: `Ошибка генерации: ${e instanceof Error ? e.message : "неизвестная ошибка"}` }, 500);
    }
    return;
  }

  json(res, { error: "Not found" }, 404);
});

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(`AI Service running on port ${PORT}`);
});