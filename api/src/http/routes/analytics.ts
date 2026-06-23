// Operational analytics dashboard endpoint. Aggregates the real appointments +
// availability datasets into doctor utilization, demand trends, an hour×weekday
// heatmap, and patient insights. All clinic-timezone (IST) bucketing lives here
// at the HTTP boundary; the pure maths lives in ../../domain/analytics.

import { Router } from "express";

import type { Appointment, Availability } from "../../domain/types.js";
import {
  isEstimatedNoShow,
  isVisit,
  openSlotCount,
  patientInsights,
  slotCapacity,
} from "../../domain/analytics.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import { requireAuth } from "../middleware/auth.js";

const IST = "Asia/Kolkata";
// Clinic chart window: 08:00–20:00 IST.
const HOURS: number[] = Array.from({ length: 13 }, (_, i) => i + 8);

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});
const dayLabelFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const monthLabelFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

interface IstParts {
  dateKey: string; // YYYY-MM-DD in IST
  weekday: number; // 0=Sun..6=Sat (matches Availability.dayOfWeek)
  hour: number; // 0..23 in IST
}

function istParts(d: Date): IstParts {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) map[p.type] = p.value;
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  let hour = Number.parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return { dateKey, weekday, hour };
}

const dayStartMsOf = (dateKey: string): number =>
  new Date(`${dateKey}T00:00:00.000Z`).getTime();
const weekdayOf = (dateKey: string): number =>
  new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateKey: string): string {
  const since = (weekdayOf(dateKey) + 6) % 7; // days since Monday
  return shiftDateKey(dateKey, -since);
}
function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map((n) => Number.parseInt(n, 10));
  const idx = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
const dayLabel = (dateKey: string): string =>
  dayLabelFmt.format(new Date(`${dateKey}T12:00:00.000Z`));
const monthLabel = (monthKey: string): string =>
  monthLabelFmt.format(new Date(`${monthKey}-15T12:00:00.000Z`));

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Read-only operational analytics — any authenticated staff. */
export function analyticsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get(
    "/dashboard",
    ah(async (_req, res) => {
      const now = new Date();
      const nowMs = now.getTime();
      const todayKey = istParts(now).dateKey;

      const [doctors, appointments, availability] = await Promise.all([
        deps.repo.listDoctors(),
        deps.repo.listAllAppointments(),
        deps.repo.listAllAvailability(),
      ]);

      const apptsByDoctor = groupBy(appointments, (a) => a.doctorId);
      const availByDoctor = groupBy(availability, (a) => a.doctorId);

      // ---- Demand tallies (visits only), keyed in IST ----
      const daily = new Map<string, number>();
      const weekly = new Map<string, number>();
      const monthly = new Map<string, number>();
      const hourly = new Map<number, number>();
      const weekdayTally = new Map<number, number>();
      const cells = new Map<string, number>(); // `${weekday}:${hour}`

      const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

      for (const a of appointments) {
        if (!isVisit(a)) continue;
        const { dateKey, weekday, hour } = istParts(a.start);
        bump(daily, dateKey);
        bump(weekly, mondayOf(dateKey));
        bump(monthly, dateKey.slice(0, 7));
        if (hour >= HOURS[0]! && hour <= HOURS[HOURS.length - 1]!) {
          bump(hourly, hour);
          bump(cells, `${weekday}:${hour}`);
        }
        bump(weekdayTally, weekday);
      }

      // Ordered key ranges (oldest -> newest).
      const dailyKeys = Array.from({ length: 30 }, (_, i) =>
        shiftDateKey(todayKey, -(29 - i)),
      );
      const thisMonday = mondayOf(todayKey);
      const weeklyKeys = Array.from({ length: 12 }, (_, i) =>
        shiftDateKey(thisMonday, -7 * (11 - i)),
      );
      const thisMonthKey = todayKey.slice(0, 7);
      const monthlyKeys = Array.from({ length: 12 }, (_, i) =>
        shiftMonthKey(thisMonthKey, -(11 - i)),
      );

      const demand = {
        daily: dailyKeys.map((key) => ({
          key,
          label: dayLabel(key),
          bookings: daily.get(key) ?? 0,
        })),
        weekly: weeklyKeys.map((key) => ({
          key,
          label: dayLabel(key),
          bookings: weekly.get(key) ?? 0,
        })),
        monthly: monthlyKeys.map((key) => ({
          key,
          label: monthLabel(key),
          bookings: monthly.get(key) ?? 0,
        })),
        hourly: HOURS.map((hour) => ({ hour, bookings: hourly.get(hour) ?? 0 })),
        weekday: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          bookings: weekdayTally.get(weekday) ?? 0,
        })),
      };

      // ---- Heatmap (weekday × hour) ----
      let heatmapMax = 0;
      const heatmapCells: { weekday: number; hour: number; bookings: number }[] =
        [];
      for (let weekday = 0; weekday < 7; weekday++) {
        for (const hour of HOURS) {
          const bookings = cells.get(`${weekday}:${hour}`) ?? 0;
          if (bookings > heatmapMax) heatmapMax = bookings;
          heatmapCells.push({ weekday, hour, bookings });
        }
      }

      // ---- Per-doctor utilization ----
      const todayWeekday = weekdayOf(todayKey);
      const todayStartMs = dayStartMsOf(todayKey);

      const doctorsOut = doctors.map((doc) => {
        const docAppts = apptsByDoctor.get(doc.id) ?? [];
        const windows: Availability[] = availByDoctor.get(doc.id) ?? [];
        const windowsToday = windows.filter((w) => w.dayOfWeek === todayWeekday);
        const capacityToday = slotCapacity(windowsToday, doc.slotDurationMinutes);

        // BOOKED start times per IST day occupy slots (for open-slot maths).
        const bookedByDay = new Map<string, Set<number>>();
        let bookedToday = 0;
        for (const a of docAppts) {
          const { dateKey } = istParts(a.start);
          if (a.status === "BOOKED") {
            const set = bookedByDay.get(dateKey) ?? new Set<number>();
            set.add(a.start.getTime());
            bookedByDay.set(dateKey, set);
          }
          if (dateKey === todayKey && isVisit(a)) bookedToday++;
        }

        const openToday = openSlotCount(
          windowsToday,
          doc.slotDurationMinutes,
          todayStartMs,
          bookedByDay.get(todayKey) ?? new Set(),
          nowMs,
        );

        let openThisWeek = 0;
        for (let i = 0; i < 7; i++) {
          const dk = shiftDateKey(todayKey, i);
          const ws = windows.filter((w) => w.dayOfWeek === weekdayOf(dk));
          openThisWeek += openSlotCount(
            ws,
            doc.slotDurationMinutes,
            dayStartMsOf(dk),
            bookedByDay.get(dk) ?? new Set(),
            nowMs,
          );
        }

        return {
          id: doc.id,
          name: doc.name,
          department: doc.department,
          bookedToday,
          capacityToday,
          utilizationPct:
            capacityToday > 0
              ? Math.round((bookedToday / capacityToday) * 100)
              : 0,
          openToday,
          openThisWeek,
          totalBooked: docAppts.filter(isVisit).length,
          estNoShows: docAppts.filter((a: Appointment) =>
            isEstimatedNoShow(a, nowMs),
          ).length,
        };
      });

      res.json({
        generatedAt: now.toISOString(),
        today: todayKey,
        doctors: doctorsOut,
        demand,
        heatmap: { hours: HOURS, max: heatmapMax, cells: heatmapCells },
        patients: patientInsights(appointments),
      });
    }),
  );

  return router;
}
