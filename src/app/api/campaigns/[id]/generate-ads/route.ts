import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE = "http://localhost:3010";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const count = Math.min(Math.max(body.count || 3, 1), 10);

    const aiRes = await fetch(`${AI_SERVICE}/generate-ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: id, count }),
    });

    const data = await aiRes.json();
    return NextResponse.json(data, { status: aiRes.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Сервис ИИ недоступен";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}