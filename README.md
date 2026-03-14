# AI Remote Service — Docker Deployment

AI-powered remote monitoring and management platform. Deploy with Docker Compose — includes PostgreSQL, Redis, API, background worker, and web dashboard.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/ai-rmm-docker.git
cd ai-rmm-docker

# 2. Create .env from the example
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and ANTHROPIC_API_KEY at minimum

# 3. Build and start
docker compose up -d --build

# 4. Access the dashboard
open http://localhost:3000
```

## Services

| Service    | Port | Description                          |
| ---------- | ---- | ------------------------------------ |
| `web`      | 3000 | React dashboard (nginx)              |
| `api`      | 8080 | Express API + WebSocket              |
| `worker`   | —    | BullMQ snapshot analysis worker      |
| `postgres` | 5432 | PostgreSQL 16 database               |
| `redis`    | 6379 | Redis 7 for job queues and caching   |

## Installing Agents

Once the stack is running, go to **Settings** in the dashboard for install commands, or run:

```bash
curl -sSL http://your-server:8080/install.sh | bash
```

Set `API_URL` in your `.env` to the public URL where agents can reach the API (e.g., `http://your-server-ip:8080`).

## Environment Variables

See [`.env.example`](.env.example) for all available options. Required:

- `POSTGRES_PASSWORD` — Database password
- `ANTHROPIC_API_KEY` — Claude API key for AI analysis

## Development

```bash
# Run in foreground with logs
docker compose up --build

# Rebuild a single service
docker compose up -d --build api

# View logs
docker compose logs -f api worker

# Stop everything
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v
```

## Architecture

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  Agents  │────▶│   API    │────▶│  Worker  │
│ (remote) │◀────│ :8080    │     │ (BullMQ) │
└─────────┘     └──────────┘     └──────────┘
                     │                 │
                ┌────┴────┐      ┌─────┴────┐
                │ Postgres │      │  Redis   │
                │  :5432   │      │  :6379   │
                └──────────┘      └──────────┘
                     ▲
                ┌────┴────┐
                │   Web   │
                │  :3000  │
                └─────────┘
```
