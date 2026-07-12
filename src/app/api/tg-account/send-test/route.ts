import { NextRequest, NextResponse } from "next/server";

const TG_SENDER = "http://localhost:3011";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatUsername, text } = body;

    if (!chatUsername || !text) {
      return NextResponse.json({ error: "Укажите чат и текст" }, { status: 400 });
    }

    const res = await fetch(`${TG_SENDER}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatUsername, text }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: data.success ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка отправки";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}