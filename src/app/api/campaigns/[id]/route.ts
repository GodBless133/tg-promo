import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      _count: { select: { targetChats: true, adPosts: true, sendLogs: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, description, targetUrl, targetType, topic, intervalMinutes, status } = body;

  const campaign = await db.campaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(targetUrl !== undefined && { targetUrl }),
      ...(targetType !== undefined && { targetType }),
      ...(topic !== undefined && { topic }),
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(status !== undefined && { status }),
    },
    include: {
      _count: { select: { targetChats: true, adPosts: true, sendLogs: true } },
    },
  });

  return NextResponse.json(campaign);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.campaign.delete({ where: { id } });
  return NextResponse.json({ success: true });
}