import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const posts = await db.adPost.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(posts);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const body = await req.json();
  const { postId, status } = body;

  if (!postId || !status) {
    return NextResponse.json({ error: "postId and status are required" }, { status: 400 });
  }

  const post = await db.adPost.update({
    where: { id: postId, campaignId },
    data: { status },
  });

  return NextResponse.json(post);
}