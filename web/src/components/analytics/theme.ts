// Shared palette + label helpers for the analytics charts. Concrete hex values
// (rather than CSS vars) so Recharts renders consistently across the SVG charts.

export const CHART = {
  booked: "#0e7c6b", // teal — joined/booked
  completed: "#1f6e4e", // deep green — completed visits
  cancelled: "#9dd2c4", // muted mint — cancelled
  accent: "#eda23b", // amber — highlight (busiest)
  rose: "#e11d48", // rose — no-shows
  grid: "#edf2f0",
  axis: "#7d938d",
} as const;

// Returning vs new — teal against mint, per the redesign's Patients donut.
export const DONUT = [CHART.booked, "#d6ece4"] as const;

/** Mint→teal scale for the demand heatmap (least → most busy). */
export const HEAT_SCALE = [
  "#eef3f1",
  "#d6ece4",
  "#9dd2c4",
  "#56b49e",
  "#0e7c6b",
] as const;

/** 0=Sun..6=Sat short labels (matches Availability.dayOfWeek). */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Display order: Monday-first. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "08:00" for an hour number. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
