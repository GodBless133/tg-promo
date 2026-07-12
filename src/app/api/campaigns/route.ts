import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { targetChats: true, adPosts: true, sendLogs: true },
      },
    },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, targetUrl, targetType, topic, intervalMinutes } = body;

  if (!name || !targetUrl) {
    return NextResponse.json({ error: "Name and target URL are required" }, { status: 400 });
  }

  const campaign = await db.campaign.create({
    data: {
      name,
      description: description || null,
      targetUrl,
      targetType: targetType || "channel",
      topic: topic || null,
      intervalMinutes: intervalMinutes || 30,
      status: "draft",
    },
    include: {
      _count: { select: { targetChats: true, adPosts: true, sendLogs: true } },
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}