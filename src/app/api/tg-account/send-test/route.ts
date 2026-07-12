import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatUsername, text } = body;

    if (!chatUsername || !text) {
      return NextResponse.json({ error: "Укажите чат и текст" }, { status: 400 });
    }

    const account = await db.tgAccount.findFirst();
    if (!account || !account.session) {
      return NextResponse.json({ error: "Аккаунт не подключён" }, { status: 400 });
    }

    const session = new StringSession(account.session);
    const client = new TelegramClient(session, account.apiId, account.apiHash, {
      connectionRetries: 3,
    });
    await client.connect();

    // Resolve username
    const username = chatUsername
      .replace("https://t.me/", "")
      .replace("t.me/", "")
      .replace("@", "");

    const entity = await client.getEntity(username);
    await client.sendMessage(entity, { message: text });

    await client.disconnect();

    return NextResponse.json({ success: true, message: "Сообщение отправлено" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка отправки";
    console.error("TG send error:", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}