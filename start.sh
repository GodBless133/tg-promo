#!/bin/bash
# Start TG sender service in background (only if Python is available)
if command -v python3 &>/dev/null; then
  echo "Starting TG Sender service..."
  pip install -q telethon 2>/dev/null || pip3 install -q telethon 2>/dev/null
  python3 mini-services/tg-sender/server.py &
  echo "TG Sender started (PID: $!)"
else
  echo "Python not found, TG Sender service skipped"
fi

# Start Next.js (passed as arguments)
exec "$@"