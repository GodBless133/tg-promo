import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK_INTERVAL = 15000;
const TG_PORT = 3011;

async function sendViaTelegram(chatLink: string, text: string) {
  const res = await fetch(`http://localhost:${TG_PORT}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatUsername: chatLink, text }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Send failed");
  return data;
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
      await sendViaTelegram(chatLink, adText);

      await prisma.sendLog.update({
        where: { id: log.id },
        data: { status: "sent", sentAt: new Date() },
      });
      if (log.adPostId) {
        await prisma.adPost.update({ where: { id: log.adPostId }, data: { status: "sent" } });
      }
      console.log(`  ✓ Отправлено`);
    } catch (error: any) {
      console.error(`  ✗ Ошибка:`, error.message || error);
      await prisma.sendLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMsg: String(error.message || error) },
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