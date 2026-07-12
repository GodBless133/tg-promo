import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const account = await db.tgAccount.findFirst();
    if (account) {
      await db.tgAccount.update({
        where: { id: account.id },
        data: {
          session: null,
          status: "disconnected",
          firstName: null,
          lastName: null,
          username: null,
        },
      });
    }
    return NextResponse.json({ success: true, message: "Аккаунт отключён" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка отключения";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}