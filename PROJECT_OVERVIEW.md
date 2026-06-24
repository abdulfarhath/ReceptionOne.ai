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

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [The problem & the vision](#2-the-problem--the-vision)
3. [The core operational problem to solve next](#3-the-core-operational-problem-to-solve-next)
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
  identified by phone number. They can book, reschedule, cancel, view
  appointments, see doctors, and read clinic info — in **English, Telugu, or
  Hindi**.
- **Staff** use a **web dashboard** to manage doctors, availability, and
  appointments, and to see analytics and send broadcasts.
- **Three capabilities, in priority order:**
  1. **Appointments** — book / reschedule / cancel (the core).
  2. **Notifications** — confirmations, reminders (24h + 2h), doctor alerts.
  3. **AI (future, optional)** — interpret free-text/multilingual messages and
     route symptoms to a department. **Not built yet.** It will never diagnose.
- **Built and working today** (beyond the core): patient history, per-doctor
  insights, an operational analytics dashboard, and broadcast messaging.
- **The next big problem to crack:** wasted clinical time from no-shows, late
  cancellations, and doctors running late. See [§3](#3-the-core-operational-problem-to-solve-next).

---

## 2. The problem & the vision

### The status quo in a small clinic
- A receptionist answers phones, writes appointments in a book, and calls people
  to remind/confirm. This is slow, error-prone, and doesn't scale.
- Patients can only book during office hours and often just walk in.
- No data: the clinic can't see demand patterns, doctor utilization, or who its
  patients are.

### The product
A patient messages the clinic's WhatsApp number and a bot walks them through
booking. Staff see everything on a dashboard. Reminders go out automatically.
Everything is logged, so the clinic finally has **operational data**.

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

## 3. The core operational problem to solve next

> This is the section the project owner most wants ideas on. **Clinical time is
> the scarcest resource in a clinic, and today a lot of it is wasted.**

A booked slot is a promise that often breaks:

- **Patient no-shows.** The patient simply doesn't come. The slot is gone — no
  one else could book it, and the doctor sits idle.
- **Late cancellations / reschedules.** The patient cancels an hour before. Too
  late to fill the slot.
- **Doctors running late or absent.** The doctor arrives late or gets pulled into
  an emergency; the whole day's schedule cascades and patients wait.
- **Over-cautious gaps.** Fixed slot lengths don't match reality — some visits
  run long, some short — so there's either idle time or a pile-up.

**Why it matters:** in a fee-per-visit clinic, an empty slot is lost revenue and
a longer wait for everyone else. The clinic feels this daily but has no tools for
it.

**What the system already gives us to work with:**
- Every appointment and its lifecycle is logged (`AppointmentEvent`), so we have
  a real history of booked / completed / cancelled / rescheduled per patient and
  per doctor.
- We already compute an **estimated no-show** signal (a past appointment still
  marked `BOOKED`, never completed or cancelled) and surface it in analytics.
- We have a WhatsApp channel that can message patients, and a job runner
  (node-cron) for time-based actions.
- We have per-patient history (how reliable is this patient?) and per-doctor
  demand patterns.

**What we do NOT have yet:** any active mitigation. The system observes the
problem; it doesn't fight it. That's the gap.

A catalogue of candidate directions (for humans and AI to expand on) is in
[§16](#16-open-problems--ideas-wanted).

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
            │   (scheduling, analytics, broadcasts rules) │
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
   results. This is what makes scheduling logic testable and trustworthy.
2. **Everything external is a swappable adapter behind an interface:**
   - `Repository` → `InMemoryRepository` (tests/dev) | `PrismaRepository` (prod)
   - `ChannelAdapter` → `MockChannelAdapter` (tests/CLI) | `TwilioWhatsAppChannelAdapter`
   - `ConversationStore` → InMemory | Prisma
   - (future) `NluAdapter` → Keyword | LLM
3. **The conversation engine is a deterministic state machine, not an AI.** It
   formats options and parses numbered/tapped replies. It *never* decides slot
   availability or writes appointments — that always goes through the domain core.
4. **The (future) AI layer may only turn text into a structured, zod-validated
   intent.** It must not decide availability or write to the DB.
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
| Jobs        | node-cron (reminders, broadcast dispatch). At scale → BullMQ + Redis. |
| Tests       | Vitest + supertest (API). |
| Tooling     | ESLint + Prettier. |

> **Stack is intentionally conventional.** Substituting any of it is a deliberate
> decision, not a default.

---

## 6. Repository layout

```
/api    Backend
  src/domain/       PURE core: scheduling, analytics, doctor-insights,
                    patient-history, broadcast rules, types, typed DomainErrors
  src/repository/   Repository interface + InMemory + Prisma adapters
  src/auth/         password hashing, staff lookup, JWT sign/verify
  src/http/         Express app, routes, error + auth middleware
  src/messaging/    ChannelAdapter + Mock + Twilio + ConversationEngine
                    + conversation state/store + i18n dictionary + chat CLI
                    + NotificationService + BroadcastService
  src/jobs/         reminder cron + broadcast-dispatch cron
  prisma/           schema + migrations + seed + seed-admin
/web    Frontend (React + Vite) — the staff dashboard
  src/pages/        login, day-view, new-appointment, patients, patient-detail,
                    doctors, doctor-insights, analytics, broadcasts
  src/components/   dialogs, charts (analytics/), shadcn ui/ primitives
  src/lib/          api client, zod schemas, time helpers, broadcast metadata
```

The web app talks to the API over HTTP only (`/api/*`).

---

## 7. Domain model

Source of truth: `api/src/domain/types.ts` + `api/prisma/schema.prisma`.

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| **Doctor** | A practitioner | `name`, optional `phone` (for booking alerts), `department`, `slotDurationMinutes` |
| **Availability** | Weekly working window | `dayOfWeek` (0=Sun..6=Sat), `startMinutes`/`endMinutes` (minutes-from-midnight, UTC) |
| **Patient** | Identified by phone | `phone` (E.164, unique), `name`, `language` (`en`/`te`/`hi`), `consentAt` (null until captured) |
| **Appointment** | A booked slot | `doctorId`, `patientId`, `start`/`end` (UTC), `status` = `BOOKED` \| `CANCELLED` \| `COMPLETED` |
| **AppointmentEvent** | Append-only audit log | `type` = `BOOKED` \| `RESCHEDULED` \| `CANCELLED` \| `COMPLETED`, `metadata` |
| **Notification** | Outbound reminder ledger | unique `(appointmentId, kind)` makes reminders idempotent (`REMINDER_24H`, `REMINDER_2H`) |
| **Conversation** | Per-phone chat state | `state` (step), `context` (in-progress booking JSON) |
| **Staff** | Dashboard user | `email`, `passwordHash`, `name`, `role`, `active` |
| **Broadcast** | One-to-many message | `title`, `body`, `category`, `priority`, `status`, `scheduledAt`, `sentAt`, `recipientCount`, `createdBy*` |

**Typed domain errors** carry a stable `code` (`SLOT_UNAVAILABLE`,
`OUTSIDE_HOURS`, `PAST_TIME`, `NOT_FOUND`) mapped to HTTP status in one middleware.

> **Note for the no-show problem:** there is **no `NO_SHOW` status**. "Estimated
> no-shows" are *derived* as past appointments still marked `BOOKED`. A real
> no-show / check-in / lateness model does not exist yet — that's a deliberate
> open door (see §16).

---

## 8. Feature walkthrough

### 8.1 Appointments (the core)
Pure scheduling logic in `domain/scheduling.ts`:
- `getAvailableSlots(doctorId, day)` — free slot start times, excluding booked
  and past slots, derived from the doctor's weekly availability + slot length.
- `book`, `reschedule`, `cancel` — each validates (not in the past, within the
  doctor's hours, slot free) and writes inside a DB transaction, appending an
  `AppointmentEvent`. Booking a taken slot throws `SLOT_UNAVAILABLE`.

### 8.2 Notifications
`messaging/NotificationService`:
- **Confirmations** on book/reschedule/cancel (in the patient's language).
- **Reminders** 24h and 2h before, via a cron pass. **Idempotent** — a ledger row
  is claimed before sending, so a reminder is never sent twice and the job is
  safe to re-run. A reschedule re-arms reminders.
- **Doctor alerts** — if a doctor has a phone, they get a message on new
  bookings/reschedules/cancellations.
- **Consent-gated** — nothing is sent to a patient without `consentAt`.

### 8.3 Staff dashboard
- **Login** (JWT cookie), role-aware nav.
- **Day view** — appointments for a date, by doctor.
- **New appointment** — staff-side booking with a slot picker.
- **Doctors** (ADMIN) — CRUD + weekly availability editor.

### 8.4 Patient history
- **Directory** (`/patients`) — searchable list with per-patient counts (total,
  upcoming, completed, cancelled) and last-visit date.
- **Detail** (`/patients/:id`) — stat cards + first/last visit + next appointment
  + a full reverse-chronological appointment timeline.
- Pure summary logic in `domain/patient-history.ts`.

### 8.5 Per-doctor insights
- `/doctors/:id/insights` — monthly demand for one doctor: free-slot lookup for a
  day, weekly hours, a bookings-per-day bar chart, busiest-day, average/day, with
  month navigation. Pure logic in `domain/doctor-insights.ts`;
  `GET /api/doctors/:id/insights?month=YYYY-MM`.

### 8.6 Operational analytics dashboard
`/analytics`, powered by `GET /api/analytics/dashboard`, computed from the real
appointments + availability data (pure core in `domain/analytics.ts`):
- **Doctor utilization (today)** — per-doctor gauge cards: booked today, total
  slots today, utilization %, open slots today, open slots this week.
- **Demand trends** — bookings over time with Day (30) / Week (12) / Month (12)
  toggle (Recharts line chart).
- **Busiest hours & weekdays** — bar charts, peak highlighted.
- **Demand heatmap** — hour × weekday matrix, colour-intensity by volume.
- **Patient insights** — new vs returning donut + returning % + retention %.
- **Doctor leaderboard** — sortable by most booked / utilization / most/fewest
  estimated no-shows, with medals for the top 3.

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
- Languages: **English, Telugu, Hindi**. The patient picks a language at the
  start of the chat; it's stored on the patient and reused for confirmations and
  reminders.
- **Important:** this is a **hand-written translation dictionary**
  (`messaging/i18n.ts`), *not* AI translation. The bot understands menu taps and
  numbers, not free text. (A bug where the language reverted to English
  mid-conversation has been fixed — the session's chosen language is now the
  source of truth and is persisted.)

---

## 9. The WhatsApp bot (conversation flow)

A per-sender state machine (`messaging/engine.ts`). It uses WhatsApp interactive
UI — **quick-reply buttons** for ≤3 options, **list pickers** for 4+.

```
greet
  └─▶ CHOOSE_LANGUAGE  (English / తెలుగు / हिंदी)
        └─▶ CHECK_EMERGENCY  ("Medical emergency?" → Yes: call 108 & end)
              └─▶ CHOOSE_ACTION (main menu)
                    ├─ Book appointment ─▶ [ASK_NAME if new] ─▶ CHOOSE_DOCTOR ─▶ CHOOSE_SLOT ─▶ CONFIRM
                    ├─ Reschedule ───────▶ CHOOSE_APPOINTMENT ─▶ CHOOSE_SLOT ─▶ CONFIRM
                    ├─ Cancel ───────────▶ CHOOSE_APPOINTMENT ─▶ CONFIRM
                    ├─ My appointments   (list upcoming)
                    ├─ Our Doctors       (list)
                    ├─ About Hospital    (info)
                    └─ Talk to Reception (info)
```

- New patients are asked their name once; messaging the clinic = **consent**, so
  `consentAt` is captured then.
- Conversation state is **persisted per phone**, so a booking survives across
  messages and restarts. Sending `menu`/`hi` restarts.
- The engine talks only to `SchedulingService` for any availability check or
  write — it can't accidentally double-book.

You can drive the whole flow locally with the Mock channel: `cd api && npm run chat`.

---

## 10. API reference

All `/api/*` routes require a valid staff session cookie unless noted. Every body
and query is zod-validated; `DomainError.code` maps to an HTTP status in one
middleware.

### Auth
- `POST /api/auth/login` — email + password → sets httpOnly cookie.
- `POST /api/auth/logout`
- `GET  /api/auth/me` — current staff or 401.

### Doctors & availability
- `GET  /api/doctors` — list.
- `POST /api/doctors` *(ADMIN)* — create.
- `PATCH /api/doctors/:id` *(ADMIN)* — update.
- `GET  /api/doctors/:id/availability`
- `PUT  /api/doctors/:id/availability` *(ADMIN)* — replace weekly windows.
- `GET  /api/doctors/:id/slots?date=YYYY-MM-DD` — free slots.
- `GET  /api/doctors/:id/insights?month=YYYY-MM` — monthly demand.

### Patients
- `GET  /api/patients?phone=E164` — lookup (for booking).
- `GET  /api/patients` — directory with per-patient history stats (`?q=` search).
- `GET  /api/patients/:id` — patient + summary + full history.
- `POST /api/patients` — create.

### Appointments
- `GET  /api/appointments?date=YYYY-MM-DD[&to=...&doctorId=...]` — day/range view.
- `POST /api/appointments` — book.
- `POST /api/appointments/:id/reschedule`
- `POST /api/appointments/:id/cancel`

### Analytics
- `GET  /api/analytics/dashboard` — utilization + demand + heatmap + patient
  insights (all derived from real data).

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

- **Reminder pass** (`jobs/reminders.ts`) — every 2 minutes by default; sends 24h
  and 2h reminders, idempotently. Enable with `ENABLE_REMINDERS=true`; runnable
  standalone with `npm run reminders`.
- **Broadcast dispatch** (`jobs/broadcasts.ts`) — every minute; sends scheduled
  broadcasts that are now due, idempotently (re-checks status before sending).

---

## 12. Security, privacy & compliance

- **Consent before contact.** No patient is messaged without `consentAt`. The
  first inbound message is treated as consent.
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

- **Vitest** unit tests for the pure domain logic (scheduling, analytics,
  patient-history, doctor-insights, broadcasts) and **supertest** integration
  tests for the HTTP layer (auth, patients, analytics, doctor-insights,
  broadcasts).
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
npm run db:seed         # sample data
npm run db:seed:admin   # an admin staff login
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
`TWILIO_MESSAGING_SERVICE_SID`, `PUBLIC_URL`, `ENABLE_REMINDERS`,
`REMINDER_CRON`, `AUTH_BYPASS` (dev only), `ANTHROPIC_API_KEY` (future AI).

---

## 15. Known limitations & tech debt

- **No real no-show / check-in / lateness model.** No-shows are only *estimated*
  from past-but-still-booked appointments. There's no way for staff to mark a
  patient as arrived, seen, or no-show. (This is the biggest gap — see §16.)
- **Fixed slot lengths.** Every slot for a doctor is the same duration; real
  visits vary.
- **No waitlist / standby.** A freed slot is just… free. Nobody is offered it.
- **Broadcast precision is per-minute** (cron cadence) and fan-out is sequential
  in-process — fine for small clinics, needs BullMQ at scale. Broadcasts have no
  per-recipient delivery tracking, opt-out, or rate limiting yet.
- **No AI layer.** "Multilingual" is a static dictionary + a language picker; the
  bot can't understand free text.
- **No patient-facing reschedule deep-links, payments, or deposits.**
- **Analytics loads broad datasets in memory** (fine for small/mid clinics;
  revisit with aggregation queries as volume grows).

---

## 16. Open problems & ideas wanted

> **For AI models and contributors:** this is where the project wants ideas.
> Respect the constraints below, then riff. The headline problem is **wasted
> clinical time** (§3).

### Constraints to honor
- **Audience:** small/mid clinics in India; patients on WhatsApp, low friction,
  often not tech-savvy; multilingual (en/te/hi today).
- **Channel:** WhatsApp (Twilio now, Meta Cloud later). Messages cost money and
  are consent-gated; don't propose spamming patients.
- **No diagnosis, ever.** Anything touching symptoms is routing/urgency only.
- **Architecture:** keep the domain core pure; new external things go behind
  adapters; validate all inputs; store UTC, show IST; reminders/broadcasts must
  stay idempotent.
- **The AI layer, when built, may only produce structured intents** — it must not
  decide availability or write to the DB directly.

### Problem A — Reduce no-shows & late cancellations
Seed ideas to evaluate/design (not endorsements):
- **No-show risk scoring** from each patient's history (past no-shows, lead time,
  day/time, how often they reschedule). Use it to drive *actions*, not labels.
- **Smart, escalating reminders** — e.g. a confirm-or-cancel prompt ("Reply 1 to
  confirm, 2 to cancel") at 24h and 2h, freeing the slot automatically on "2" or
  silence past a cutoff.
- **Waitlist / standby list** — when a slot frees (cancel or auto-released
  no-show), offer it to the next waitlisted patient on a first-reply-wins basis.
- **Soft commitment** — deposits or a "confirm to hold" step for high-risk
  bookings; refundable on attendance.
- **Overbooking models** — controlled double-booking of slots with the highest
  predicted no-show probability, with guardrails so genuine arrivals aren't
  turned away.
- **Self-serve, low-friction reschedule** — make changing a time one tap, so
  patients reschedule instead of ghosting.

### Problem B — Doctor lateness & schedule cascades
- A **check-in / queue model**: patient marks "I've arrived"; staff see a live
  queue; the system estimates and broadcasts realistic wait times.
- **Doctor running-late broadcasts** — when a doctor is delayed, proactively
  message affected patients with the new expected time and a reschedule option.
- **Dynamic slotting** — learn each doctor's true average visit length per
  department and size slots accordingly, instead of one fixed duration.
- **Catch-up logic** — when the day slips, suggest which slots to compress or
  which patients to proactively move.

### Problem C — Fill idle time & raise utilization
- Use the existing **utilization + demand + heatmap** analytics to recommend
  availability changes (open more hours on busy weekdays, trim dead ones).
- **Recall campaigns** via broadcasts — nudge patients overdue for a follow-up or
  a seasonal checkup (using history), respecting consent and frequency caps.

### Problem D — The AI layer (still unbuilt)
- A `NluAdapter` (LLM) that converts a free-text WhatsApp message ("can I see a
  skin doctor tomorrow evening?") into a **structured, zod-validated intent**
  (action=book, department=dermatology, timeframe=tomorrow-evening), which the
  deterministic core then fulfills. Department routing + urgency flag only — no
  diagnosis.
- Multilingual *understanding* (not just the current static dictionary).

### How to propose
Frame ideas as: the problem it targets, the patient/staff experience, the data it
needs (and whether we already log it), where it lives in the architecture (core /
adapter / job / UI), failure modes, and the WhatsApp-cost / consent implications.

---

## 17. Glossary

- **Slot** — a bookable time block for a doctor (length = `slotDurationMinutes`).
- **Availability** — a doctor's recurring weekly working windows.
- **Consent (`consentAt`)** — the moment a patient is allowed to be messaged.
- **ChannelAdapter** — the interface over the messaging provider (Mock | Twilio).
- **Repository** — the interface over storage (InMemory | Prisma).
- **Domain core** — the pure, I/O-free business logic.
- **Estimated no-show** — a *derived* signal: a past appointment still marked
  `BOOKED`. Not a tracked status (yet).
- **Broadcast** — one message sent to many consented patients.
- **IST** — Asia/Kolkata, the clinic's display timezone (storage is UTC).

---

*This document describes the system as built. The code is the source of truth;
where this drifts, trust `api/src/domain/types.ts`, `api/prisma/schema.prisma`,
and the route files.*
