// Operational analytics dashboard endpoint. Aggregates the real queue dataset
// into per-doctor activity, demand trends, an hour×weekday heatmap, and patient
// insights. All clinic-timezone (IST) bucketing lives here at the HTTP boundary;
// the pure maths lives in ../../domain/analytics.

import { Router } from "express";

import {
  avgConsultMinutes,
  isAttended,
  isNoShow,
  patientInsights,
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
  dateKey: string;
  hour: number;
}

function istParts(d: Date): IstParts {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) map[p.type] = p.value;
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  let hour = Number.parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  return { dateKey, hour };
}

const weekdayOf = (dateKey: string): number =>
  new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateKey: string): string {
  const since = (weekdayOf(dateKey) + 6) % 7;
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

/** Read-only operational analytics — any authenticated staff. */
export function analyticsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get(
    "/dashboard",
    ah(async (_req, res) => {
      const now = new Date();
      const todayKey = istParts(now).dateKey;

      const [doctors, appointments] = await Promise.all([
        deps.repo.listDoctors(),
        deps.repo.listAllAppointments(),
      ]);

      // Demand = tokens joined. Day/week/month bucket by queueDate (the clinic
      // day); hour-of-day / heatmap bucket by createdAt (when the token was taken).
      const daily = new Map<string, number>();
      const weekly = new Map<string, number>();
      const monthly = new Map<string, number>();
      const hourly = new Map<number, number>();
      const weekdayTally = new Map<number, number>();
      const cells = new Map<string, number>();
      const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

      for (const a of appointments) {
        const dayKey = istParts(a.queueDate).dateKey;
        const weekday = weekdayOf(dayKey);
        const hour = istParts(a.createdAt).hour;
        bump(daily, dayKey);
        bump(weekly, mondayOf(dayKey));
        bump(monthly, dayKey.slice(0, 7));
        bump(weekdayTally, weekday);
        if (hour >= HOURS[0]! && hour <= HOURS[HOURS.length - 1]!) {
          bump(hourly, hour);
          bump(cells, `${weekday}:${hour}`);
        }
      }

      const dailyKeys = Array.from({ length: 30 }, (_, i) =>
        shiftDateKey(todayKey, -(29 - i)),
      );
      const weeklyKeys = Array.from({ length: 12 }, (_, i) =>
        shiftDateKey(mondayOf(todayKey), -7 * (11 - i)),
      );
      const monthlyKeys = Array.from({ length: 12 }, (_, i) =>
        shiftMonthKey(todayKey.slice(0, 7), -(11 - i)),
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

      // ---- Per-doctor queue activity ----
      const byDoctor = new Map<string, typeof appointments>();
      for (const a of appointments) {
        const list = byDoctor.get(a.doctorId);
        if (list) list.push(a);
        else byDoctor.set(a.doctorId, [a]);
      }

      const doctorsOut = doctors.map((doc) => {
        const docAppts = byDoctor.get(doc.id) ?? [];
        const todays = docAppts.filter(
          (a) => istParts(a.queueDate).dateKey === todayKey,
        );
        return {
          id: doc.id,
          name: doc.name,
          department: doc.department,
          joinedToday: todays.length,
          doneToday: todays.filter(isAttended).length,
          noShowToday: todays.filter(isNoShow).length,
          totalDone: docAppts.filter(isAttended).length,
          noShows: docAppts.filter(isNoShow).length,
          avgConsultMinutes: avgConsultMinutes(docAppts),
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
