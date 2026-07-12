import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await db.campaign.update({
    where: { id },
    data: { status: "paused" },
  });

  // Cancel pending logs
  await db.sendLog.updateMany({
    where: { campaignId: id, status: "pending" },
    data: { status: "failed", errorMsg: "Кампания остановлена пользователем" },
  });

  return NextResponse.json({ success: true, message: "Кампания приостановлена" });
}