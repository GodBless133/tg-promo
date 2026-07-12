import { NextResponse } from "next/server";

const TG_SENDER = "http://localhost:3011";

export async function GET() {
  try {
    const res = await fetch(`${TG_SENDER}/status`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ connected: false, status: "none", phone: null });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, apiId, apiHash } = body;

    if (!phone || !apiId || !apiHash) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const res = await fetch(`${TG_SENDER}/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, apiId: Number(apiId), apiHash }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Сервис Telegram недоступен";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}