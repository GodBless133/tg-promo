import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [totalCampaigns, totalChats, totalPosts, totalSent, recentLogs] =
    await Promise.all([
      db.campaign.count(),
      db.targetChat.count({ where: { status: "selected" } }),
      db.adPost.count(),
      db.sendLog.count({ where: { status: "sent" } }),
      db.sendLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { campaign: { select: { name: true } }, targetChat: true },
      }),
    ]);

  const activeCampaigns = await db.campaign.count({
    where: { status: "active" },
  });

  const pendingSends = await db.sendLog.count({
    where: { status: "pending" },
  });

  return NextResponse.json({
    totalCampaigns,
    activeCampaigns,
    totalChats,
    totalPosts,
    totalSent,
    pendingSends,
    recentLogs,
  });
}