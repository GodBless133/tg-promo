import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      targetChats: { where: { status: "selected" } },
      adPosts: { where: { status: { in: ["generated", "approved"] } } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.targetChats.length === 0) {
    return NextResponse.json(
      { error: "Нет выбранных чатов для отправки. Сначала найдите и выберите чаты." },
      { status: 400 }
    );
  }

  if (campaign.adPosts.length === 0) {
    return NextResponse.json(
      { error: "Нет рекламных текстов. Сначала сгенерируйте текст." },
      { status: 400 }
    );
  }

  // Update campaign status to active
  await db.campaign.update({
    where: { id },
    data: { status: "active" },
  });

  // Create send logs with scheduling
  const now = new Date();
  const logs = [];

  for (let i = 0; i < campaign.targetChats.length; i++) {
    const chat = campaign.targetChats[i];
    const adPost = campaign.adPosts[i % campaign.adPosts.length];

    const scheduledAt = new Date(
      now.getTime() + i * campaign.intervalMinutes * 60 * 1000
    );

    const log = await db.sendLog.create({
      data: {
        campaignId: id,
        targetChatId: chat.id,
        adPostId: adPost.id,
        status: "pending",
        scheduledAt,
      },
    });
    logs.push(log);
  }

  return NextResponse.json({
    success: true,
    message: `Кампания запущена! Запланировано ${logs.length} отправок с интервалом ${campaign.intervalMinutes} мин.`,
    logs,
  });
}