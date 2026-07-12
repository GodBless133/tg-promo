import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHECK_INTERVAL = 15000; // Check every 15 seconds

async function processPendingSends() {
  const now = new Date();

  // Find all pending send logs that are scheduled for now or earlier
  const pendingLogs = await prisma.sendLog.findMany({
    where: {
      status: "pending",
      scheduledAt: {
        lte: now,
      },
    },
    include: {
      campaign: true,
      targetChat: true,
      adPost: true,
    },
  });

  for (const log of pendingLogs) {
    try {
      // In a real production app, this would send the message via Telegram Bot API
      // For now we simulate the send by marking it as sent
      console.log(
        `[SEND] Campaign: "${log.campaign.name}" → Chat: "${log.targetChat?.title || "unknown"}"`
      );
      console.log(`  Ad text: "${log.adPost?.content?.slice(0, 80)}..."`);
      console.log(`  Target chat link: ${log.targetChat?.tgLink || "N/A"}`);

      await prisma.sendLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          sentAt: new Date(),
        },
      });

      // Also update the ad post status
      if (log.adPostId) {
        await prisma.adPost.update({
          where: { id: log.adPostId },
          data: { status: "sent" },
        });
      }

      console.log(`  ✓ Marked as sent`);
    } catch (error) {
      console.error(`  ✗ Failed to process log ${log.id}:`, error);
      await prisma.sendLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          errorMsg: String(error),
        },
      });
    }
  }

  // Check if all logs for an active campaign are done
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "active" },
    include: {
      _count: {
        select: {
          sendLogs: true,
        },
      },
      sendLogs: {
        where: {
          status: "pending",
        },
        select: { id: true },
      },
    },
  });

  for (const campaign of activeCampaigns) {
    if (campaign.sendLogs.length === 0) {
      // No more pending logs → mark campaign as completed
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "completed" },
      });
      console.log(
        `[COMPLETE] Campaign "${campaign.name}" - all sends processed`
      );
    }
  }
}

async function main() {
  console.log("🔄 TG Promo Scheduler started");
  console.log(`   Check interval: ${CHECK_INTERVAL / 1000}s`);
  console.log(`   Time: ${new Date().toISOString()}`);

  // Run immediately on start
  await processPendingSends();

  // Then run periodically
  setInterval(async () => {
    try {
      await processPendingSends();
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  }, CHECK_INTERVAL);
}

main().catch(console.error);