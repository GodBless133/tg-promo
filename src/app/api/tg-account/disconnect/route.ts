import { NextResponse } from "next/server";

const TG_SENDER = "http://localhost:3011";

export async function POST() {
  try {
    const res = await fetch(`${TG_SENDER}/auth/disconnect`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка отключения";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}