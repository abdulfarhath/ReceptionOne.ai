// Shared palette + label helpers for the analytics charts. Concrete hex values
// (rather than CSS vars) so Recharts renders consistently across the SVG charts.

export const CHART = {
  booked: "#2563eb", // blue — booked/upcoming
  completed: "#059669", // emerald — completed visits
  cancelled: "#94a3b8", // slate — cancelled
  accent: "#d97706", // amber — highlight (busiest)
  rose: "#e11d48", // rose — no-shows
  grid: "#e2e8f0",
  axis: "#64748b",
} as const;

export const DONUT = [CHART.completed, CHART.booked] as const;

/** 0=Sun..6=Sat short labels (matches Availability.dayOfWeek). */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Display order: Monday-first. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "08:00" for an hour number. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
