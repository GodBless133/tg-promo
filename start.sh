#!/bin/sh
mkdir -p db
npx prisma db push --skip-generate 2>/dev/null
exec node .next/standalone/server.js
