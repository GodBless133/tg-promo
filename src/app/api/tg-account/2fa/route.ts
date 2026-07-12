import { NextRequest, NextResponse } from "next/server";

const TG_SENDER = "http://localhost:3011";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
    }

    const res = await fetch(`${TG_SENDER}/auth/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка 2FA";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}