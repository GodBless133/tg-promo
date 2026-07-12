import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { db } from "@/lib/db";
import { getTgCodeHash, clearTgCodeHash } from "@/lib/tg-state";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: "Введите код" }, { status: 400 });
    }

    const account = await db.tgAccount.findFirst();
    if (!account) {
      return NextResponse.json({ error: "Сначала подключите аккаунт" }, { status: 400 });
    }

    const session = new StringSession(account.session || "");
    const client = new TelegramClient(session, account.apiId, account.apiHash, {
      connectionRetries: 3,
    });
    await client.connect();

    try {
      const codeHash = getTgCodeHash() || "";

      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: account.phone,
          phoneCodeHash: codeHash,
          phoneCode: code,
        })
      );

      // Success
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

      clearTgCodeHash();
      await client.disconnect();

      return NextResponse.json({
        success: true,
        message: "Аккаунт подключён!",
        user: { firstName: me.firstName, lastName: me.lastName, username: me.username },
      });
    } catch (e: unknown) {
      await client.disconnect();
      const err = e as any;

      // Check for 2FA required (SessionPasswordNeededError)
      if (err?.errorMessage === "SESSION_PASSWORD_NEEDED" || err?.constructor?.name === "SessionPasswordNeededError") {
        await db.tgAccount.update({
          where: { id: account.id },
          data: { status: "awaiting_2fa" },
        });
        return NextResponse.json({
          success: false,
          need2fa: true,
          error: "Требуется двухфакторная аутентификация",
        });
      }

      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка верификации";
    console.error("TG verify:", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}