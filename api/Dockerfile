## ─── Stage 1: Build agent binaries (Go) ─────────────────────────────────────
FROM golang:1.22-alpine AS agent-builder
WORKDIR /agent
COPY agent/go.mod agent/go.sum* ./
RUN go mod download || true
COPY agent/ .
RUN go mod tidy
RUN GOOS=linux GOARCH=amd64 go build -ldflags "-s -w" -o bin/ai-remote-agent-linux-amd64 ./cmd/agent
RUN GOOS=linux GOARCH=arm64 go build -ldflags "-s -w" -o bin/ai-remote-agent-linux-arm64 ./cmd/agent

## ─── Stage 2: Build API (Node) ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package*.json ./
RUN npm ci
COPY api/ .
RUN npm run build

## ─── Stage 3: Production runner ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
# Agent binaries served for download
COPY --from=agent-builder /agent/bin ./agent-bin
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
