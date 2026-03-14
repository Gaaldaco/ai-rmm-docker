#!/bin/bash
set -e

cd "$(dirname "$0")"

ENV_FILE=".env"
SETUP_CONTAINER="ai-rmm-setup"

# ─── Check if .env exists with required values ─────────────────────────────
needs_setup() {
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi
  # Check for required values (not just the key, but an actual value)
  if ! grep -q "ANTHROPIC_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  if ! grep -qP "POSTGRES_PASSWORD=.{8,}" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  return 1
}

if needs_setup; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║           AI Remote Service — First-Time Setup          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "  No configuration found. Starting setup wizard..."
  echo ""

  # Build and run the setup container
  docker build -t "$SETUP_CONTAINER" ./setup -q

  docker run --rm -it \
    -p 3000:3000 \
    -v "$(pwd):/data" \
    -e ENV_PATH=/data/.env \
    --name "$SETUP_CONTAINER" \
    "$SETUP_CONTAINER" &

  SETUP_PID=$!

  echo "  ➜  Open http://localhost:3000 in your browser"
  echo "     to complete setup."
  echo ""
  echo "  Waiting for setup to complete..."
  echo "  (Press Ctrl+C to cancel)"
  echo ""

  # Wait for .env to be written
  while needs_setup; do
    sleep 2
  done

  echo "  ✓ Configuration saved!"
  echo ""

  # Stop the setup container
  docker stop "$SETUP_CONTAINER" 2>/dev/null || true
  wait $SETUP_PID 2>/dev/null || true

  sleep 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Starting AI Remote Service Stack...             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

docker compose up -d --build

echo ""
echo "  ✓ All services started!"
echo ""

# Read ports from .env
WEB_PORT=$(grep "^WEB_PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "3000")
API_PORT=$(grep "^API_PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "8080")
WEB_PORT=${WEB_PORT:-3000}
API_PORT=${API_PORT:-8080}

echo "  Dashboard:  http://localhost:${WEB_PORT}"
echo "  API:        http://localhost:${API_PORT}"
echo "  Logs:       docker compose logs -f"
echo ""
