# receptionone.ai

WhatsApp-first clinic appointment system: a chat bot for patients plus a staff web
dashboard. See [CLAUDE.md](CLAUDE.md) for the product spec and architecture rules.

This repo is a monorepo with two apps:

| Path   | What it is                                                        |
| ------ | ----------------------------------------------------------------- |
| `api/` | Express + Prisma backend (pure domain core + swappable adapters). |
| `web/` | React + Vite staff dashboard and public patient chat page.        |

The web app talks to the API over HTTP only. Postgres runs on **Neon** — no Docker.

## Prerequisites

- Node.js 20+ (tested on Node 22)
- A free [Neon](https://neon.tech) Postgres project

## 1. Configure the API environment

```bash
cp api/.env.example api/.env
```

Then fill in `api/.env`. The two database URLs both come from the Neon dashboard:

1. Open your project on [console.neon.tech](https://console.neon.tech).
2. Click **Connect** (or **Connection string**) on the project dashboard.
3. **`DATABASE_URL`** — the **pooled** connection string. Make sure the
   "Pooled connection" toggle is **on**; the host contains `-pooler`. Append
   `?sslmode=require&pgbouncer=true` if it is not already present. Used at runtime.
4. **`DIRECT_URL`** — the **non-pooled** connection string. Turn the
   "Pooled connection" toggle **off** (host has no `-pooler`). Keep
   `?sslmode=require`. Prisma uses this for migrations.

Also set `JWT_SECRET` to a long random string. WhatsApp and Anthropic keys can stay
blank for now — the default messaging channel is the embeddable web chat.

## 2. Run the API

```bash
cd api
npm install
npm run db:generate   # generate the Prisma client
npm run db:migrate    # apply migrations to Neon (once schema models exist)
npm run dev           # starts on http://localhost:$PORT (default 3000)
```

Health check:

```bash
curl http://localhost:3000/health   # -> {"status":"ok"}
```

## 3. Run the web app

In a second terminal:

```bash
cd web
npm install
npm run dev           # Vite dev server, proxies /api -> http://localhost:$PORT
```

If the API runs on a non-default port, start the web dev server with a matching
`API_PORT` (or `PORT`) so the proxy targets it, e.g. `API_PORT=4000 npm run dev`.

## Checks (run in each app)

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Project layout

```
api/src/domain/      scheduling logic — NO db/http/whatsapp/ai
api/src/repository/  Repository interface + InMemory + Prisma adapters
api/src/http/        Express app, routes, error + auth middleware
api/src/messaging/   ChannelAdapter + WebChat + Mock + WhatsApp + engine
api/src/jobs/        reminder cron
api/prisma/          schema + migrations + seed
web/                 React + Vite frontend
```
