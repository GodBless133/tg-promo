import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const logs = await db.sendLog.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      targetChat: true,
      adPost: true,
    },
  });
  return NextResponse.json(logs);
}