// Display metadata for broadcast categories, priorities and statuses — shared by
// the compose form and the history list so labels stay consistent.

import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
} from "./schemas";

export const CATEGORY_OPTIONS: { value: BroadcastCategory; label: string }[] = [
  { value: "MARKETING", label: "Marketing" },
  { value: "BOOTCAMP", label: "Bootcamp" },
  { value: "BLOOD_DONATION", label: "Blood Donation" },
  { value: "HEALTH_CAMP", label: "Health Camp" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "DOCTOR_UPDATE", label: "Doctor Update" },
  { value: "REMINDER", label: "Reminder" },
  { value: "EMERGENCY_NOTICE", label: "Emergency Notice" },
  { value: "CUSTOM", label: "Custom" },
];

export const PRIORITY_OPTIONS: { value: BroadcastPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<BroadcastCategory, string>;

export function categoryLabel(c: BroadcastCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

/** Badge variant per priority. */
export function priorityVariant(
  p: BroadcastPriority,
): "muted" | "secondary" | "default" | "destructive" {
  switch (p) {
    case "LOW":
      return "muted";
    case "NORMAL":
      return "secondary";
    case "HIGH":
      return "default";
    case "URGENT":
      return "destructive";
  }
}

export function statusVariant(s: BroadcastStatus): "success" | "secondary" {
  return s === "SENT" ? "success" : "secondary";
}
