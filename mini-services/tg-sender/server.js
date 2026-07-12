/**
 * Telegram Sender Mini-Service (Node.js)
 * Handles Telegram auth flow and message sending via GramJS (telegram npm package).
 * Runs as a separate process on port 3011 to avoid Next.js bundling issues.
 */

const http = require("http");
const path = require("path");

// Prisma needs the generated client — resolve from root
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PORT = Number(process.env.TG_SENDER_PORT || "3011");

// ─── Persistent state for auth flow ──────────────────────
let authClient = null;
let phoneCodeHash = "";

// ─── Helpers ─────────────────────────────────────────────
function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function getAccount() {
  return prisma.tgAccount.findFirst();
}

// ─── Telegram operations ─────────────────────────────────
async function tgConnect(apiId, apiHash, sessionStr) {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");
  const client = new TelegramClient(
    new StringSession(sessionStr || ""),
    apiId,
    apiHash,
    { connectionRetries: 3 }
  );
  await client.connect();
  return client;
}

async function handleGetStatus() {
  const account = await getAccount();
  if (!account) {
    return { connected: false, status: "none", phone: null };
  }

  const result = {
    connected: account.status === "connected",
    status: account.status,
    phone: account.phone,
    firstName: account.firstName,
    lastName: account.lastName,
    username: account.username,
  };

  // Verify the session is still valid
  if (account.status === "connected" && account.session) {
    try {
      const client = await tgConnect(account.apiId, account.apiHash, account.session);
      const me = await client.getMe();
      result.connected = true;
      result.firstName = me.firstName;
      result.lastName = me.lastName || null;
      result.username = me.username || null;
      await client.disconnect();
    } catch (e) {
      console.error("[TG] Session check failed:", e.message || e);
      await prisma.tgAccount.update({
        where: { id: account.id },
        data: { status: "disconnected", session: null, firstName: null, lastName: null, username: null },
      });
      result.connected = false;
      result.status = "disconnected";
    }
  }

  return result;
}

async function handleAuthStart(body) {
  const phone = String(body.phone || "").trim();
  const apiId = Number(body.apiId);
  const apiHash = String(body.apiHash || "").trim();

  if (!phone || !apiId || !apiHash) {
    return { success: false, error: "Заполните все поля" };
  }

  // Close existing auth client if any
  if (authClient) {
    try { await authClient.disconnect(); } catch { /* ignore */ }
    authClient = null;
  }

  try {
    // Save/Update account in DB
    const existing = await prisma.tgAccount.findFirst();
    if (existing) {
      await prisma.tgAccount.update({
        where: { id: existing.id },
        data: { phone, apiId, apiHash, status: "awaiting_code", session: null },
      });
    } else {
      await prisma.tgAccount.create({
        data: { phone, apiId, apiHash, status: "awaiting_code" },
      });
    }

    // Create client and send code
    authClient = await tgConnect(apiId, apiHash, "");
    const { Api } = require("telegram/tl");
    const result = await authClient.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({}),
      })
    );

    phoneCodeHash = result.phoneCodeHash;
    console.log(`[TG] Code sent to ${phone}, hash: ${phoneCodeHash.slice(0, 10)}...`);

    return { success: true, message: "Код отправлен в Telegram!" };
  } catch (e) {
    const msg = e.message || String(e);
    console.error("[TG] Auth start error:", msg);
    if (authClient) { try { await authClient.disconnect(); } catch { /* ignore */ } authClient = null; }
    return { success: false, error: msg };
  }
}

async function handleAuthVerify(body) {
  const code = String(body.code || "").trim();
  if (!code) {
    return { success: false, error: "Введите код" };
  }

  const account = await getAccount();
  if (!account) {
    return { success: false, error: "Сначала подключите аккаунт" };
  }

  if (!authClient || !phoneCodeHash) {
    return { success: false, error: "Сессия авторизации истекла. Попробуйте снова — нажмите «Получить код» заново." };
  }

  try {
    const { Api } = require("telegram/tl");

    const result = await authClient.invoke(
      new Api.auth.SignIn({
        phoneNumber: account.phone,
        phoneCodeHash,
        phoneCode: code,
      })
    );

    // Success — save session
    const sessionStr = authClient.session.save();
    const me = await authClient.getMe();

    await prisma.tgAccount.update({
      where: { id: account.id },
      data: {
        session: sessionStr,
        status: "connected",
        firstName: me.firstName,
        lastName: me.lastName || null,
        username: me.username || null,
      },
    });

    console.log(`[TG] Account connected: ${me.firstName} (@${me.username || "no-username"})`);

    await authClient.disconnect();
    authClient = null;
    phoneCodeHash = "";

    return {
      success: true,
      message: "Аккаунт подключён!",
      user: { firstName: me.firstName, lastName: me.lastName, username: me.username },
    };
  } catch (e) {
    const errName = e.constructor?.name || "";
    const errMsg = e.errorMessage || e.message || "";

    // Check for 2FA required
    if (errMsg === "SESSION_PASSWORD_NEEDED" || errName === "SessionPasswordNeededError") {
      await prisma.tgAccount.update({
        where: { id: account.id },
        data: { status: "awaiting_2fa" },
      });
      console.log("[TG] 2FA required");
      return { success: false, need2fa: true, error: "Требуется двухфакторная аутентификация" };
    }

    console.error("[TG] Verify error:", errMsg);

    // Clean up on other errors
    if (authClient) { try { await authClient.disconnect(); } catch { /* ignore */ } }
    authClient = null;
    phoneCodeHash = "";

    return { success: false, error: errMsg || "Ошибка верификации" };
  }
}

async function handleAuth2fa(body) {
  const password = String(body.password || "");
  if (!password) {
    return { success: false, error: "Введите пароль" };
  }

  const account = await getAccount();
  if (!account) {
    return { success: false, error: "Аккаунт не найден" };
  }

  if (!authClient) {
    return { success: false, error: "Сессия авторизации истекла. Попробуйте снова." };
  }

  try {
    const { Api } = require("telegram/tl");
    await authClient.invoke(new Api.auth.CheckPassword({ password }));

    const sessionStr = authClient.session.save();
    const me = await authClient.getMe();

    await prisma.tgAccount.update({
      where: { id: account.id },
      data: {
        session: sessionStr,
        status: "connected",
        firstName: me.firstName,
        lastName: me.lastName || null,
        username: me.username || null,
      },
    });

    console.log(`[TG] Account connected via 2FA: ${me.firstName}`);

    await authClient.disconnect();
    authClient = null;
    phoneCodeHash = "";

    return {
      success: true,
      message: "Аккаунт подключён!",
      user: { firstName: me.firstName, lastName: me.lastName, username: me.username },
    };
  } catch (e) {
    const msg = e.message || String(e);
    console.error("[TG] 2FA error:", msg);
    return { success: false, error: msg };
  }
}

async function handleSendMessage(body) {
  const chatUsername = String(body.chatUsername || "").trim();
  const text = String(body.text || "").trim();

  if (!chatUsername || !text) {
    return { success: false, error: "Укажите чат и текст" };
  }

  const account = await getAccount();
  if (!account || !account.session) {
    return { success: false, error: "Аккаунт не подключён" };
  }

  try {
    const client = await tgConnect(account.apiId, account.apiHash, account.session);

    const username = chatUsername
      .replace("https://t.me/", "")
      .replace("t.me/", "")
      .replace("@", "");

    const entity = await client.getEntity(username);
    await client.sendMessage(entity, { message: text });

    await client.disconnect();
    console.log(`[TG] Message sent to @${username}`);

    return { success: true, message: "Сообщение отправлено" };
  } catch (e) {
    const msg = e.message || String(e);
    console.error("[TG] Send error:", msg);
    return { success: false, error: msg };
  }
}

// Resolve multiple chat links → get real titles and member counts
async function handleResolve(body) {
  const links = body.links;
  if (!Array.isArray(links) || links.length === 0) {
    return { results: [] };
  }

  const account = await getAccount();
  if (!account || !account.session) {
    return { results: [] };
  }

  const results = [];

  try {
    const client = await tgConnect(account.apiId, account.apiHash, account.session);

    for (const link of links) {
      try {
        const username = String(link)
          .replace("https://t.me/", "")
          .replace("t.me/", "")
          .replace("@", "");

        const entity = await client.getEntity(username);

        let members = 0;
        if (entity.participantsCount) {
          members = entity.participantsCount;
        }

        // For channels/supergroups, fetch full info
        if (entity.className === "Channel" || entity.className === "ChannelFull") {
          try {
            const { Api } = require("telegram/tl");
            const full = await client.invoke(
              new Api.channels.GetFullChannel({ channel: entity })
            );
            if (full.fullChat?.participantsCount) {
              members = full.fullChat.participantsCount;
            }
          } catch { /* use default */ }
        }

        results.push({
          link,
          title: entity.title || username,
          members,
        });
      } catch (e) {
        // Chat not found or private — skip
        console.log(`[TG] Resolve failed for ${link}: ${e.message || e}`);
      }
    }

    await client.disconnect();
  } catch (e) {
    console.error("[TG] Resolve error:", e.message || e);
  }

  console.log(`[TG] Resolved ${results.length}/${links.length} chats`);
  return { results };
}

async function handleDisconnect() {
  if (authClient) {
    try { await authClient.disconnect(); } catch { /* ignore */ }
    authClient = null;
  }
  phoneCodeHash = "";

  const account = await getAccount();
  if (account) {
    await prisma.tgAccount.update({
      where: { id: account.id },
      data: {
        session: null,
        status: "disconnected",
        firstName: null,
        lastName: null,
        username: null,
      },
    });
  }

  console.log("[TG] Account disconnected");
  return { success: true, message: "Аккаунт отключён" };
}

// ─── HTTP Server ─────────────────────────────────────────
async function handleRequest(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    // GET /status
    if (method === "GET" && pathname === "/status") {
      const result = await handleGetStatus();
      return sendJson(res, result);
    }

    // GET /health
    if (method === "GET" && pathname === "/health") {
      return sendJson(res, { status: "ok" });
    }

    // POST /auth/start
    if (method === "POST" && pathname === "/auth/start") {
      const body = await readBody(req);
      const result = await handleAuthStart(body);
      return sendJson(res, result, result.success ? 200 : 400);
    }

    // POST /auth/verify
    if (method === "POST" && pathname === "/auth/verify") {
      const body = await readBody(req);
      const result = await handleAuthVerify(body);
      return sendJson(res, result, result.success ? 200 : 400);
    }

    // POST /auth/2fa
    if (method === "POST" && pathname === "/auth/2fa") {
      const body = await readBody(req);
      const result = await handleAuth2fa(body);
      return sendJson(res, result, result.success ? 200 : 400);
    }

    // POST /resolve
    if (method === "POST" && pathname === "/resolve") {
      const body = await readBody(req);
      const result = await handleResolve(body);
      return sendJson(res, result);
    }

    // POST /send
    if (method === "POST" && pathname === "/send") {
      const body = await readBody(req);
      const result = await handleSendMessage(body);
      return sendJson(res, result, result.success ? 200 : 500);
    }

    // DELETE /auth/disconnect
    if (method === "DELETE" && pathname === "/auth/disconnect") {
      const result = await handleDisconnect();
      return sendJson(res, result);
    }

    sendJson(res, { error: "Not found" }, 404);
  } catch (e) {
    const msg = e.message || String(e);
    console.error("[TG] Unhandled error:", msg);
    sendJson(res, { error: msg }, 500);
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[TG Sender] Service running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[TG Sender] Shutting down...");
  if (authClient) { try { await authClient.disconnect(); } catch { /* ignore */ } }
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[TG Sender] Interrupted, shutting down...");
  if (authClient) { try { await authClient.disconnect(); } catch { /* ignore */ } }
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});