import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK_INTERVAL = 15000;

async function sendViaTelegram(chatLink: string, text: string, apiId: number, apiHash: string, session: string) {
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 2,
  });
  await client.connect();

  try {
    const username = chatLink.replace("https://t.me/", "").replace("t.me/", "").replace("@", "");
    const entity = await client.getEntity(username);
    await client.sendMessage(entity, { message: text });
  } finally {
    await client.disconnect();
  }
}

async function processPendingSends() {
  const now = new Date();

  const pendingLogs = await prisma.sendLog.findMany({
    where: { status: "pending", scheduledAt: { lte: now } },
    include: { campaign: true, targetChat: true, adPost: true },
  });

  for (const log of pendingLogs) {
    try {
      const chatLink = log.targetChat?.tgLink;
      const adText = log.adPost?.content;
      if (!chatLink || !adText) throw new Error("Нет чата или текста");

      // Get connected account
      const account = await prisma.tgAccount.findFirst({
        where: { status: "connected", session: { not: null } },
      });
      if (!account?.session) throw new Error("Telegram аккаунт не подключён");

      console.log(`[SEND] "${log.campaign.name}" → ${chatLink}`);
      await sendViaTelegram(chatLink, adText, account.apiId, account.apiHash, account.session);

      await prisma.sendLog.update({
        where: { id: log.id },
        data: { status: "sent", sentAt: new Date() },
      });
      if (log.adPostId) {
        await prisma.adPost.update({ where: { id: log.adPostId }, data: { status: "sent" } });
      }
      console.log(`  ✓ Отправлено`);
    } catch (error) {
      console.error(`  ✗ Ошибка:`, error);
      await prisma.sendLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMsg: String(error) },
      });
    }
  }

  // Auto-complete campaigns with no pending logs
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "active" },
    include: { sendLogs: { where: { status: "pending" }, select: { id: true } } },
  });

  for (const c of activeCampaigns) {
    if (c.sendLogs.length === 0) {
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "completed" } });
      console.log(`[COMPLETE] "${c.name}"`);
    }
  }
}

async function main() {
  console.log("Scheduler started");
  await processPendingSends();
  setInterval(async () => {
    try { await processPendingSends(); } catch (e) { console.error("Scheduler:", e); }
  }, CHECK_INTERVAL);
}

main().catch(console.error);