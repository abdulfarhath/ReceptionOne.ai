# Project: receptionone.ai — WhatsApp-first clinic appointment system
<!-- Keep this file lean (<200 lines): Claude Code reads it every session and
     adherence drops if it gets bloated. -->

## What this is
A production-bound app that replaces a clinic's phone-and-front-desk booking with
a chat bot + a staff web dashboard. Built for small/mid clinics in India. Three
capabilities, in priority order:
1. **Appointments** — book / reschedule / cancel (the core). **Built.**
2. **Notifications** — patient confirmations, 24h/2h reminders, doctor alerts. **Built.**
3. **(Later, optional) AI** — interpret free-text/multilingual messages and route
   symptoms to the right department. It NEVER diagnoses. **Not built yet** (see
   "Multilingual vs AI" so you don't confuse the two).

## Current status (what actually works today)
- A **deterministic conversation state machine** (`api/src/messaging/engine.ts`)
  drives the WhatsApp booking flow with tappable interactive UI (quick-reply
  buttons for ≤3 options, list-pickers for 4+). It NEVER decides availability or
  writes appointments — every check/write goes through `SchedulingService`.
- Flow: **choose language → emergency check → main menu → action**. Actions: Book,
  Reschedule, Cancel, My appointments, Our Doctors, About Hospital, Talk to Reception.
  New patients are asked their name once (which also captures consent).
- **Emergency triage**: a yes/no step that, on "yes", tells the patient to call 108 /
  the clinic emergency number and ends. It does NOT diagnose — hand-off only.
- Conversations are **persisted per phone** (`Conversation` table) so a booking
  survives across messages. Twilio WhatsApp is wired; Mock covers dev/tests/CLI.
- **Staff dashboard**: login, day view of appointments, create-appointment (slot
  picker + reschedule), doctor management (CRUD + weekly availability, admin-only).

### Multilingual vs AI (important distinction)
Multilingual support (English / Telugu / Hindi) lives in `api/src/messaging/i18n.ts`
as a **hand-written translation dictionary**, keyed by a language the patient picks
at the start of the chat (stored on `Patient.language`). There is **no LLM/NLU
adapter yet** — the bot understands only numbered/tapped menu choices, not free text.
Do not assume an AI layer exists. When built, it may ONLY turn user text into a
structured, zod-validated intent — never decide slot availability or write to the DB.

## Tech stack (do not substitute without asking me)
- TypeScript (strict) everywhere. Node 20+. ESM (`"type": "module"`).
- Backend: Express 5 + zod (validation) + Prisma (ORM). Logging: pino (pino-pretty in dev).
- Database: PostgreSQL on Neon, via DATABASE_URL. Prisma uses a separate DIRECT_URL
  for migrations (Neon's non-pooled endpoint). No Docker.
- Frontend: React 19 + Vite + Tailwind v4 + shadcn/ui (Radix) + TanStack Query +
  React Router v7 + react-hook-form + zod. Toasts via sonner, icons via lucide-react.
- Auth: staff log in with email+password (bcryptjs), JWT in an httpOnly cookie.
  Roles ADMIN | RECEPTIONIST. Patients do NOT log in — identified by phone number.
- Messaging: a `ChannelAdapter` interface. WhatsApp via Twilio (free sandbox for now)
  is the channel; MockChannelAdapter covers local dev, the `npm run chat` CLI, and
  automated tests. Swapping to the direct Meta Cloud API later is just another adapter.
- Jobs: node-cron for reminders in V1 (code notes where BullMQ+Redis scales it).
- Tests: Vitest (+ supertest for the API). Tooling: ESLint + Prettier.

## Repo layout
```
/api    Backend. Contains the pure domain core.
        api/src/domain/      scheduling + types + DomainError — NO db/http/whatsapp/ai
        api/src/repository/  Repository interface + InMemory + Prisma adapters (+ staff repo)
        api/src/auth/        password hashing, staff lookup, JWT sign/verify
        api/src/http/        Express app, routes, error + auth middleware
        api/src/messaging/   ChannelAdapter + Mock + Twilio + engine (state machine)
                             + conversation state/store + i18n dictionary + chat CLI
        api/src/jobs/        reminder cron (in-process or standalone worker)
        api/prisma/          schema + migrations + seed + seed-admin
/web    Frontend (React + Vite): the staff dashboard.
        web/src/pages/       login, day-view, new-appointment, doctors
        web/src/components/  dialogs (doctor form, availability, reschedule, confirm),
                             slot-picker, layout, route-guards, ui/ (shadcn primitives)
        web/src/lib/         api client, zod schemas, time helpers
```
The web app talks to the API over HTTP only (`/api/*`). Postgres is on Neon — no Docker.

## Architecture rules (these ARE the product — keep them)
- The domain core (`api/src/domain`) is PURE: no DB, no HTTP, no chat, no AI.
  It talks to a `Repository` interface.
- Everything external is a swappable adapter behind an interface:
  Repository (InMemory | Prisma), ChannelAdapter (Mock | TwilioWhatsApp),
  ConversationStore (InMemory | Prisma), and later NluAdapter (Keyword | LLM).
- The conversation engine is a state machine, not an AI: it only formats options
  and parses numbered/tapped replies. All scheduling goes through `SchedulingService`.
- The (future) AI/LLM layer may ONLY turn user text into a structured, zod-validated
  intent. It MUST NOT decide slot availability or write to the DB — the core does that.
- No medical diagnosis, ever. Symptom handling = department routing + an urgency
  flag only. (Today's emergency step is a triage hand-off, not diagnosis.)

## Domain model (source of truth: api/src/domain/types.ts + api/prisma/schema.prisma)
- **Doctor** — `name`, optional `phone` (for booking alerts), `department`,
  `slotDurationMinutes`; has weekly `Availability`.
- **Availability** — weekly window: `dayOfWeek` 0=Sun..6=Sat, `startMinutes`/`endMinutes`
  minutes-from-midnight (interpreted in UTC inside the core).
- **Patient** — `phone` unique (E.164), `name`, `language` (`en`|`te`|`hi`, default `en`),
  `consentAt` (null until first contact captures it).
- **Appointment** — `status` BOOKED | CANCELLED | COMPLETED; `start`/`end` UTC.
- **AppointmentEvent** — append-only audit log (BOOKED|RESCHEDULED|CANCELLED|COMPLETED).
- **Notification** — outbound ledger; `@@unique([appointmentId, kind])` (REMINDER_24H |
  REMINDER_2H) makes reminders idempotent. Confirmations/doctor-alerts are sent inline.
- **Conversation** — per-phone chat state (`state` step + `context` JSON booking-in-progress).
- **Staff** — dashboard users; `role` ADMIN | RECEPTIONIST, bcrypt `passwordHash`.
- Typed `DomainError` subclasses each carry a stable `code` (SLOT_UNAVAILABLE,
  OUTSIDE_HOURS, PAST_TIME, NOT_FOUND), mapped to HTTP status in one middleware.

## Conventions
- Validate EVERY external input (HTTP body, webhook payload, future LLM output) with zod.
- Map `DomainError.code` → HTTP status in ONE error middleware. Never leak stacks.
- Store all times as UTC; display in Asia/Kolkata (via `Intl.DateTimeFormat`).
- All patient/doctor-facing copy goes through `t(key, lang, params)` in `messaging/i18n.ts`:
  add a key to the `TranslationKey` union and ALL three dicts (en/te/hi) together;
  don't hardcode user-facing strings in the engine.
- Never log phone numbers or patient names at info level. Record state changes via AppointmentEvent.
- Reminders must be idempotent (claim the ledger row via `recordNotificationOnce`
  before sending) — never send twice. A reschedule deletes the rows to re-arm them.
- Capture patient consent on first contact before messaging; notifications no-op when
  `consentAt` is null.
- Twilio inbound webhooks are signature-validated when `TWILIO_AUTH_TOKEN` is set.
- Secrets only via env vars (api/.env, gitignored). Never hardcode keys or DB strings.
- Conventional commits; small, reviewable changes.

## Commands
- DB: set DATABASE_URL + DIRECT_URL in api/.env (Neon pooled + non-pooled). No Docker.
- API: `cd api && npm run dev` | migrate: `npm run db:migrate` | generate: `npm run db:generate`
- Seed: `npm run db:seed` (sample data) | `npm run db:seed:admin` (an admin staff user)
- Chat the bot locally (Mock channel REPL): `cd api && npm run chat`
- Reminders worker (standalone): `cd api && npm run reminders`
  (or `ENABLE_REMINDERS=true` to run it in-process with the API; tune `REMINDER_CRON`)
- Web: `cd web && npm run dev`
- Checks (run in each app): `npm run typecheck`, `npm run lint`, `npm test`

## Definition of done (every task)
Typecheck passes, lint passes, relevant tests pass, and the feature actually runs
end to end. Run the checks yourself and fix failures before saying it's done. If a
step needs a credential I haven't given you, STOP and tell me exactly what to
provide — do not invent or fake it.

## What to ask me for (don't invent these)
- `DATABASE_URL` (Neon pooled, includes pgbouncer=true) and `DIRECT_URL` (Neon
  non-pooled) — I'll paste both into api/.env.
- `JWT_SECRET` — for signing staff session cookies.
- Twilio creds: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  (the sandbox sender), and optionally `TWILIO_MESSAGING_SERVICE_SID` and `PUBLIC_URL`
  (the public https origin Twilio calls, e.g. an ngrok URL, for signature checks).
  The Mock adapter covers dev/tests until these arrive.
- `ANTHROPIC_API_KEY` (only when we build the AI/NLU layer — not yet needed).
