# AI Remote Service — Docker Deployment

AI-powered remote monitoring and management platform. Deploy with Docker Compose — includes PostgreSQL, Redis, API, background worker, and web dashboard.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/Gaaldaco/ai-rmm-docker.git
cd ai-rmm-docker

# 2. Start the stack
./start.sh
# Or: docker compose up -d --build

# 3. Open the dashboard
open http://localhost:3000
```

No `.env` file needed. When you open the dashboard for the first time, a setup wizard appears where you enter your Anthropic API key, server address, and optional settings. Everything is stored in the database.

**Advanced**: If you prefer to pre-configure via environment variables, copy `.env.example` to `.env` and fill it in before starting.

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

See [`.env.example`](.env.example) for all available options. All are optional — the setup wizard handles the essentials. If you want to pre-configure:

- `ANTHROPIC_API_KEY` — Claude API key (or set via setup wizard)
- `POSTGRES_PASSWORD` — Database password (generated automatically by `start.sh`)

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

## License

This project is licensed under the [Business Source License 1.1](LICENSE).

- **Allowed**: Personal, educational, research, and internal evaluation use
- **Not allowed**: Commercial use (selling, offering as a paid service, etc.)
- **Change Date**: April 14, 2030 — on this date the license converts to [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)

For commercial licensing inquiries, contact aldacogene@gmail.com.
