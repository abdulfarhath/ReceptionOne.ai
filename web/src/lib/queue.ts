// Display metadata for queue entry statuses — shared by the board, patient
// history, and analytics so labels and colours stay consistent.

import type { AppointmentStatus } from "./schemas";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  WAITING: "Waiting",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

export type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "muted"
  | "destructive"
  | "outline";

export function statusVariant(s: AppointmentStatus): BadgeVariant {
  switch (s) {
    case "WAITING":
      return "secondary";
    case "ARRIVED":
      return "default";
    case "IN_PROGRESS":
      return "default";
    case "DONE":
      return "success";
    case "NO_SHOW":
      return "destructive";
    case "CANCELLED":
      return "muted";
  }
}

/** "~10 min" wait label. */
export function waitLabel(minutes: number): string {
  return minutes <= 0 ? "next" : `~${minutes} min`;
}
