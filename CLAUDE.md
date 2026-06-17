# Project: receptionone.ai — WhatsApp-first clinic appointment system
<!-- Keep this file lean (<200 lines): Claude Code reads it every session and
     adherence drops if it gets bloated. -->

## What this is
A production-bound app that replaces a clinic's phone-and-front-desk booking with
a chat bot + a staff web dashboard. Built for small/mid clinics in India. Three
capabilities, in priority order:
1. Appointments — book / reschedule / cancel (the core).
2. Notifications — confirmations + reminders.
3. (Later, optional) AI — interpret free-text/multilingual messages and route
   symptoms to the right department. It NEVER diagnoses.

## Tech stack (do not substitute without asking me)
- TypeScript (strict) everywhere. Node 20+.
- Backend: Express + zod (validation) + Prisma (ORM).
- Database: PostgreSQL on Neon, via DATABASE_URL. Prisma uses a separate DIRECT_URL
  for migrations (Neon's non-pooled endpoint). No Docker.
- Frontend: React + Vite + Tailwind + shadcn/ui + TanStack Query + React Router
  + react-hook-form + zod.
- Auth: staff log in with email+password (bcrypt), JWT in an httpOnly cookie.
  Patients do NOT log in — they are identified by phone number.
- Messaging: a `ChannelAdapter` interface. WhatsApp via Twilio (free sandbox for now)
  is the channel; MockChannelAdapter covers local dev and automated tests. Swapping to
  the direct Meta Cloud API later (to cut Twilio's markup) is just another adapter.
- Jobs: node-cron for reminders in V1 (note in code where BullMQ+Redis scales it).
- Tests: Vitest (+ supertest for the API). Tooling: ESLint + Prettier.

## Repo layout
```
/api    Backend. Contains the pure domain core.
        api/src/domain/      scheduling logic — NO db/http/whatsapp/ai
        api/src/repository/  Repository interface + InMemory + Prisma adapters
        api/src/http/        Express app, routes, error + auth middleware
        api/src/messaging/   ChannelAdapter + Mock + TwilioWhatsApp + engine
        api/src/jobs/        reminder cron
        api/prisma/          schema + migrations + seed
/web    Frontend (React + Vite): the staff dashboard.
```
The web app talks to the API over HTTP only. Postgres is on Neon — no Docker.

## Architecture rules (these ARE the product — keep them)
- The domain core (`api/src/domain`) is PURE: no DB, no HTTP, no chat, no AI.
  It talks to a `Repository` interface.
- Everything external is a swappable adapter behind an interface:
  Repository (InMemory | Prisma), ChannelAdapter (Mock | TwilioWhatsApp),
  and later NluAdapter (Keyword | LLM).
- The AI/LLM layer may ONLY turn user text into a structured, zod-validated intent.
  It MUST NOT decide slot availability or write to the DB — the core does that.
- No medical diagnosis, ever. Symptom handling = department routing + an urgency
  flag only.

## Domain model (source of truth: api/src/domain/types.ts)
Doctor; Availability (weekly, minutes-from-midnight, dayOfWeek 0=Sun..6=Sat);
Patient (phone unique, E.164); Appointment (status BOOKED|CANCELLED|COMPLETED);
AppointmentEvent (append-only audit log). Typed `DomainError` subclasses each
carry a stable `code` (SLOT_UNAVAILABLE, OUTSIDE_HOURS, PAST_TIME, NOT_FOUND).

## Conventions
- Validate EVERY external input (HTTP body, webhook payload, LLM output) with zod.
- Map `DomainError.code` → HTTP status in ONE error middleware. Never leak stacks.
- Store all times as UTC; display in Asia/Kolkata.
- Never log phone numbers or patient names at info level. Record state changes
  via AppointmentEvent.
- Reminders must be idempotent (track sent state) — never send twice.
- Capture patient consent on first contact before messaging them.
- Secrets only via env vars (.env, gitignored). Never hardcode keys or DB strings.
- Conventional commits; small, reviewable changes.

## Commands
- DB: set DATABASE_URL + DIRECT_URL in api/.env (Neon pooled + non-pooled). No Docker.
- API: `cd api && npm run dev`  | migrate: `npm run db:migrate` | seed: `npm run db:seed`
- Web: `cd web && npm run dev`
- Checks (run in each app): `npm run typecheck`, `npm run lint`, `npm test`

## Definition of done (every task)
Typecheck passes, lint passes, relevant tests pass, and the feature actually runs
end to end. Run the checks yourself and fix failures before saying it's done. If a
step needs a credential I haven't given you, STOP and tell me exactly what to
provide — do not invent or fake it.

## What to ask me for (don't invent these)
- DATABASE_URL (Neon pooled, includes pgbouncer=true) and DIRECT_URL (Neon
  non-pooled) — I'll paste both into api/.env.
- Twilio creds (for Phase 5): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
  TWILIO_WHATSAPP_FROM (the sandbox sender, from the Twilio console). The Mock adapter
  covers dev/tests until these arrive.
- ANTHROPIC_API_KEY (only when we build the AI layer).
