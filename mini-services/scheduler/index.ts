import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHECK_INTERVAL = 15000; // Check every 15 seconds
const TG_SENDER = "http://localhost:3011";

async function sendViaTelegram(chatLink: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if TG sender service is available
    const statusRes = await fetch(`${TG_SENDER}/status`, { signal: AbortSignal.timeout(3000) });
    const statusData = await statusRes.json();

    if (!statusData.connected) {
      return { success: false, error: "Telegram аккаунт не подключён" };
    }

    // Send via TG sender service
    const sendRes = await fetch(`${TG_SENDER}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatUsername: chatLink, text }),
      signal: AbortSignal.timeout(30000),
    });
    const sendData = await sendRes.json();
    return sendData;
  } catch (e) {
    return { success: false, error: `Сервис Telegram недоступен: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

async function processPendingSends() {
  const now = new Date();

  const pendingLogs = await prisma.sendLog.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: now },
    },
    include: {
      campaign: true,
      targetChat: true,
      adPost: true,
    },
  });

  for (const log of pendingLogs) {
    try {
      const chatLink = log.targetChat?.tgLink;
      const adText = log.adPost?.content;

      if (!chatLink || !adText) {
        throw new Error("Нет чата или текста рекламы");
      }

      console.log(`[SEND] "${log.campaign.name}" → ${chatLink}`);

      // Try real send
      const result = await sendViaTelegram(chatLink, adText);

      if (result.success) {
        await prisma.sendLog.update({
          where: { id: log.id },
          data: { status: "sent", sentAt: new Date() },
        });
        if (log.adPostId) {
          await prisma.adPost.update({
            where: { id: log.adPostId },
            data: { status: "sent" },
          });
        }
        console.log(`  ✓ Отправлено`);
      } else {
        throw new Error(result.error || "Ошибка отправки");
      }
    } catch (error) {
      console.error(`  ✗ Ошибка:`, error);
      await prisma.sendLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          errorMsg: String(error),
        },
      });
    }
  }

  // Check if all logs for active campaigns are done
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "active" },
    include: {
      sendLogs: {
        where: { status: "pending" },
        select: { id: true },
      },
    },
  });

  for (const campaign of activeCampaigns) {
    if (campaign.sendLogs.length === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "completed" },
      });
      console.log(`[COMPLETE] "${campaign.name}"`);
    }
  }
}

async function main() {
  console.log("Scheduler started");
  await processPendingSends();

  setInterval(async () => {
    try {
      await processPendingSends();
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  }, CHECK_INTERVAL);
}

main().catch(console.error);