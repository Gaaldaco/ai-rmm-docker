#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/db/migrate.js 2>/dev/null || echo "[entrypoint] No migration runner found, skipping..."

echo "[entrypoint] Starting API server..."
exec node dist/index.js
