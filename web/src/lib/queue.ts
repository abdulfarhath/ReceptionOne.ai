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
  | "outline"
  | "traveling"
  | "arrived"
  | "inProgress"
  | "done"
  | "noShow"
  | "priority";

/** Maps a queue status to its brand status-pill variant. */
export function statusVariant(s: AppointmentStatus): BadgeVariant {
  switch (s) {
    case "WAITING":
      return "traveling";
    case "ARRIVED":
      return "arrived";
    case "IN_PROGRESS":
      return "inProgress";
    case "DONE":
      return "done";
    case "NO_SHOW":
      return "noShow";
    case "CANCELLED":
      return "muted";
  }
}

/** Short, human queue-status labels matching the redesign's column names. */
export const STATUS_PILL_LABEL: Record<AppointmentStatus, string> = {
  WAITING: "Traveling",
  ARRIVED: "Waiting here",
  IN_PROGRESS: "With doctor",
  DONE: "Done",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

/** "~10 min" wait label. */
export function waitLabel(minutes: number): string {
  return minutes <= 0 ? "next" : `~${minutes} min`;
}
