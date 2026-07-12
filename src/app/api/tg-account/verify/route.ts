import { NextRequest, NextResponse } from "next/server";

const TG_PORT = 3011;

async function proxyToTgService(path: string, options?: RequestInit) {
  try {
    const url = `http://localhost:${TG_PORT}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Сервис Telegram не запущен. Подождите несколько секунд и попробуйте снова." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return proxyToTgService("/auth/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}