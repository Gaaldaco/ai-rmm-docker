#!/bin/bash
set -e

cd "$(dirname "$0")"

# ─── Cloud platform detection ─────────────────────────────────────────────────
# start.sh is for local Docker only. Cloud platforms handle deployment natively.
if [ -n "$RAILWAY_ENVIRONMENT" ] || [ -n "$RENDER_SERVICE_ID" ] || [ -n "$FLY_APP_NAME" ]; then
  echo "Cloud platform detected — start.sh is not needed here."
  echo "The app will start automatically using the platform's configuration."
  exit 0
fi

# ─── Check prerequisites ──────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo ""
  echo "Error: Docker is not installed."
  echo "Install Docker: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "Error: Docker Compose is not available."
  echo "Install Docker Compose: https://docs.docker.com/compose/install/"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Starting AI Remote Service Stack...             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

docker compose up -d --build

WEB_PORT=$(grep "^WEB_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
WEB_PORT=${WEB_PORT:-3000}

echo ""
echo "  All services started!"
echo ""
echo "  Open http://localhost:${WEB_PORT} in your browser."
echo "  If this is your first time, a setup wizard will guide you."
echo ""
echo "  Logs:  docker compose logs -f"
echo "  Stop:  docker compose down"
echo ""
