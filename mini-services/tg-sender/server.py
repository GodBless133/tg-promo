#!/usr/bin/env python3
"""Telegram sender mini-service — handles auth + message sending via Telethon."""

import json
import os
import sys
import asyncio
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ─── Config ───────────────────────────────────────────────
PORT = int(os.environ.get("TG_SENDER_PORT", 3011))
DB_PATH = os.environ.get("TG_SENDER_DB", os.path.join(os.path.dirname(__file__), "../../db/custom.db"))

# ─── Telethon globals ────────────────────────────────────
client = None
phone_hash = None  # stores the phone_code_hash during auth

# ─── SQLite helper ───────────────────────────────────────
import sqlite3

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def get_account():
    """Get the first TgAccount from DB."""
    conn = get_db()
    row = conn.execute("SELECT * FROM TgAccount LIMIT 1").fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def update_account_status(status, **kwargs):
    """Update account status and optional fields."""
    conn = get_db()
    sets = ["status = ?", "updatedAt = datetime('now')"]
    vals = [status]
    for k, v in kwargs.items():
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(1)  # limit
    conn.execute(f"UPDATE TgAccount SET {', '.join(sets)} WHERE id = (SELECT id FROM TgAccount LIMIT 1) AND 1=?", vals)
    conn.commit()
    conn.close()

def save_account_session(session_string, first_name=None, last_name=None, username=None):
    conn = get_db()
    sets = ["session = ?", "status = 'connected'", "updatedAt = datetime('now')"]
    vals = [session_string]
    if first_name:
        sets.append("firstName = ?")
        vals.append(first_name)
    if last_name:
        sets.append("lastName = ?")
        vals.append(last_name)
    if username:
        sets.append("username = ?")
        vals.append(username)
    vals.append(1)
    conn.execute(f"UPDATE TgAccount SET {', '.join(sets)} WHERE id = (SELECT id FROM TgAccount LIMIT 1) AND 1=?", vals)
    conn.commit()
    conn.close()

# ─── Telethon async functions ─────────────────────────────
async def do_start_auth(phone, api_id, api_hash):
    global client, phone_hash
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession

        # Close existing client if any
        if client and client.is_connected():
            await client.disconnect()

        session_str = ""
        client = TelegramClient(StringSession(session_str), api_id, api_hash)
        await client.connect()

        # Send code
        result = await client.send_code_request(phone)
        phone_hash = result.phone_code_hash

        update_account_status("awaiting_code")
        return {"success": True, "message": "Код отправлен в Telegram"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def do_verify_code(code):
    global client, phone_hash
    try:
        from telethon import TelegramClient, SessionPasswordNeededError

        account = get_account()
        if not account:
            return {"success": False, "error": "Аккаунт не найден"}

        await client.sign_in(account["phone"], code, phone_code_hash=phone_hash)
        me = await client.get_me()

        # Save session string
        session_str = client.session.save()
        save_account_session(
            session_str,
            first_name=me.first_name,
            last_name=me.last_name,
            username=me.username
        )

        return {"success": True, "message": "Подключено!", "user": {"firstName": me.first_name, "lastName": me.last_name, "username": me.username}}
    except SessionPasswordNeededError:
        update_account_status("awaiting_2fa")
        return {"success": False, "need2fa": True, "error": "Требуется двухфакторная аутентификация"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def do_verify_2fa(password):
    global client
    try:
        await client.sign_in(password=password)
        me = await client.get_me()

        session_str = client.session.save()
        save_account_session(
            session_str,
            first_name=me.first_name,
            last_name=me.last_name,
            username=me.username
        )

        return {"success": True, "message": "Подключено!", "user": {"firstName": me.first_name, "lastName": me.last_name, "username": me.username}}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def do_send_message(chat_username, text):
    global client
    try:
        # Ensure client is connected
        if not client or not client.is_connected():
            account = get_account()
            if not account or not account.get("session"):
                return {"success": False, "error": "Аккаунт не подключён"}

            from telethon import TelegramClient
            from telethon.sessions import StringSession

            client = TelegramClient(StringSession(account["session"]), account["apiId"], account["apiHash"])
            await client.connect()

        # Resolve username to entity
        # chat_username can be "t.me/some_channel" or just "some_channel"
        username = chat_username.replace("https://t.me/", "").replace("t.me/", "")
        entity = await client.get_entity(username)

        await client.send_message(entity, text)
        return {"success": True, "message": "Сообщение отправлено"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def do_disconnect():
    global client, phone_hash
    try:
        if client and client.is_connected():
            await client.disconnect()
        client = None
        phone_hash = None

        conn = get_db()
        conn.execute("UPDATE TgAccount SET session = NULL, status = 'disconnected', firstName = NULL, lastName = NULL, username = NULL, updatedAt = datetime('now') WHERE id = (SELECT id FROM TgAccount LIMIT 1)")
        conn.commit()
        conn.close()

        return {"success": True, "message": "Отключено"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def do_get_status():
    global client
    account = get_account()
    if not account:
        return {"connected": False, "status": "none", "phone": None}

    result = {
        "connected": account["status"] == "connected",
        "status": account["status"],
        "phone": account["phone"],
        "firstName": account.get("firstName"),
        "lastName": account.get("lastName"),
        "username": account.get("username"),
    }

    # Verify connection is alive
    if account["status"] == "connected":
        try:
            if not client or not client.is_connected():
                from telethon import TelegramClient
                from telethon.sessions import StringSession
                client = TelegramClient(StringSession(account["session"]), account["apiId"], account["apiHash"])
                await client.connect()
            me = await client.get_me()
            result["connected"] = True
        except:
            result["connected"] = False
            update_account_status("disconnected")

    return result

# ─── Run async in sync context ────────────────────────────
def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

# ─── HTTP Handler ─────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress logs

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/status":
            result = run_async(do_get_status())
            self._json_response(result)
        elif path == "/health":
            self._json_response({"status": "ok"})
        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_body()

        if path == "/auth/start":
            phone = body.get("phone", "").strip()
            api_id = body.get("apiId")
            api_hash = body.get("apiHash", "").strip()
            if not phone or not api_id or not api_hash:
                self._json_response({"error": "Заполните все поля"}, 400)
                return

            # Save credentials to DB first
            conn = get_db()
            existing = conn.execute("SELECT id FROM TgAccount LIMIT 1").fetchone()
            if existing:
                conn.execute("UPDATE TgAccount SET phone=?, apiId=?, apiHash=?, status='awaiting_code', updatedAt=datetime('now') WHERE id=?",
                           (phone, int(api_id), api_hash, existing["id"]))
            else:
                conn.execute("INSERT INTO TgAccount (phone, apiId, apiHash, status) VALUES (?, ?, ?, 'awaiting_code')",
                           (phone, int(api_id), api_hash))
            conn.commit()
            conn.close()

            result = run_async(do_start_auth(phone, int(api_id), api_hash))
            self._json_response(result, 200 if result.get("success") else 400)

        elif path == "/auth/verify":
            code = body.get("code", "").strip()
            if not code:
                self._json_response({"error": "Введите код"}, 400)
                return
            result = run_async(do_verify_code(code))
            self._json_response(result, 200 if result.get("success") else 400)

        elif path == "/auth/2fa":
            password = body.get("password", "")
            if not password:
                self._json_response({"error": "Введите пароль"}, 400)
                return
            result = run_async(do_verify_2fa(password))
            self._json_response(result, 200 if result.get("success") else 400)

        elif path == "/send":
            chat = body.get("chatUsername", "")
            text = body.get("text", "")
            if not chat or not text:
                self._json_response({"error": "Укажите чат и текст"}, 400)
                return
            result = run_async(do_send_message(chat, text))
            self._json_response(result, 200 if result.get("success") else 500)

        else:
            self._json_response({"error": "Not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/auth/disconnect":
            result = run_async(do_disconnect())
            self._json_response(result)
        else:
            self._json_response({"error": "Not found"}, 404)


if __name__ == "__main__":
    print(f"TG Sender service starting on port {PORT}...")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"TG Sender ready on :{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
        server.server_close()