// Time helpers. The API stores/returns UTC ISO strings; the clinic operates in
// Asia/Kolkata, so we always display in that zone.
const TZ = "Asia/Kolkata";

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "9:00 AM" in IST for a UTC ISO instant. */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "Monday, 22 June 2026" in IST. */
export function formatLongDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** Today's calendar date (YYYY-MM-DD) in IST, for the day picker default. */
export function todayIsoDate(): string {
  // en-CA formats as YYYY-MM-DD.
  return isoDateFmt.format(new Date());
}

/** The IST calendar date (YYYY-MM-DD) of a UTC ISO instant. */
export function istDateOf(iso: string): string {
  return isoDateFmt.format(new Date(iso));
}

/** Add `days` to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Long date for a YYYY-MM-DD day string (anchored at UTC noon to avoid drift). */
export function formatDayLabel(date: string): string {
  return dateFmt.format(new Date(`${date}T12:00:00.000Z`));
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? String(dayOfWeek);
}

/** "09:00" label for minutes-from-midnight UTC, shown as IST clock time. */
export function minutesToIstLabel(minutesFromUtcMidnight: number): string {
  // UTC midnight + minutes, then format in IST.
  const base = Date.UTC(2000, 0, 1) + minutesFromUtcMidnight * 60_000;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(base));
}

/** Convert an IST "HH:MM" clock time to minutes-from-midnight UTC. */
export function istClockToUtcMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const istMinutes = (h ?? 0) * 60 + (m ?? 0);
  // IST is UTC+5:30.
  let utc = istMinutes - 330;
  if (utc < 0) utc += 1440;
  return utc;
}

/** Convert minutes-from-midnight UTC to an IST "HH:MM" string for inputs. */
export function utcMinutesToIstClock(utcMinutes: number): string {
  let ist = utcMinutes + 330;
  ist = ((ist % 1440) + 1440) % 1440;
  const h = Math.floor(ist / 60);
  const m = ist % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
