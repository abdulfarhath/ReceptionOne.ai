# Project: receptionone.ai — WhatsApp-first clinic queue system
<!-- Keep this file lean (<200 lines): Claude Code reads it every session and
     adherence drops if it gets bloated. PROJECT_OVERVIEW.md has the long version. -->

## What this is
A production-bound app for small/mid clinics in India that replaces phone-and-desk
booking with: a **WhatsApp chat bot** for patients and a **web dashboard** for staff.
Core model = a **live token queue**, one per doctor per day (the old fixed time-slot
model is gone). Three capabilities, in priority order:
1. **Live queue** — join / check-in / start / complete / no-show / cancel / hold /
   reinstate, with live wait estimates. **Built.**
2. **Notifications** — inline booking confirmation, one-time "you're next", slip
   "running behind" updates, and broadcasts (one-to-many campaigns). **Built.**
3. **(Later, optional) AI** — turn free-text/multilingual messages into a structured
   intent + route symptoms to a department. It NEVER diagnoses. **Not built yet.**

## How the queue works (the heart of the product)
- A patient picks a doctor, sees an **honest wait RANGE** + suggested arrival, and
  **joins** (gets an internal token). Walk-ins join as `ARRIVED`; "coming later"
  bookings as `WAITING`. Lifecycle: `WAITING → ARRIVED → IN_PROGRESS → DONE`, plus
  `NO_SHOW` / `CANCELLED`. A late `NO_SHOW` can be **reinstated** (fresh token at the
  back, or priority) — never silently restored to its old place; a reason is logged.
- **Ordering is present-first** (`domain/queue.ts activeOrder`): tier
  IN_PROGRESS(0) < ARRIVED(1) < WAITING(2), then priority, then token. A travelling
  WAITING is never served before someone physically present.
- **Patients never see a token or rank** (it can jump) — only a `min–max` minute
  **range** + suggested arrival. Tokens/positions are INTERNAL: staff board
  (`getQueue`) and `AppointmentEvent` keep them; `joinQueue`/`statusOf`/the chat
  replies expose the range only.
- **WhatsApp keyword intents** (any time): `arrived`/`here` → check in; `status`/
  `how long` → live range. A consent-gated **"you're next"** fires once per booking
  when they reach the front; a **slip update** fires when their max wait grows past
  `SLIP_MIN`. A **no-show sweep** cron flips stale `WAITING` to `NO_SHOW` after
  session end + `NO_SHOW_GRACE_MIN`.
- **Priority is disciplined**: a reason is captured into the event metadata whenever
  priority is set (booking/walk-in/reinstate); `MAX_PRIORITY_PER_DAY` is a soft cap
  that returns a warning field — it never hard-blocks.

### Multilingual vs AI (important distinction)
Multilingual (English / Telugu / Hindi) lives in `messaging/i18n.ts` as a
**hand-written dictionary** keyed by a language the patient picks. There is **no
LLM/NLU adapter yet** — the bot understands taps, numbers, and a few keywords, not
free text. When built, the AI layer may ONLY produce a structured, zod-validated
intent — never decide queue order or write to the DB.

## Tech stack (do not substitute without asking me)
- TypeScript (strict), Node 20+, ESM. Backend: Express 5 + zod + Prisma + pino.
- DB: PostgreSQL on Neon (`DATABASE_URL` pooled + `DIRECT_URL` non-pooled). No Docker.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Query + React Router
  v7 + react-hook-form + zod. Charts: Recharts + hand-built SVG/CSS. Toasts: sonner.
- Auth: staff email+password (bcryptjs), JWT in an httpOnly cookie. Roles ADMIN |
  RECEPTIONIST. Patients do NOT log in — identified by phone.
- Messaging: a `ChannelAdapter` (Mock | TwilioWhatsApp). Mock covers dev/tests/CLI.
- Jobs: node-cron (broadcast dispatch, no-show sweep). At scale → BullMQ + Redis.
- Tests: Vitest (+ supertest). Tooling: ESLint + Prettier.

## Repo layout
```
/api  src/domain/      PURE core: queue (order/estimates/transitions), scheduling
                       (queue orchestration), analytics, doctor-insights,
                       patient-history, types, typed DomainErrors — NO db/http/chat/ai
      src/repository/  Repository interface + InMemory + Prisma adapters
      src/http/        Express app, routes, error + auth middleware
      src/messaging/   ChannelAdapter + Mock + Twilio + ConversationEngine + i18n
                       + QueueNotifier (you're-next/slip) + BroadcastService + chat CLI
      src/jobs/        broadcast-dispatch cron + no-show-sweep cron
      prisma/          schema + migrations + seed (full queue data) + seed-admin
/web  src/pages/       login, day-view (Live Queue board), new-appointment
                       (New booking), patients, patient-detail, doctors,
                       doctor-insights, analytics, broadcasts
      src/lib/         api client, zod schemas, time + queue helpers
```
The web app talks to the API over HTTP only (`/api/*`).

## Architecture rules (these ARE the product — keep them)
- The domain core (`api/src/domain`) is PURE: no DB/HTTP/chat/AI; it talks to a
  `Repository` interface. All queue maths lives in `domain/queue.ts`.
- Everything external is a swappable adapter: Repository (InMemory | Prisma),
  ChannelAdapter (Mock | TwilioWhatsApp), ConversationStore, later NluAdapter.
- The conversation engine is a state machine, not an AI: it formats options and
  parses tapped/keyword replies. All queue reads/writes go through `SchedulingService`.
- No medical diagnosis, ever. The "emergency?" step is a triage hand-off (call 108).
- Timezone: store UTC, display Asia/Kolkata at the HTTP/messaging boundary only.

## Domain model (source: api/src/domain/types.ts + api/prisma/schema.prisma)
- **Doctor** — `name`, optional `phone`, `department`, `avgConsultMinutes` (drives
  estimates), `slotDurationMinutes` (legacy, unused).
- **Availability** — weekly SESSION window (queue open hours); `dayOfWeek` 0=Sun..6=Sat,
  `startMinutes`/`endMinutes` minutes-from-midnight UTC. No slots derived from it.
- **Patient** — `phone` unique (E.164), `name`, `language` (en|te|hi), `consentAt`.
- **Appointment** = a **queue entry** — `queueDate`, `token` (per doctor/day, unique),
  `isWalkIn`, `isPriority`, `onHold`, `arrivedAt`/`startedAt`/`doneAt`,
  `lastNotifiedMaxMinutes` (slip baseline), `status` WAITING|ARRIVED|IN_PROGRESS|DONE|
  NO_SHOW|CANCELLED. `start`/`end` legacy/null. Unique `(doctorId, queueDate, token)`.
- **AppointmentEvent** — append-only audit: JOINED|ARRIVED|STARTED|DONE|NO_SHOW|
  CANCELLED|HOLD|REINSTATED, with `metadata` (e.g. priority reason, reinstate mode).
- **Notification** — one-shot send ledger; unique `(appointmentId, kind)` makes
  "you're next" idempotent (`claimNotification`).
- **Conversation** — per-phone chat state. **Staff** — dashboard users.
  **Broadcast** — one-to-many campaign.
- Typed `DomainError` codes: `NOT_FOUND`, `SLOT_UNAVAILABLE`, `OUTSIDE_HOURS`,
  `PAST_TIME`, `INVALID_TRANSITION` (→ 409), mapped in one middleware.

## Conventions
- Validate EVERY external input (HTTP body, webhook, future LLM output) with zod.
- Map `DomainError.code` → HTTP status in ONE error middleware. Never leak stacks.
- **Patient-facing outputs return a wait RANGE + suggested arrival only — never a
  token or position** (those are internal/staff-only).
- All patient/doctor-facing copy goes through `t(key, lang, params)` in
  `messaging/i18n.ts`: add the key to the union and ALL three dicts (en/te/hi) together.
- Notifications are consent-gated (no-op when `consentAt` null) and idempotent
  (claim the ledger row before sending "you're next"; slip uses `lastNotifiedMaxMinutes`).
- Never log phone numbers or patient names at info level. Record state via AppointmentEvent.
- Twilio inbound webhooks are signature-validated when `TWILIO_AUTH_TOKEN` is set.
- Secrets only via env vars (api/.env, gitignored). Conventional commits; small changes.

## Commands
- DB: set DATABASE_URL + DIRECT_URL in api/.env (Neon pooled + non-pooled). No Docker.
- API: `cd api && npm run dev` | migrate: `npm run db:migrate` | generate: `npm run db:generate`
- Seed: `npm run db:seed` (full queue data) | `npm run db:seed:admin` (admin user)
- Chat the bot locally (Mock channel REPL): `cd api && npm run chat`
- Web: `cd web && npm run dev`
- Checks (run in each app): `npm run typecheck`, `npm run lint`, `npm test`
- Tunable env: `NO_SHOW_GRACE_MIN` (30), `SLIP_MIN` (20), `MAX_PRIORITY_PER_DAY` (off).

## Definition of done (every task)
Typecheck passes, lint passes, relevant tests pass, and the feature actually runs
end to end. Run the checks yourself and fix failures before saying it's done. If a
step needs a credential I haven't given you, STOP and tell me exactly what to
provide — do not invent or fake it.

## What to ask me for (don't invent these)
- `DATABASE_URL` (Neon pooled, pgbouncer=true) and `DIRECT_URL` (Neon non-pooled).
- `JWT_SECRET` — for signing staff session cookies.
- Twilio creds: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  (+ optional `TWILIO_MESSAGING_SERVICE_SID`, `PUBLIC_URL`). Mock covers dev/tests.
- `ANTHROPIC_API_KEY` (only when we build the AI/NLU layer — not yet needed).
