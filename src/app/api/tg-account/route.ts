import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { db } from "@/lib/db";
import { setTgCodeHash } from "@/lib/tg-state";

let _client: TelegramClient | null = null;

export async function GET() {
  try {
    const account = await db.tgAccount.findFirst();
    if (!account) {
      return NextResponse.json({ connected: false, status: "none", phone: null });
    }
    if (account.status === "connected" && account.session) {
      return NextResponse.json({
        connected: true, status: "connected", phone: account.phone,
        firstName: account.firstName, lastName: account.lastName, username: account.username,
      });
    }
    return NextResponse.json({ connected: false, status: account.status, phone: account.phone });
  } catch {
    return NextResponse.json({ connected: false, status: "none", phone: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, apiId, apiHash } = body;

    if (!phone || !apiId || !apiHash) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    if (_client) {
      try { await _client.disconnect(); } catch {}
      _client = null;
    }

    const session = new StringSession("");
    _client = new TelegramClient(session, Number(apiId), apiHash, { connectionRetries: 3 });
    await _client.connect();

    // Send code using low-level API
    const result = await _client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: Number(apiId),
        apiHash,
        settings: new Api.CodeSettings({}),
      })
    );

    // result is auth.SentCode
    const phoneCodeHash = (result as any).phoneCodeHash;
    setTgCodeHash(phoneCodeHash);

    // Save to DB
    const existing = await db.tgAccount.findFirst();
    if (existing) {
      await db.tgAccount.update({
        where: { id: existing.id },
        data: { phone, apiId: Number(apiId), apiHash, status: "awaiting_code", session: null },
      });
    } else {
      await db.tgAccount.create({
        data: { phone, apiId: Number(apiId), apiHash, status: "awaiting_code" },
      });
    }

    return NextResponse.json({ success: true, message: "Код отправлен в Telegram!" });
  } catch (e) {
    if (_client) { try { await _client.disconnect(); } catch {} _client = null; }
    const msg = e instanceof Error ? e.message : "Ошибка подключения";
    console.error("TG auth start:", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}