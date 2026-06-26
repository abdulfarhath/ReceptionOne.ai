# receptionone.ai — Project Overview

> A WhatsApp-first appointment & communication system for small and mid-size
> clinics in India. It replaces phone-and-front-desk booking with a chat bot for
> patients and a web dashboard for staff.

This document explains **what the product is, how it is built, what works today,
and the open problems worth solving next.** It is written to be useful both for
people who want to understand the project and for AI models asked to propose new
features or improvements. If you are an AI reading this, skip to
[§16 Open Problems & Ideas Wanted](#16-open-problems--ideas-wanted) for where the
project most needs help — but read the constraints first, they matter.

> **Big recent change:** the original fixed time-slot booking model has been
> **replaced by a live token queue** (one queue per doctor per day). There are no
> appointment "slots" anymore — patients take a **token**, get a live position +
> wait estimate, and move through `WAITING → ARRIVED → IN_PROGRESS → DONE`
> (or `NO_SHOW` / `CANCELLED`). Most references below describe the queue model.

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [The problem & the vision](#2-the-problem--the-vision)
3. [The core operational problem (and how the queue attacks it)](#3-the-core-operational-problem-and-how-the-queue-attacks-it)
4. [Architecture & principles](#4-architecture--principles)
5. [Tech stack](#5-tech-stack)
6. [Repository layout](#6-repository-layout)
7. [Domain model](#7-domain-model)
8. [Feature walkthrough](#8-feature-walkthrough)
9. [The WhatsApp bot (conversation flow)](#9-the-whatsapp-bot-conversation-flow)
10. [API reference](#10-api-reference)
11. [Background jobs](#11-background-jobs)
12. [Security, privacy & compliance](#12-security-privacy--compliance)
13. [Testing & quality](#13-testing--quality)
14. [Local setup](#14-local-setup)
15. [Known limitations & tech debt](#15-known-limitations--tech-debt)
16. [Open problems & ideas wanted](#16-open-problems--ideas-wanted)
17. [Glossary](#17-glossary)

---

## 1. TL;DR

- **Who it's for:** small/mid clinics in India that today run on phone calls and a
  paper/desk register.
- **Patients** never install an app or log in. They chat on **WhatsApp** and are
  identified by phone number. They pick a doctor, see a **live wait estimate**,
  **join the queue** (get a token), can text **"arrived"** to check in and
  **"status"** to ask their position — in **English, Telugu, or Hindi**.
- **Staff** use a **web dashboard**: a **Live Queue board** to move patients
  through the visit, a **New booking** tab to issue tokens, plus patient history,
  per-doctor insights, an analytics dashboard, broadcasts, and doctor management.
- **Three capabilities, in priority order:**
  1. **Live token queue** — join / check-in / start / complete / no-show / cancel /
     hold, with live position + wait estimates. (Replaced fixed time slots.)
  2. **Notifications** — inline booking confirmations, a one-time consent-gated
     **"you're next"**, and **broadcasts** (one-to-many campaigns).
  3. **AI (future, optional)** — interpret free-text/multilingual messages and
     route symptoms to a department. **Not built yet.** It will never diagnose.
- **The next big problem to crack:** further reducing wasted clinical time —
  no-show prediction, smart confirm prompts, doctor-running-late handling. The
  queue model already added real check-in, a tracked `NO_SHOW` status, an
  automatic no-show sweep, and live wait estimates. See
  [§3](#3-the-core-operational-problem-and-how-the-queue-attacks-it).

---

## 2. The problem & the vision

### The status quo in a small clinic
- A receptionist answers phones, writes appointments in a book, and manages a
  chaotic walk-in queue by memory and sticky notes. Slow, error-prone, no data.
- Patients sit in a crowded waiting room with no idea how long they'll wait.
- No data: the clinic can't see demand patterns, who's actually being seen, or
  who its patients are.

### The product
A patient messages the clinic's WhatsApp number, picks a doctor, sees how many
people are ahead and roughly how long the wait is, and takes a token. Staff run
the day off a **live queue board**. Patients can check in and ask their status by
text. Everything is logged, so the clinic finally has **operational data**.

### Design tenets
- **WhatsApp-first.** Patients are where the conversation already is. No app, no
  login, no friction.
- **The bot is a tool, not a doctor.** It schedules and informs. It must never
  give medical advice or diagnose.
- **Consent before contact.** A patient is only messaged after they've engaged
  and consented.
- **Boring, swappable infrastructure.** Channels (WhatsApp provider), storage,
  and the future AI layer are all behind interfaces so they can be replaced.

---

## 3. The core operational problem (and how the queue attacks it)

> **Clinical time is the scarcest resource in a clinic.** The slot model wasted it
> in ways the **queue model now directly addresses** — but real-world friction
> remains, and that's where the project still wants ideas (§16).

| Slot-era problem | What the queue model does today |
|---|---|
| No-shows leave dead, unfillable slots | No reserved slots to waste; a queue just flows. Unattended **`WAITING`** tokens are auto-flipped to **`NO_SHOW`** by a sweep after session end + grace. |
| No real check-in / no-show tracking | Real lifecycle: `WAITING → ARRIVED → IN_PROGRESS → DONE`, plus `NO_SHOW` / `CANCELLED`, each writing an `AppointmentEvent`. Patients self-check-in by texting "arrived". |
| Rigid, one-size slot lengths | Wait is estimated from each doctor's **`avgConsultMinutes`** × people ahead — no fixed grid. |
| Patients wait blind in a crowded room | Live **quote** before booking + **"you're next"** message + on-demand **"status"** — patients can come near their turn ("Booking — coming later"). |

**What the system already gives us to work with:**
- Every queue entry and its lifecycle is logged (`AppointmentEvent`): join, check-in,
  start, complete, no-show, cancel, hold — per patient and per doctor.
- A **real `NO_SHOW` status** and **actual consult durations** (`startedAt →
  doneAt`), surfaced in analytics (avg consult per doctor, no-show counts).
- A WhatsApp channel that can message patients, plus a job runner (node-cron) for
  time-based actions (the no-show sweep, broadcast dispatch).
- Per-patient history (how reliable is this patient?) and per-doctor demand
  patterns.

**What's still open:** prediction and proactive mitigation — no-show risk scoring,
escalating confirm prompts, doctor-running-late broadcasts, learned consult
lengths. The system now *measures and runs* the queue well; it doesn't yet
*predict* or *pre-empt*. See [§16](#16-open-problems--ideas-wanted).

---

## 4. Architecture & principles

The codebase is split so that the **rules of the business** are isolated from the
**plumbing**.

```
            ┌─────────────────────────────────────────────┐
  WhatsApp  │                                             │
  ───────▶  │   ChannelAdapter (Mock | Twilio)            │
            │        │                                    │
            │        ▼                                    │
            │   ConversationEngine (state machine)        │
            │        │                                    │
  Web/HTTP  │        ▼                                    │
  ───────▶  │   HTTP routes (Express + zod)               │
            │        │                                    │
            │        ▼                                    │
            │   DOMAIN CORE  ◀── pure, no I/O             │
            │   (queue, scheduling, analytics, …)         │
            │        │                                    │
            │        ▼                                    │
            │   Repository (InMemory | Prisma)            │
            │        │                                    │
            └────────┼────────────────────────────────────┘
                     ▼
              PostgreSQL (Neon)
```

**The rules (these *are* the product):**

1. **The domain core (`api/src/domain/`) is pure.** No database, HTTP, chat, or
   AI imports. It takes plain data and a `Repository` interface and returns
   results. This is what makes the queue logic testable and trustworthy.
2. **Everything external is a swappable adapter behind an interface:**
   - `Repository` → `InMemoryRepository` (tests/dev) | `PrismaRepository` (prod)
   - `ChannelAdapter` → `MockChannelAdapter` (tests/CLI) | `TwilioWhatsAppChannelAdapter`
   - `ConversationStore` → InMemory | Prisma
   - (future) `NluAdapter` → Keyword | LLM
3. **The conversation engine is a deterministic state machine, not an AI.** It
   formats options and parses tapped/keyword replies. It *never* decides queue
   ordering or writes entries — that always goes through `SchedulingService`.
4. **The (future) AI layer may only turn text into a structured, zod-validated
   intent.** It must not decide ordering or write to the DB.
5. **No medical diagnosis, ever.** Symptom handling = department routing + an
   urgency flag only. Today's "emergency?" step is a triage hand-off (call 108),
   not a diagnosis.
6. **Timezone discipline.** All instants are stored in **UTC**; everything is
   displayed in **Asia/Kolkata (IST)**. Timezone conversion is a presentation
   concern handled at the HTTP/messaging boundary, never in the core.

---

## 5. Tech stack

| Area        | Choice |
|-------------|--------|
| Language    | TypeScript (strict), Node 20+, ESM |
| Backend     | Express 5, zod (validation), Prisma (ORM), pino (logging) |
| Database    | PostgreSQL on **Neon** (`DATABASE_URL` pooled + `DIRECT_URL` non-pooled for migrations). No Docker. |
| Frontend    | React 19, Vite, Tailwind v4, shadcn/ui (Radix), TanStack Query, React Router v7, react-hook-form, zod |
| Charts      | **Recharts** (line/bar/donut) + hand-built SVG/CSS (gauges, heatmap) |
| Auth        | Staff email+password (bcryptjs), JWT in an httpOnly cookie. Roles: `ADMIN`, `RECEPTIONIST`. Patients do **not** log in. |
| Messaging   | `ChannelAdapter` interface. WhatsApp via **Twilio** (sandbox for now); Mock adapter for dev/tests/CLI. Meta Cloud API is a future adapter. |
| Jobs        | node-cron (broadcast dispatch, no-show sweep). At scale → BullMQ + Redis. |
| Tests       | Vitest + supertest (API). |
| Tooling     | ESLint + Prettier. |

> **Stack is intentionally conventional.** Substituting any of it is a deliberate
> decision, not a default.

---

## 6. Repository layout

```
/api    Backend
  src/domain/       PURE core: queue (ordering/estimates/transitions),
                    scheduling (queue orchestration), analytics, doctor-insights,
                    patient-history, types, typed DomainErrors
  src/repository/   Repository interface + InMemory + Prisma adapters
  src/auth/         password hashing, staff lookup, JWT sign/verify
  src/http/         Express app, routes, error + auth middleware
  src/messaging/    ChannelAdapter + Mock + Twilio + ConversationEngine
                    + conversation state/store + i18n dictionary + chat CLI
                    + QueueNotifier ("you're next") + BroadcastService
  src/jobs/         broadcast-dispatch cron + no-show-sweep cron
  prisma/           schema + migrations + seed (full queue data) + seed-admin
/web    Frontend (React + Vite) — the staff dashboard
  src/pages/        login, day-view (Live Queue board), new-appointment
                    (New booking), patients, patient-detail, doctors,
                    doctor-insights, analytics, broadcasts
  src/components/   dialogs, charts (analytics/), shadcn ui/ primitives
  src/lib/          api client, zod schemas, time + queue helpers, broadcast meta
```

The web app talks to the API over HTTP only (`/api/*`).

---

## 7. Domain model

Source of truth: `api/src/domain/types.ts` + `api/prisma/schema.prisma`.

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| **Doctor** | A practitioner | `name`, optional `phone`, `department`, **`avgConsultMinutes`** (drives wait estimates), `slotDurationMinutes` (legacy, unused) |
| **Availability** | Weekly **session window** (when the queue is open) | `dayOfWeek` (0=Sun..6=Sat), `startMinutes`/`endMinutes` (minutes-from-midnight, UTC). No slots are derived from this. |
| **Patient** | Identified by phone | `phone` (E.164, unique), `name`, `language` (`en`/`te`/`hi`), `consentAt` (null until captured) |
| **Appointment** | A **queue entry** | `doctorId`, `patientId`, **`queueDate`** (the clinic day, UTC midnight), **`token`** (per doctor per day, from 1), `isWalkIn`, `isPriority`, `onHold`, `arrivedAt`/`startedAt`/`doneAt`, `status` = `WAITING` \| `ARRIVED` \| `IN_PROGRESS` \| `DONE` \| `NO_SHOW` \| `CANCELLED`. `start`/`end` are legacy/null. Unique `(doctorId, queueDate, token)`. |
| **AppointmentEvent** | Append-only audit log | `type` = `JOINED` \| `ARRIVED` \| `STARTED` \| `DONE` \| `NO_SHOW` \| `CANCELLED` \| `HOLD`, `metadata` |
| **Notification** | One-shot send ledger | unique `(appointmentId, kind)` makes sends idempotent — currently used to claim the one-time `YOURE_NEXT` message |
| **Conversation** | Per-phone chat state | `state` (step), `context` (in-progress booking JSON) |
| **Staff** | Dashboard user | `email`, `passwordHash`, `name`, `role`, `active` |
| **Broadcast** | One-to-many message | `title`, `body`, `category`, `priority`, `status`, `scheduledAt`, `sentAt`, `recipientCount`, `createdBy*` |

**Typed domain errors** carry a stable `code` (`NOT_FOUND`, `SLOT_UNAVAILABLE`,
`OUTSIDE_HOURS`, `PAST_TIME`, `INVALID_TRANSITION`) mapped to HTTP status in one
middleware (`INVALID_TRANSITION → 409`).

> **No-shows are now first-class.** `NO_SHOW` is a real status set by staff, by the
> patient flow, or by the automatic sweep — not a derived estimate.

---

## 8. Feature walkthrough

### 8.1 Live token queue (the core)
Pure ordering/estimate maths in `domain/queue.ts`; orchestration in
`domain/scheduling.ts` (`SchedulingService`):
- **`queue.ts`** — `activeOrder(entries)` (the canonical order: `IN_PROGRESS`
  pinned to the front, then priority, then ascending token; excludes
  DONE/NO_SHOW/CANCELLED), `positionOf`, `estimateWaitMinutes(peopleAhead, avg)`,
  `suggestedArrival(now, sessionStart, wait, buffer)`, and `assertTransition`
  (legal status moves; throws `INVALID_TRANSITION`).
- **`SchedulingService`** — `quote(doctorId, date)` (estimate **before** booking),
  `joinQueue(...)` (assigns the next token; walk-ins start `ARRIVED`, bookings
  `WAITING`), `checkIn`, `startVisit`, `complete`, `markNoShow`, `cancel`, `hold`,
  `getQueue` (grouped board with per-entry position + wait), `statusOf`, and
  `sweepNoShows(graceMin)`. Every write appends an `AppointmentEvent`; token
  assignment runs in a transaction and is backstopped by the unique index.

### 8.2 Notifications
- **Inline confirmation** — joining the queue replies on WhatsApp with the token,
  position, wait estimate, and suggested arrival.
- **"You're next"** (`messaging/QueueNotifier`) — a one-time, **consent-gated**
  message to the patient now at the front of the queue, fired after any change
  that can move the front (join + every transition, from HTTP *and* chat).
  **Idempotent** via a claimed `Notification` ledger row, so it sends at most once
  per booking.
- **Broadcasts** — see §8.7.
- *(The slot-era 24h/2h reminders and doctor alerts were removed — a same-day
  queue has no future appointment time to remind about.)*

### 8.3 Staff dashboard
- **Login** (JWT cookie), role-aware nav.
- **Live Queue** (`/`) — doctor selector + date (default today), **10s
  auto-refetch**. Sections with counts: **Traveling** (`WAITING`), **Waiting here**
  (`ARRIVED`, in order, each showing token + position + estimated wait + a Priority
  badge), **With doctor** (`IN_PROGRESS`), **Done**, **No-shows**. One-tap actions:
  Traveling → `[Check in][Hold][No-show]`, Waiting here → `[Start][No-show]`, With
  doctor → `[Complete]`. The header shows queue length + the live wait a new
  patient would face.
- **New booking** (`/appointments/new`) — find patient by phone (autofill or
  capture name), choose doctor, toggle Priority, choose **type**: *Walk-in (here
  now)* → `ARRIVED`, or *Booking (coming later)* → `WAITING`. Shows the live quote
  before saving, then a result panel with the **token** and (for bookings) the
  **suggested arrival time to read out**.
- **Doctors** (ADMIN) — CRUD (incl. `avgConsultMinutes`) + weekly session-window
  editor.

### 8.4 Patient history
- **Directory** (`/patients`) — searchable list with per-patient counts (total,
  active, completed, cancelled) and last-visit date.
- **Detail** (`/patients/:id`) — stat cards (total / active / completed / no-show /
  cancelled), first/last visit, and a token timeline (queueDate + token + status).
- Pure summary logic in `domain/patient-history.ts`.

### 8.5 Per-doctor insights
- `/doctors/:id/insights` — monthly demand for one doctor: **tokens per day**
  (done segment shaded), totals (tokens / seen / no-shows), busiest day,
  average/day, **session hours**, with month navigation. Pure logic in
  `domain/doctor-insights.ts`; `GET /api/doctors/:id/insights?month=YYYY-MM`.

### 8.6 Operational analytics dashboard
`/analytics`, powered by `GET /api/analytics/dashboard`, computed from the real
queue data (pure core in `domain/analytics.ts`):
- **Doctor activity (today)** — per-doctor cards: joined today, seen (done) today,
  no-shows today, and **average actual consult minutes** (`startedAt → doneAt`).
- **Demand trends** — visit volume over time with Day (30) / Week (12) /
  Month (12) toggle (Recharts line chart), bucketed by `queueDate`.
- **Busiest hours & weekdays** — bar charts, peak highlighted.
- **Demand heatmap** — hour × weekday matrix, colour-intensity by volume.
- **Patient insights** — new vs returning donut + returning % + retention %
  (DONE-based).
- **Doctor leaderboard** — sortable by most seen / most no-shows / fewest no-shows
  / fastest consult, with medals for the top 3.

### 8.7 Broadcast messaging
`/broadcasts`, `GET|POST /api/broadcasts`:
- Compose a **title + message**, pick a **category** (Marketing, Bootcamp, Blood
  Donation, Health Camp, Promotion, Doctor Update, Reminder, Emergency Notice,
  Custom) and **priority** (Low/Normal/High/Urgent).
- **Send now or schedule** for later. Scheduled ones dispatch via a per-minute
  cron.
- Sent **only to consented patients**; phone numbers are never logged.
- **History** with search + category/status filters and **analytics** (total
  broadcasts sent, total patients reached, scheduled count).
- Logic in `messaging/BroadcastService`.

### 8.8 Multilingual support
- Languages: **English, Telugu, Hindi**. The patient picks a language at the start
  of the chat; it's stored on the patient and reused for every message.
- **Important:** this is a **hand-written translation dictionary**
  (`messaging/i18n.ts`), *not* AI translation. The bot understands menu taps,
  numbers, and a few keywords ("arrived", "status") — not free text.

---

## 9. The WhatsApp bot (conversation flow)

A per-sender state machine (`messaging/engine.ts`). It uses WhatsApp interactive
UI — **quick-reply buttons** for ≤3 options, **list pickers** for 4+.

```
greet
  └─▶ CHOOSE_LANGUAGE  (English / తెలుగు / हिंदी)
        └─▶ CHECK_EMERGENCY  ("Medical emergency?" → Yes: call 108 & end)
              └─▶ CHOOSE_ACTION (main menu)
                    ├─ Book ─▶ [ASK_NAME if new] ─▶ CHOOSE_DOCTOR
                    │            ─▶ show QUOTE ("~N ahead, ~X min, arrive ~HH:MM — book?")
                    │            ─▶ CONFIRM ─▶ joinQueue → token + position + wait + arrival
                    ├─ Cancel ───▶ pick an active token ─▶ cancel
                    ├─ My tokens (live status)
                    ├─ Our Doctors / About Hospital / Talk to Reception

Global keyword intents (work at any time):
  "arrived" / "here"        → check the patient in, reply position + wait
  "status" / "how long"     → reply position + wait for their active tokens

Automatic: a one-time, consent-gated "you're next" when a booking reaches the
front of the queue.
```

- New patients are asked their name once; messaging the clinic = **consent**, so
  `consentAt` is captured then.
- Conversation state is **persisted per phone**, so a booking survives across
  messages and restarts. Sending `menu`/`hi` restarts.
- The engine talks only to `SchedulingService` for any queue read/write — it can't
  corrupt ordering or assign a bad token.

Drive the whole flow locally with the Mock channel: `cd api && npm run chat`.

---

## 10. API reference

All `/api/*` routes require a valid staff session cookie unless noted. Every body
and query is zod-validated; `DomainError.code` maps to an HTTP status in one
middleware (`NOT_FOUND → 404`, `INVALID_TRANSITION → 409`).

### Auth
- `POST /api/auth/login` — email + password → sets httpOnly cookie.
- `POST /api/auth/logout`
- `GET  /api/auth/me` — current staff or 401.

### Doctors, availability & queue
- `GET  /api/doctors` — list.
- `POST /api/doctors` *(ADMIN)* — create (incl. `avgConsultMinutes`).
- `PATCH /api/doctors/:id` *(ADMIN)* — update.
- `GET  /api/doctors/:id/availability`
- `PUT  /api/doctors/:id/availability` *(ADMIN)* — replace weekly session windows.
- `GET  /api/doctors/:id/quote?date=YYYY-MM-DD` — estimate **before** booking
  (people ahead + wait + suggested arrival).
- `GET  /api/doctors/:id/queue?date=YYYY-MM-DD` — grouped live board.
- `GET  /api/doctors/:id/insights?month=YYYY-MM` — monthly demand.

### Bookings (queue entries)
- `POST /api/bookings` — `{doctorId, date?, patientName, patientPhone, isPriority?,
  isWalkIn?}` → join the queue; returns `{bookingId, token, position,
  estimateWaitMinutes, suggestedArrival}`.
- `GET  /api/bookings/:id` — live status (position + wait).
- `POST /api/bookings/:id/checkin | /start | /complete | /no-show | /cancel | /hold`
  — lifecycle transitions (illegal moves → `409 INVALID_TRANSITION`).

### Patients
- `GET  /api/patients?phone=E164` — lookup (for booking).
- `GET  /api/patients` — directory with per-patient queue stats (`?q=` search).
- `GET  /api/patients/:id` — patient + summary + token history.
- `POST /api/patients` — create.

### Analytics
- `GET  /api/analytics/dashboard` — doctor activity + demand + heatmap + patient
  insights (all derived from the real queue data).

### Broadcasts
- `POST /api/broadcasts` — create + send now or schedule.
- `GET  /api/broadcasts?search=&category=&status=&priority=` — history with filters.
- `GET  /api/broadcasts/stats` — total sent, total reached, scheduled.
- `GET  /api/broadcasts/:id`

### Webhook
- `POST /webhook` — inbound WhatsApp messages (Twilio signature-validated when
  configured).

---

## 11. Background jobs

node-cron, in-process for V1 (a comment marks where BullMQ + Redis takes over):

- **Broadcast dispatch** (`jobs/broadcasts.ts`) — every minute; sends scheduled
  broadcasts that are now due, idempotently (re-checks status before sending).
- **No-show sweep** (`jobs/no-show.ts` + `SchedulingService.sweepNoShows`) — every
  5 minutes; once a doctor's **session end + `NO_SHOW_GRACE_MIN`** (default 30) has
  passed, flips any still-`WAITING` token to `NO_SHOW`. Idempotent (only touches
  `WAITING`, skips `ARRIVED`/`DONE`/`CANCELLED`), and writes an `AppointmentEvent`.

---

## 12. Security, privacy & compliance

- **Consent before contact.** No patient is messaged without `consentAt`. Joining
  the queue / first inbound message is treated as consent.
- **No PII in logs.** Phone numbers and patient names are never logged at info
  level. State changes are recorded via `AppointmentEvent`.
- **Secrets via env only** (`api/.env`, gitignored). Never hardcoded.
- **Auth.** bcrypt password hashes; JWT in an httpOnly cookie; role checks in
  middleware. A dev-only `AUTH_BYPASS` exists, off by default.
- **Webhook integrity.** Twilio signatures validated when `TWILIO_AUTH_TOKEN` is
  set.
- **No diagnosis.** The bot never interprets symptoms beyond routing/urgency.

---

## 13. Testing & quality

- **Vitest** unit tests for the pure domain logic (queue ordering/estimates/
  transitions, scheduling incl. the no-show sweep, analytics, patient-history,
  doctor-insights, broadcasts) and **supertest** integration tests for the HTTP
  layer (auth, bookings + transitions incl. `INVALID_TRANSITION` and 401,
  patients, analytics, doctor-insights, broadcasts).
- WhatsApp flows are tested against the **Mock channel** (e.g. full book → arrived).
- The **InMemoryRepository** lets the whole API be tested end-to-end without a
  database.
- **Definition of done** for any change: `npm run typecheck`, `npm run lint`,
  `npm test` all pass in each app, and the feature runs end-to-end.

---

## 14. Local setup

```bash
# 1. Database (Neon) — put both in api/.env:
#    DATABASE_URL=...   (pooled, includes pgbouncer=true)
#    DIRECT_URL=...     (non-pooled, for migrations)
#    JWT_SECRET=...
#    (optional) TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
#    Without Twilio vars, the Mock channel is used (logs instead of sends).

cd api
npm install
npm run db:migrate      # apply migrations (prisma migrate)
npm run db:seed         # full sample data (doctors, patients, a live queue, broadcasts)
npm run db:seed:admin   # an admin staff login (env: SEED_ADMIN_EMAIL/PASSWORD)
npm run dev             # API on http://localhost:3000

# Chat with the bot locally (Mock channel REPL):
npm run chat

cd ../web
npm install
npm run dev             # dashboard

# Checks (run in each app):
npm run typecheck && npm run lint && npm test
```

**Environment variables:** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
`PORT`, `NODE_ENV`, `AUTH_COOKIE_NAME`, `JWT_EXPIRES_SECONDS`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
`TWILIO_MESSAGING_SERVICE_SID`, `PUBLIC_URL`, `NO_SHOW_GRACE_MIN` (default 30),
`AUTH_BYPASS` (dev only), `ANTHROPIC_API_KEY` (future AI).

> The default seed creates two staff logins: `admin@clinic.test` / `admin1234`
> (ADMIN) and `reception@clinic.test` / `reception1234` (RECEPTIONIST). Change
> these before any real deployment.

---

## 15. Known limitations & tech debt

- **No no-show *prediction*.** No-shows are now tracked and swept, but the system
  doesn't predict who's likely to skip or act on it proactively (see §16-A).
- **`avgConsultMinutes` is a fixed per-doctor number**, set by hand — not learned
  from the actual `startedAt → doneAt` history the system already records.
- **No doctor-running-late handling.** If a doctor is delayed, waiting patients
  aren't proactively told; the board just reflects reality.
- **No-show sweep covers today only.** A `WAITING` token left from a previous day
  (e.g. after downtime) isn't swept.
- **Broadcast precision is per-minute** (cron cadence) and fan-out is sequential
  in-process — fine for small clinics, needs BullMQ at scale. No per-recipient
  delivery tracking, opt-out, or rate limiting yet.
- **No AI layer.** "Multilingual" is a static dictionary + a language picker; the
  bot can't understand free text (beyond a couple of keywords).
- **Analytics loads broad datasets in memory** (fine for small/mid clinics;
  revisit with aggregation queries as volume grows).
- **`CLAUDE.md` is stale** — it still describes the old slot model; this overview
  and the code are the current source of truth.

---

## 16. Open problems & ideas wanted

> **For AI models and contributors:** this is where the project wants ideas.
> Respect the constraints below, then riff. The headline goal is to waste even
> less clinical time, on top of the queue model (§3).

### Constraints to honor
- **Audience:** small/mid clinics in India; patients on WhatsApp, low friction,
  often not tech-savvy; multilingual (en/te/hi today).
- **Channel:** WhatsApp (Twilio now, Meta Cloud later). Messages cost money and
  are consent-gated; don't propose spamming patients.
- **No diagnosis, ever.** Anything touching symptoms is routing/urgency only.
- **Architecture:** keep the domain core pure; new external things go behind
  adapters; validate all inputs; store UTC, show IST; queue notifications and
  broadcasts must stay idempotent.
- **The AI layer, when built, may only produce structured intents** — it must not
  decide ordering or write to the DB directly.
- **The model is a same-day live queue, not slots.** Ideas should fit a queue
  (tokens, positions, live waits), not reintroduce a fixed appointment grid.

### Problem A — Predict & pre-empt no-shows
The queue already tracks real no-shows and sweeps stale tokens. Still open:
- **No-show risk scoring** from each patient's history (past no-shows, lead time,
  walk-in vs booking, day/time). Use it to drive *actions*, not labels.
- **Smart, escalating confirm prompts** for "coming later" bookings — e.g. a
  confirm-or-release nudge as their turn approaches, freeing the token on silence.
- **Soft commitment** — a "confirm to hold your token" step for high-risk
  bookings.

### Problem B — Doctor lateness & flow
- **Doctor running-late broadcasts** — when a doctor starts late or pauses,
  proactively message the people on the way with a new expected time.
- **Learned consult lengths** — replace the static `avgConsultMinutes` with a
  rolling estimate from each doctor's actual `startedAt → doneAt` history (the data
  is already logged), so wait estimates self-calibrate.
- **Catch-up / re-sequencing hints** — when the day slips, suggest pulling a
  short-visit patient forward.

### Problem C — Fill idle time & raise utilization
- Use the existing **demand + heatmap + activity** analytics to recommend session
  changes (open more hours on busy weekdays, trim dead ones).
- **Recall campaigns** via broadcasts — nudge patients overdue for a follow-up
  (using history), respecting consent and frequency caps.

### Problem D — The AI layer (still unbuilt)
- A `NluAdapter` (LLM) that converts a free-text WhatsApp message ("can I see a
  skin doctor today?") into a **structured, zod-validated intent**
  (action=join-queue, department=dermatology), which the deterministic core then
  fulfills. Department routing + urgency flag only — no diagnosis.
- Multilingual *understanding* (not just the current static dictionary).

### How to propose
Frame ideas as: the problem it targets, the patient/staff experience, the data it
needs (and whether we already log it), where it lives in the architecture (core /
adapter / job / UI), failure modes, and the WhatsApp-cost / consent implications.

---

## 17. Glossary

- **Queue entry** (the `Appointment` record) — a patient's place in a doctor's
  daily queue.
- **Token** — the sequential number for a queue entry, unique per doctor per
  `queueDate`, starting at 1.
- **Active order** — the canonical queue order: `IN_PROGRESS` pinned to the front,
  then priority, then ascending token (DONE/NO_SHOW/CANCELLED excluded).
- **Quote** — the pre-booking estimate: people ahead, wait minutes, suggested
  arrival time.
- **Walk-in** — a patient physically present; joins as `ARRIVED`.
- **Booking** — a patient coming later; joins as `WAITING`.
- **"You're next"** — a one-time, consent-gated message to the front of the queue.
- **`avgConsultMinutes`** — a doctor's average visit length; drives wait estimates.
- **Session window** (`Availability`) — a doctor's recurring weekly open hours
  (no slots are derived from it).
- **Consent (`consentAt`)** — the moment a patient is allowed to be messaged.
- **ChannelAdapter** — the interface over the messaging provider (Mock | Twilio).
- **Repository** — the interface over storage (InMemory | Prisma).
- **Domain core** — the pure, I/O-free business logic.
- **Broadcast** — one message sent to many consented patients.
- **IST** — Asia/Kolkata, the clinic's display timezone (storage is UTC).

---

*This document describes the system as built (queue model). The code is the source
of truth; where this drifts, trust `api/src/domain/types.ts`,
`api/prisma/schema.prisma`, and the route files.*
