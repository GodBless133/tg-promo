import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chats = await db.targetChat.findMany({
    where: { campaignId: id },
    orderBy: { foundAt: "desc" },
  });
  return NextResponse.json(chats);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { chatIds, status } = body;

  if (!chatIds || !status) {
    return NextResponse.json({ error: "chatIds and status are required" }, { status: 400 });
  }

  const result = await db.targetChat.updateMany({
    where: { id: { in: chatIds }, campaignId: id },
    data: { status },
  });

  return NextResponse.json({ updated: result.count });
}