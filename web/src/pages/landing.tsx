import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BatteryFull,
  Camera,
  CheckCheck,
  CornerUpLeft,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  SignalHigh,
  Smile,
  Video,
  Wifi,
} from "lucide-react";

import { Brandmark } from "@/components/layout";
import { ThemeToggle } from "@/components/theme-toggle";

// Subtle WhatsApp doodle wallpaper over the beige chat background.
const WA_WALLPAPER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='92' height='92' viewBox='0 0 92 92'%3E%3Cg fill='none' stroke='%23d6cdbf' stroke-width='1.4' opacity='0.55'%3E%3Ccircle cx='18' cy='20' r='7'/%3E%3Cpath d='M40 16l4 4 8-9'/%3E%3Cpath d='M64 14c5 0 5 7 0 7'/%3E%3Cpath d='M14 58h11'/%3E%3Ccircle cx='70' cy='60' r='5'/%3E%3Cpath d='M44 66l3 3 6-7'/%3E%3C/g%3E%3C/svg%3E\")";

// Public marketing landing page. Ported from the brand's pitch design and
// adapted to the live token-queue model (no fixed slots): patients join a
// queue by chat and get an honest wait RANGE + suggested arrival.

const HERO_BG =
  "radial-gradient(1100px 520px at 82% -8%, rgba(237,162,59,.20), transparent 60%)," +
  "radial-gradient(900px 600px at 8% 110%, rgba(14,124,107,.45), transparent 55%)," +
  "linear-gradient(160deg,#062B24,#0A4339)";

function Eyebrow({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.18em] ${
        tone === "amber" ? "text-amber" : "text-teal"
      }`}
    >
      <span className="h-[1.5px] w-[26px] bg-amber" />
      {children}
    </span>
  );
}

function Chip({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-[0.85em] py-[0.5em] font-mono text-[0.74rem] font-medium ${
        dark
          ? "border border-white/20 bg-white/5 text-[#d8ede6]"
          : "border-[1.4px] border-mint-strong bg-card text-teal-deep"
      }`}
    >
      {children}
    </span>
  );
}

const H2 =
  "font-display text-[clamp(1.95rem,4.2vw,2.9rem)] font-extrabold leading-[1.04] tracking-[-0.02em]";

export function LandingPage() {
  return (
    <div className="overflow-x-hidden bg-paper text-ink">
      {/* ---------- HERO ---------- */}
      <header className="relative overflow-hidden text-[#eaf6f1]" style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-[1080px] px-6 pb-[clamp(54px,8vw,92px)] pt-[clamp(28px,5vw,44px)]">
          <div className="flex items-center justify-between gap-4">
            <Brandmark className="text-[#cfe9df]" />
            <div className="flex items-center gap-2.5">
              <ThemeToggle variant="onDark" />
              <Link
                to="/login"
                className="rounded-full border border-white/30 px-[1.2em] py-[0.6em] text-sm font-semibold text-[#eaf6f1] transition-colors hover:border-white"
              >
                Staff sign in
              </Link>
            </div>
          </div>

          <div className="mt-[clamp(28px,5vw,52px)] grid items-center gap-[clamp(32px,5vw,72px)] md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Eyebrow tone="amber">Appointment booking for clinics in India</Eyebrow>
              <h1 className="mt-2 font-display text-[clamp(2.7rem,6.2vw,4.5rem)] font-extrabold leading-[1.04] tracking-[-0.02em] text-white">
                Reception that <em className="not-italic text-amber">never sleeps.</em>
              </h1>
              <p className="mt-[1.1rem] max-w-[46ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-[#c6e3d9]">
                Patients join the queue, check in, and cancel by chat — any hour,
                in their own language. Your front desk stops drowning in calls,
                no-shows fall, and you pay cents instead of salaries.
              </p>
              <div className="mt-8 flex flex-wrap gap-3.5">
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full bg-amber px-[1.4em] py-[0.82em] font-semibold text-amber-ink transition-transform hover:-translate-y-0.5 hover:bg-[#f3b358]"
                >
                  See how it works
                </a>
                <a
                  href="#economics"
                  className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-white/30 px-[1.4em] py-[0.82em] font-semibold text-[#eaf6f1] transition-transform hover:-translate-y-0.5 hover:border-white"
                >
                  The economics <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
              <div className="mt-[2.4rem] flex flex-wrap gap-2.5">
                <Chip dark>24/7 queue</Chip>
                <Chip dark>WhatsApp-first</Chip>
                <Chip dark>No app to install</Chip>
                <Chip dark>No diagnosis, ever</Chip>
              </div>
            </div>

            {/* Signature: a booking happening live, on WhatsApp */}
            <div className="mx-auto w-full max-w-[336px] overflow-hidden rounded-[36px] border-[10px] border-[#0b1c18] bg-black shadow-[0_36px_70px_-26px_rgba(0,0,0,0.65)] md:justify-self-end">
              {/* status bar */}
              <div className="flex items-center justify-between bg-[#008069] px-4 pb-0.5 pt-1.5 text-[0.62rem] font-semibold text-white">
                <span>9:41</span>
                <span className="flex items-center gap-1">
                  <SignalHigh className="size-3" aria-hidden />
                  <Wifi className="size-3" aria-hidden />
                  <BatteryFull className="size-3.5" aria-hidden />
                </span>
              </div>
              {/* chat header */}
              <div className="flex items-center gap-2 bg-[#008069] px-2.5 pb-2 pt-1 text-white">
                <ArrowLeft className="size-5 shrink-0" aria-hidden />
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber font-display text-sm font-extrabold text-amber-ink">
                  S
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[0.92rem] font-semibold">Sunrise Clinic</div>
                  <div className="text-[0.66rem] text-[#cfe9df]">online</div>
                </div>
                <Video className="size-5 shrink-0" aria-hidden />
                <Phone className="size-[18px] shrink-0" aria-hidden />
                <MoreVertical className="size-5 shrink-0" aria-hidden />
              </div>
              {/* chat body */}
              <div
                className="flex min-h-[372px] flex-col gap-1.5 px-3 py-3"
                style={{ backgroundColor: "#efeae2", backgroundImage: WA_WALLPAPER }}
              >
                <div className="self-center rounded-[7px] bg-[#ffffff] px-2.5 py-0.5 text-[0.6rem] font-medium text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  TODAY
                </div>
                <div className="mb-0.5 self-center max-w-[88%] rounded-[7px] bg-[#fcf4cb] px-2.5 py-1 text-center text-[0.6rem] leading-snug text-[#5a5340] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  🔒 Messages are end-to-end encrypted. No one outside this chat can
                  read them.
                </div>

                <WaMsg side="in" time="10:18">
                  Hi! Sunrise Clinic here. Join the queue, check in, or cancel?
                </WaMsg>
                <WaMsg side="out" time="10:18">
                  Dr. Asha, this morning
                </WaMsg>
                <WaMsg side="in" time="10:19">
                  Dr. Asha Rao's wait is about 45 min right now. Add you to the queue?
                </WaMsg>
                {/* WhatsApp quick-reply buttons */}
                <div className="flex w-[78%] flex-col gap-px self-start overflow-hidden rounded-[7px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  <button className="flex items-center justify-center gap-1.5 bg-white py-2 text-[0.82rem] font-medium text-[#0a91d8]">
                    <CornerUpLeft className="size-3.5" aria-hidden />
                    Join the queue
                  </button>
                  <button className="flex items-center justify-center gap-1.5 bg-white py-2 text-[0.82rem] font-medium text-[#0a91d8]">
                    <CornerUpLeft className="size-3.5" aria-hidden />
                    Later today
                  </button>
                </div>
                <WaMsg side="out" time="10:19">
                  Join the queue
                </WaMsg>
                <WaMsg side="in" time="10:20">
                  Done ✓ You're in for Dr. Asha Rao — about 40–55 min. Come by
                  11:20 AM. I'll message when you're next.
                </WaMsg>
              </div>
              {/* input bar */}
              <div className="flex items-center gap-1.5 bg-[#f0f2f5] px-2 py-1.5">
                <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5">
                  <Smile className="size-[18px] shrink-0 text-[#54656f]" aria-hidden />
                  <span className="flex-1 text-[0.82rem] text-[#8696a0]">Message</span>
                  <Paperclip className="size-[18px] shrink-0 -rotate-45 text-[#54656f]" aria-hidden />
                  <Camera className="size-[18px] shrink-0 text-[#54656f]" aria-hidden />
                </div>
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884] text-white">
                  <Mic className="size-[18px]" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- PROBLEM ---------- */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <h2 className={`mt-2 ${H2}`}>The front desk is a bottleneck.</h2>
        <p className="mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-ink-soft">
          Every appointment runs through a ringing phone and one busy human.
          After hours, calls go unanswered. Patients forget and don't show. Staff
          spend the day on the phone instead of with patients.
        </p>
        <ul className="mt-[2.2rem] grid list-none gap-3.5 sm:grid-cols-2">
          {[
            ["Missed calls", "A busy or after-hours line is a lost appointment — and a patient who calls the clinic next door."],
            ["No-shows", "Forgotten visits leave empty, unpaid gaps in the day that can't be refilled in time."],
            ["Zero after-hours cover", "Patients want to book at 10pm and on Sundays. A front desk can't."],
            ["Manual reminders", "Calling everyone to confirm is staff time you simply can't scale."],
          ].map(([title, body]) => (
            <li
              key={title}
              className="rounded-xl border border-mint-strong border-l-[3px] border-l-amber bg-card p-[1.1em] shadow-soft"
            >
              <b className="block font-display text-[1.02rem] font-bold tracking-[-0.01em]">
                {title}
              </b>
              <small className="text-[0.92rem] text-ink-soft">{body}</small>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------- SOLUTION / PILLARS ---------- */}
      <Section dark>
        <Eyebrow tone="amber">The solution</Eyebrow>
        <h2 className={`mt-2 text-white ${H2}`}>
          One chat thread runs your whole front desk.
        </h2>
        <p className="mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-[#afd2c8]">
          A patient sends a message. The system does the rest — reads the live
          queue, adds them, keeps them updated, and routes — without a human
          picking up the phone.
        </p>
        <div className="mt-[2.6rem] grid gap-5 md:grid-cols-3">
          {[
            ["01", "Join, check in, cancel", "Patients self-serve at any hour. The engine reads the live queue and gives an honest wait — never a fake promise.", "The core"],
            ["02", "Updates that cut no-shows", "A one-time “you're next” and gentle “running behind” notes go out on their own — sent once, never twice.", "Fewer empty slots"],
            ["03", "Understands plain language", "Optionally reads free-text and mixed Hindi, Telugu and English, and points symptoms to the right department. It never names a disease.", "Optional AI"],
          ].map(([no, title, body, tag]) => (
            <div
              key={no}
              className="rounded-[18px] border border-mint-strong bg-card p-[1.6em] text-ink shadow-soft"
            >
              <span className="font-mono text-[0.72rem] font-bold tracking-[0.1em] text-teal">
                {no}
              </span>
              <h3 className="my-2 font-display text-[1.22rem] font-extrabold tracking-[-0.01em]">
                {title}
              </h3>
              <p className="text-[0.96rem] text-ink-soft">{body}</p>
              <span className="mt-3.5 inline-block rounded-md bg-amber-soft px-[0.6em] py-[0.35em] font-mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-amber-text">
                {tag}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- HOW IT WORKS ---------- */}
      <Section ink id="how">
        <Eyebrow tone="amber">How it works</Eyebrow>
        <h2 className={`mt-2 text-white ${H2}`}>One engine. WhatsApp in front.</h2>
        <p className="mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-[#afd2c8]">
          A single live-queue engine is the source of truth. Patients reach it on
          WhatsApp — the app they already use — while your staff run the whole day
          from one dashboard.
        </p>
        <div className="mt-[2.6rem] grid items-center gap-4.5 md:grid-cols-[1fr_auto_1fr]">
          <Channel name="WhatsApp">
            <span className="font-mono text-[0.66rem] text-[#9fd0c3]">patients book here</span>
          </Channel>
          <div className="text-center font-mono text-[1.3rem] font-bold text-amber max-md:rotate-90">
            →
          </div>
          <div>
            <div className="rounded-2xl border border-[#7ce0c8]/40 bg-gradient-to-br from-teal to-teal-deep p-[1.3em] text-center shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]">
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-[#9fd0c3]">
                Live queue engine
              </span>
              <b className="mt-1 block font-display text-[1.18rem] font-extrabold text-white">
                Queues · updates · routes
              </b>
            </div>
            <div className="mt-3">
              <Channel name="Staff dashboard">
                <span className="font-mono text-[0.66rem] text-[#9fd0c3]">your cockpit</span>
              </Channel>
            </div>
          </div>
        </div>
        <p className="mt-[1.8rem] font-mono text-[0.82rem] text-[#9fd0c3]">
          Built channel-agnostic on Node, React and PostgreSQL — new channels can
          plug into the same core later without a rewrite.
        </p>
      </Section>

      {/* ---------- WHY IT WINS ---------- */}
      <Section>
        <Eyebrow>Why it works here</Eyebrow>
        <h2 className={`mt-2 ${H2}`}>Built for how India already chats.</h2>
        <div className="mt-[2.6rem] grid gap-x-8 gap-y-[1.1rem] sm:grid-cols-2">
          {[
            ["A", "The app patients live in", "No download, no account, no learning curve — they already message on it every day."],
            ["B", "Their own language", "Joins the queue in Hindi, Telugu or English — even all three mixed in one message."],
            ["C", "Always open", "2am questions, weekends, festival days. The line is never busy."],
            ["D", "Light to run", "No new hardware and no phone bank — it rides on the app patients already use, so it stays cheap to operate."],
            ["E", "Safe by design", "Symptoms are routed and triaged, never diagnosed — keeping it useful and out of regulated territory."],
            ["F", "Scales without hiring", "One clinic or a hundred, the same engine handles the volume a front desk can't."],
          ].map(([k, title, body]) => (
            <div key={k} className="flex items-start gap-3.5">
              <span className="grid size-[34px] flex-shrink-0 place-items-center rounded-lg border-[1.4px] border-mint-strong font-mono text-[0.8rem] font-bold text-teal">
                {k}
              </span>
              <div>
                <b className="font-display text-[1.06rem] font-bold tracking-[-0.01em]">
                  {title}
                </b>
                <p className="mt-0.5 text-[0.95rem] text-ink-soft">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- ECONOMICS ---------- */}
      <Section dark id="economics">
        <Eyebrow tone="amber">The economics</Eyebrow>
        <h2 className={`mt-2 text-white ${H2}`}>Priced to your clinic.</h2>
        <p className="mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-[#afd2c8]">
          You pay for your clinic's size, not per phone call. Pricing scales with
          the patients you actually serve — a small practice and a busy hospital
          pay very differently.
        </p>
        <div className="mt-[2.6rem] grid gap-4.5 sm:grid-cols-3">
          {[
            ["By size", "One monthly plan per clinic, scaled to how many patients you serve."],
            ["Usage-based", "Billed on the patients you actually serve, so a quiet month costs less than a busy one."],
            ["Less than a hire", "A fraction of another front-desk salary — and it never calls in sick."],
          ].map(([lead, body]) => (
            <div
              key={lead}
              className="rounded-2xl border border-white/15 bg-white/5 p-[1.3em]"
            >
              <div className="font-mono text-[clamp(1.2rem,2.4vw,1.6rem)] font-bold tracking-[-0.02em] text-amber">
                {lead}
              </div>
              <p className="mt-2 text-[0.9rem] text-[#afd2c8]">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-[1.8rem] max-w-[60ch] font-mono text-[0.78rem] text-[#8fbeb2]">
          Detailed pricing tiers are being finalised — exact per-patient and
          per-clinic rates land here soon.
        </p>
      </Section>

      {/* ---------- SAFETY ---------- */}
      <Section>
        <Eyebrow>Trust &amp; compliance</Eyebrow>
        <h2 className={`mt-2 ${H2}`}>Safe, private, and legal in India.</h2>
        <p className="mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-ink-soft">
          A clinic is handing over patient conversations. Every part is built to
          be ethical by default and to meet India's data-protection law.
        </p>
        <div className="mt-[2.6rem] grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["+", "Never diagnoses", "Symptoms point a patient to the right doctor and flag urgency. The system never names a condition — keeping it safe and outside medical-device rules."],
            ["✓", "Consent first", "No message goes out without the patient's opt-in. They choose to be contacted — in line with the DPDP Act and WhatsApp's own rules."],
            ["!", "Emergency-aware", "Red-flag symptoms trigger an immediate “please seek urgent care” — the assistant never delays a real emergency."],
            ["☎", "Always a human", "Patients always know they're chatting with an assistant and can reach clinic staff in a single step."],
            ["⌂", "Your data, handled right", "Built for India's DPDP Act: only the data needed, stored securely, corrected or deleted on request, and never sold."],
            ["≡", "Every change logged", "An append-only trail records who joined, moved or cancelled what — for accountability and audits."],
          ].map(([mark, title, body]) => (
            <div
              key={title}
              className="rounded-[18px] border border-mint-strong bg-card p-[1.5em] shadow-soft"
            >
              <div className="grid size-[30px] place-items-center rounded-lg bg-mint font-display font-extrabold text-teal-deep">
                {mark}
              </div>
              <h3 className="mb-1.5 mt-3 font-display text-[1.1rem] font-extrabold">
                {title}
              </h3>
              <p className="text-[0.94rem] text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- ROADMAP ---------- */}
      <Section ink>
        <Eyebrow tone="amber">Where it goes</Eyebrow>
        <h2 className={`mt-2 text-white ${H2}`}>Start lean. Grow on demand.</h2>
        <div className="mt-[2.8rem] grid">
          {[
            ["V1", "A live queue that works", "Now", "WhatsApp queueing, automatic “you're next” updates, and a staff dashboard to run the day.", true],
            ["V2", "Fill more slots", "Next", "Priority and reinstatement rules, broadcasts and analytics, multi-clinic support, and deeper no-show recovery.", false],
            ["V3", "Plug into everything", "Later", "EHR / hospital-system integration, SMS and voice as extra channels, and deeper symptom routing.", false],
          ].map(([v, title, when, body, now], i, arr) => (
            <div
              key={v as string}
              className="relative grid grid-cols-[auto_1fr] gap-5 pb-[34px]"
            >
              {i < arr.length - 1 ? (
                <span className="absolute left-[21px] top-[44px] bottom-0 w-0.5 bg-gradient-to-b from-mint-strong to-transparent" />
              ) : null}
              <div
                className={`z-10 grid size-[44px] place-items-center rounded-full border-2 border-teal font-mono text-[0.9rem] font-bold ${
                  now ? "bg-teal text-white" : "bg-ink text-teal dark:bg-card"
                }`}
              >
                {v}
              </div>
              <div>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <b className="font-display text-[1.18rem] font-extrabold tracking-[-0.01em] text-white">
                    {title}
                  </b>
                  <span className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.08em] text-amber">
                    {when}
                  </span>
                </div>
                <p className="mt-1 max-w-[60ch] text-[0.97rem] text-[#afd2c8]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- CLOSE ---------- */}
      <section
        className="py-[clamp(60px,9vw,118px)] text-center"
        style={{ background: "linear-gradient(160deg,#0A4339,#062B24)" }}
      >
        <div className="mx-auto max-w-[760px] px-6">
          <Eyebrow tone="amber">The pitch, in one line</Eyebrow>
          <h2 className="mt-2 font-display text-[clamp(2.1rem,5vw,3.2rem)] font-extrabold leading-[1.04] tracking-[-0.02em] text-white">
            Give a clinic a front desk that scales.
          </h2>
          <p className="mx-auto mt-[1.1rem] max-w-[54ch] text-[clamp(1.05rem,1.6vw,1.22rem)] text-[#c6e3d9]">
            A reception that answers every patient, in every language, at every
            hour — for the price of a few cups of chai a month.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-amber px-[1.4em] py-[0.82em] font-semibold text-amber-ink transition-transform hover:-translate-y-0.5 hover:bg-[#f3b358]"
          >
            Open the dashboard
          </Link>
          <p className="mt-6 font-mono text-[0.72rem] tracking-[0.04em] text-[#8fbeb2]">
            A product by{" "}
            <a
              href="https://cybertronix.tech"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#cfe9df] hover:text-amber"
            >
              Cybertronix.tech
            </a>
          </p>
        </div>
      </section>

      <footer className="bg-ink py-9 text-[0.82rem] text-[#7fa59c]">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-6">
          <span className="font-mono font-bold text-[#cfe9df]">
            receptionone.ai
            <span className="ml-2 font-normal text-[0.72rem] text-[#5e8077]">
              by Cybertronix.tech
            </span>
          </span>
          <span className="max-w-[52ch] font-mono text-[0.72rem] text-[#5e8077]">
            © Cybertronix.tech · Built for clinics in India and designed around the
            DPDP Act, 2023. Symptom features provide triage and routing only — not
            medical advice or diagnosis. Compliance depends on correct deployment;
            review with a qualified advisor before going live.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Section({
  children,
  dark,
  ink,
  id,
}: {
  children: ReactNode;
  dark?: boolean;
  ink?: boolean;
  id?: string;
}) {
  // Light mode: alternating teal-dark / ink accent sections against paper.
  // Dark mode: one coherent dark surface with gentle banding (cards add depth),
  // matching the dashboard's dark theme instead of clashing dark blocks.
  const bg = ink
    ? "bg-ink text-[#e8f4ef] dark:bg-background dark:text-foreground"
    : dark
      ? "bg-teal-darker text-[#e8f4ef] dark:bg-panel dark:text-foreground"
      : "dark:bg-background";
  return (
    <section id={id} className={`py-[clamp(60px,9vw,118px)] ${bg}`}>
      <div className="mx-auto max-w-[1080px] px-6">{children}</div>
    </section>
  );
}

function WaMsg({
  side,
  time,
  children,
}: {
  side: "in" | "out";
  time: string;
  children: ReactNode;
}) {
  const out = side === "out";
  return (
    <div
      className={`relative max-w-[82%] rounded-[7.5px] px-2 pb-1.5 pt-1 text-[0.82rem] leading-[1.32] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] before:absolute before:top-0 before:h-0 before:w-0 before:content-[''] ${
        out
          ? "self-end rounded-tr-none bg-[#d9fdd3] before:right-[-8px] before:border-t-[8px] before:border-t-[#d9fdd3] before:border-r-[8px] before:border-r-transparent"
          : "self-start rounded-tl-none bg-white before:left-[-8px] before:border-t-[8px] before:border-t-white before:border-l-[8px] before:border-l-transparent"
      }`}
    >
      {children}
      <span className="ml-1.5 inline-flex translate-y-0.5 items-center gap-0.5 align-bottom text-[0.6rem] text-[#667781] float-right">
        {time}
        {out ? <CheckCheck className="size-3 text-[#53bdeb]" aria-hidden /> : null}
      </span>
    </div>
  );
}

function Channel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-[0.8em]">
      <b className="font-semibold">{name}</b>
      {children}
    </div>
  );
}

