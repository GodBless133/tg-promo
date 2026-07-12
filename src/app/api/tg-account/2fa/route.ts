import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
    }

    const account = await db.tgAccount.findFirst();
    if (!account) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 400 });
    }

    const session = new StringSession(account.session || "");
    const client = new TelegramClient(session, account.apiId, account.apiHash, {
      connectionRetries: 3,
    });
    await client.connect();

    const result = await client.invoke(
      new Api.auth.CheckPassword({ password })
    );

    const sessionStr = client.session.save();
    const me = await client.getMe();

    await db.tgAccount.update({
      where: { id: account.id },
      data: {
        session: sessionStr,
        status: "connected",
        firstName: me.firstName,
        lastName: me.lastName || null,
        username: me.username || null,
      },
    });

    await client.disconnect();

    return NextResponse.json({
      success: true,
      message: "Аккаунт подключён!",
      user: { firstName: me.firstName, lastName: me.lastName, username: me.username },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка 2FA";
    console.error("TG 2fa:", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}