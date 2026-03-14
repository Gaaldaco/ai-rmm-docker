#!/bin/bash
set -e

cd "$(dirname "$0")"

# ─── Check prerequisites ──────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo ""
  echo "Error: Docker is not installed."
  echo ""
  echo "Install Docker first:"
  echo "  https://docs.docker.com/get-docker/"
  echo ""
  echo "Or if deploying to a cloud platform (Railway, Render, etc.),"
  echo "just deploy the repo directly — the setup wizard will appear"
  echo "in your browser when you open the app."
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
