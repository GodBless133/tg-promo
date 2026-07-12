const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const Database = require("better-sqlite3");
const path = require("node:path");

const execFileAsync = promisify(execFile);
const PORT = 3010;
const DB_PATH = path.resolve(__dirname, "../../db/custom.db");

let db;

function initDb() {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  console.log("DB connected:", DB_PATH);
}

function runFunction(name, args) {
  return execFileAsync("z-ai", ["function", "-n", name, "-a", JSON.stringify(args)], {
    timeout: 120000,
  }).then(({ stdout }) => {
    const cleaned = stdout
      .split("\n")
      .filter((line) => !/[\u{1F680}\u{1F389}\u{2705}\u{2764}\u{1F4AA}]/u.test(line))
      .join("\n")
      .trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      return cleaned.substring(start, end + 1);
    }
    return cleaned;
  });
}

function runChat(promptText, systemText) {
  const { spawn } = require("node:child_process");
  const fs = require("node:fs");
  const os = require("node:os");

  return new Promise((resolve, reject) => {
    // Write prompt and system to temp files
    const tmpDir = os.tmpdir();
    const ts = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const promptFile = `${tmpDir}/zai_p_${ts}.txt`;
    const sysFile = `${tmpDir}/zai_s_${ts}.txt`;
    fs.writeFileSync(promptFile, promptText, "utf-8");
    if (systemText) fs.writeFileSync(sysFile, systemText, "utf-8");

    // Build command with file reading
    const sysPart = systemText ? ` -s "$(cat '${sysFile}')"` : "";
    const cmd = `z-ai chat -p "$(cat '${promptFile}')"${sysPart}`;

    console.log("Running chat, prompt size:", promptText.length, "sys size:", systemText?.length || 0);

    const child = spawn("bash", ["-c", cmd], {
      timeout: 120000,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      // Cleanup
      try { fs.unlinkSync(promptFile); } catch (e) {}
      try { if (systemText) fs.unlinkSync(sysFile); } catch (e) {}

      if (code !== 0) {
        console.error("z-ai chat exit code:", code, "stderr:", stderr.slice(0, 200));
        reject(new Error(stderr || `z-ai chat failed with code ${code}`));
        return;
      }

      const cleaned = stdout
        .split("\n")
        .filter((line) => !/[\u{1F680}\u{1F389}\u{2705}\u{2764}\u{1F4AA}]/u.test(line))
        .join("\n")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        const content = parsed.choices?.[0]?.message?.content;
        if (content) {
          resolve(content);
          return;
        }
      } catch (e) {
        console.error("JSON parse fail:", e.message, "cleaned len:", cleaned.length);
      }
      resolve(cleaned);
    });

    child.on("error", (err) => {
      try { fs.unlinkSync(promptFile); } catch (e) {}
      try { if (systemText) fs.unlinkSync(sysFile); } catch (e) {}
      reject(err);
    });
  });
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function generateId() {
  // Simple CUID-like ID
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const counter = process.pid.toString(36);
  return `c${timestamp}${random}${counter}`;
}

async function handleSearchChats(body) {
  const { campaignId } = body;
  if (!campaignId) return { error: "Укажите кампанию" };

  // Get campaign from DB
  const campaign = db.prepare("SELECT id, name, topic, status FROM Campaign WHERE id = ?").get(campaignId);
  if (!campaign) return { error: "Кампания не найдена" };

  const topic = campaign.topic || campaign.name;
  if (!topic || topic.trim().length === 0) {
    return { error: "Укажите тему кампании" };
  }

  console.log("Search for:", topic);

  const queries = [
    `site:t.me ${topic} чат канал`,
    `Telegram каналы ${topic} реклама каталог t.me`,
    `лучшие Telegram чаты ${topic} список`,
  ];

  const all = [];
  for (const q of queries) {
    try {
      const out = await runFunction("web_search", { query: q, num: 8 });
      const results = JSON.parse(out);
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.name && r.url) all.push({ name: r.name, url: r.url, snippet: r.snippet || "", host_name: r.host_name || "" });
        }
      }
    } catch (e) { console.error("Search fail:", e.message); }
  }

  const seen = new Set();
  const unique = all.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

  if (unique.length === 0) return { success: false, error: "Ничего не найдено", count: 0, chats: [] };

  const ctx = unique.slice(0, 20).map((r, i) => `[${i+1}] ${r.name}\nURL: ${r.url}\n${r.snippet}`).join("\n\n");

  let chats = [];
  try {
    const sysPrompt = `Ты эксперт по поиску Telegram чатов. Извлеки реальные каналы.
ПРАВИЛА: tgLink начинается с t.me/. membersCount — число 500-50000. description — 1 предложение.
Формат — ТОЛЬКО JSON массив без markdown:
[{"title":"Имя","tgLink":"t.me/x","description":"...","membersCount":5000,"category":"..."}]
Верни 3-8 результатов.`;

    const raw = await runChat(`Извлеки Telegram каналы:\n\n${ctx}`, sysPrompt);
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      chats = parsed.filter(c => c.title && c.tgLink && c.tgLink.includes("t.me"));
    }
  } catch (e) {
    console.error("LLM fail:", e.message);
    chats = unique.slice(0, 8).map(r => ({
      title: r.name.replace(/[-|].*$/, "").trim(),
      tgLink: r.url.includes("t.me") ? r.url : "t.me/unknown",
      description: r.snippet.slice(0, 150),
      membersCount: 0, category: "",
    }));
  }

  // Save to DB
  const insert = db.prepare(`INSERT INTO TargetChat (id, campaignId, title, tgLink, description, membersCount, category, status, foundAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'found', datetime('now'))`);

  const checkExists = db.prepare("SELECT id FROM TargetChat WHERE campaignId = ? AND tgLink = ?");

  const saved = [];
  for (const chat of chats) {
    if (!chat.title || !chat.tgLink) continue;
    const existing = checkExists.get(campaignId, chat.tgLink);
    if (existing) continue;
    try {
      const id = generateId();
      insert.run(id, campaignId, chat.title, chat.tgLink, chat.description || null, chat.membersCount || null, chat.category || null);
      saved.push({ id, campaignId, title: chat.title, tgLink: chat.tgLink, description: chat.description, membersCount: chat.membersCount, category: chat.category, status: "found" });
    } catch (e) { console.error("Save fail:", e.message); }
  }

  return { success: true, count: saved.length, chats: saved };
}

async function handleGenerateAds(body) {
  const { campaignId, count = 3 } = body;

  if (!campaignId) return { error: "Укажите кампанию" };

  const campaign = db.prepare("SELECT * FROM Campaign WHERE id = ?").get(campaignId);
  if (!campaign) return { error: "Кампания не найдена" };

  const topic = campaign.topic || campaign.name;
  if (!topic || topic.trim().length === 0) return { error: "Укажите тему" };

  const n = Math.min(Math.max(Number(count) || 3, 1), 10);
  const typeLabel = campaign.targetType === "bot" ? "бота" : campaign.targetType === "chat" ? "чата" : "канала";

  console.log("Generate ads for:", topic);

  const sysPrompt = `Ты — копирайтер для Telegram-рекламы. Краткий текст (3-8 предложений), 2-4 эмодзи, CTA. Верни ТОЛЬКО JSON массив строк без markdown.`;
  const prompt = `Тема: ${topic}\nРесурс: ${campaign.targetUrl || "не указан"}\nТип: Telegram ${typeLabel}\nОписание: ${campaign.description || "нет"}\n${campaign.targetUrl ? `Ссылка: ${campaign.targetUrl}\n` : ""}Сгенерируй ${n} вариантов рекламы для "${campaign.name}".`;

  let texts = [];
  try {
    const raw = await runChat(prompt, sysPrompt);
    let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Try to extract JSON array from the text
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) texts = parsed.filter(t => typeof t === "string" && t.trim().length > 0);
  } catch (e) {
    console.error("Gen fail:", e.message);
    texts = [`🔥 ${topic} — узнай больше! ${campaign.targetUrl || "Переходи по ссылке"}. Не пропусти! 👀`];
  }

  if (texts.length === 0) return { error: "Не удалось сгенерировать" };

  // Get next variant number
  const maxVariant = db.prepare("SELECT MAX(variant) as v FROM AdPost WHERE campaignId = ?").get(campaignId);
  let nextVariant = (maxVariant?.v || 0) + 1;

  const insert = db.prepare(`INSERT INTO AdPost (id, campaignId, content, variant, status, createdAt) VALUES (?, ?, ?, ?, 'generated', datetime('now'))`);

  const saved = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      const id = generateId();
      insert.run(id, campaignId, texts[i], nextVariant + i);
      saved.push({ id, campaignId, content: texts[i], variant: nextVariant + i, status: "generated" });
    } catch (e) { console.error("Save fail:", e.message); }
  }

  return { success: true, count: saved.length, posts: saved };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") { json(res, { status: "ok" }); return; }

  if (req.method === "POST" && req.url === "/search-chats") {
    try {
      const body = await readBody(req);
      const result = await handleSearchChats(body);
      json(res, result, result.error && !result.success ? 400 : 200);
    } catch (e) { console.error("Search error:", e); json(res, { error: e.message }, 500); }
    return;
  }

  if (req.method === "POST" && req.url === "/generate-ads") {
    try {
      const body = await readBody(req);
      const result = await handleGenerateAds(body);
      json(res, result, result.error && !result.success ? 500 : 200);
    } catch (e) { console.error("Generate error:", e); json(res, { error: e.message }, 500); }
    return;
  }

  json(res, { error: "Not found" }, 404);
});

initDb();
server.listen(PORT, () => console.log("AI Service on :" + PORT));