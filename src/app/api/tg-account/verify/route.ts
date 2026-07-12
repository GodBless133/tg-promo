import { NextRequest, NextResponse } from "next/server";

const TG_SENDER = "http://localhost:3011";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: "Введите код" }, { status: 400 });
    }

    const res = await fetch(`${TG_SENDER}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка верификации";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}