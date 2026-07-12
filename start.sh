#!/bin/bash
set -e

# Start TG sender service in background
if [ -f "mini-services/tg-sender/requirements.txt" ]; then
  echo "Starting TG Sender service..."
  pip install -q telethon 2>/dev/null || pip3 install -q telethon 2>/dev/null
  python3 mini-services/tg-sender/server.py &
  TG_PID=$!
  echo "TG Sender PID: $TG_PID"
fi

# Start Next.js
exec "$@"