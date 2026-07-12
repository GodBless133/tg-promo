const http = require("node:http");

async function main() {
  let ZAI;
  try {
    ZAI = (await import("z-ai-web-dev-sdk")).default;
    console.log("ZAI SDK loaded");
  } catch (e) {
    console.error("Failed to load SDK:", e);
    process.exit(1);
  }

  let zai = null;

  async function getZAI() {
    if (!zai) {
      zai = await ZAI.create();
      console.log("ZAI instance created");
    }
    return zai;
  }

  function json(res, data, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  }

  async function handleSearchChats(body) {
    const { topic } = body;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return { error: "Укажите тему кампании" };
    }

    console.log("Starting chat search for:", topic);
    const ai = await getZAI();

    const searchQueries = [
      `site:t.me ${topic} чат канал`,
      `Telegram каналы ${topic} реклама каталог t.me`,
      `лучшие Telegram чаты ${topic} список`,
    ];

    const allResults = [];

    for (const query of searchQueries) {
      try {
        console.log("Searching:", query);
        const results = await ai.functions.invoke("web_search", { query, num: 8 });
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
        console.log("Got", results?.length || 0, "results");
      } catch (e) {
        console.error("Search failed:", e.message);
      }
    }

    const seenUrls = new Set();
    const uniqueResults = allResults.filter((r) => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    console.log("Unique results:", uniqueResults.length);

    if (uniqueResults.length === 0) {
      return { success: false, error: "Не удалось найти результаты", count: 0, chats: [] };
    }

    // LLM extraction
    const contextForLLM = uniqueResults
      .slice(0, 20)
      .map((r, i) => `[${i + 1}] ${r.name}\nURL: ${r.url}\n${r.snippet}`)
      .join("\n\n");

    let extractedChats = [];

    try {
      console.log("Calling LLM for extraction...");
      const completion = await ai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: `Ты эксперт по поиску Telegram чатов и каналов для рекламы.
Анализируй результаты и извлекай ТОЛЬКО реальные Telegram чаты/каналы.

ПРАВИЛА:
- tgLink ВСЕГДА должен начинаться с t.me/ или https://t.me/
- Если нет точной t.me ссылки, ПРОПУСТИ
- membersCount — число (от 500 до 50000)
- title — только название канала/чата
- description — 1 предложение на русском

Формат — ТОЛЬКО JSON массив без markdown:
[{"title":"Название","tgLink":"t.me/name","description":"Описание","membersCount":5000,"category":"Категория"}]

Верни от 3 до 8 результатов.`,
          },
          { role: "user", content: contextForLLM },
        ],
        thinking: { type: "disabled" },
      });

      const raw = completion.choices[0]?.message?.content || "[]";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        extractedChats = parsed.filter(
          (c) => c.title && c.title.length > 0 && c.tgLink && c.tgLink.includes("t.me")
        );
      }
      console.log("Extracted", extractedChats.length, "chats");
    } catch (e) {
      console.error("LLM extraction failed:", e.message);
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

  async function handleGenerateAds(body) {
    const { topic, name, targetUrl, targetType, description, count = 3 } = body;
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return { error: "Укажите тему кампании" };
    }

    const numCount = Math.min(Math.max(Number(count) || 3, 1), 10);
    const targetTypeLabel = targetType === "bot" ? "бота" : targetType === "chat" ? "чата" : "канала";

    console.log("Generating ads for:", topic);
    const ai = await getZAI();

    let adTexts = [];

    try {
      const completion = await ai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: `Ты — профессиональный копирайтер для Telegram-рекламы.
Тематика: ${topic}
Рекламируемый ресурс: ${targetUrl || "не указана"}
Тип ресурса: Telegram ${targetTypeLabel}
Описание: ${description || "без описания"}

Правила:
- Краткий текст (3-8 предложений)
- Эмодзи умеренно (2-4 штуки)
- Убедительный CTA
${targetUrl ? `- Упомяни ссылку: ${targetUrl}` : ""}
- Дружелюбный стиль

Сгенерируй ${numCount} вариантов.
Верни ТОЛЬКО JSON массив строк без markdown.`,
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
        adTexts = parsed.filter((t) => typeof t === "string" && t.trim().length > 0);
      }
    } catch (e) {
      console.error("LLM generation failed:", e.message);
      adTexts = [`🔥 ${topic} — узнай больше! ${targetUrl || "Переходи по ссылке"}. Не пропусти! 👀`];
    }

    if (adTexts.length === 0) {
      return { error: "Не удалось сгенерировать тексты" };
    }

    return { success: true, count: adTexts.length, texts: adTexts };
  }

  const server = http.createServer(async (req, res) => {
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
      json(res, { status: "ok" });
      return;
    }

    if (req.method === "POST" && req.url === "/search-chats") {
      try {
        const body = await readBody(req);
        console.log("Search request received:", JSON.stringify(body).slice(0, 100));
        const result = await handleSearchChats(body);
        console.log("Search result:", result.count || 0, "chats");
        json(res, result, result.error && !result.success ? 400 : 200);
      } catch (e) {
        console.error("Search error:", e);
        json(res, { error: e.message }, 500);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/generate-ads") {
      try {
        const body = await readBody(req);
        console.log("Generate request received");
        const result = await handleGenerateAds(body);
        console.log("Generate result:", result.count || 0, "texts");
        json(res, result, result.error && !result.success ? 500 : 200);
      } catch (e) {
        console.error("Generate error:", e);
        json(res, { error: e.message }, 500);
      }
      return;
    }

    json(res, { error: "Not found" }, 404);
  });

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
      });
      req.on("error", reject);
    });
  }

  server.listen(3010, () => {
    console.log("AI Service running on port 3010");
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});