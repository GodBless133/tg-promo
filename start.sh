#!/bin/bash
set -e

# Start TG sender mini-service in the background
echo "Starting TG Sender service on port 3011..."
node mini-services/tg-sender/server.js &
TG_PID=$!
echo "TG Sender started (PID: $TG_PID)"

# Start the main app (passed as arguments, e.g. "next start")
exec "$@"