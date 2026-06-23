// Conversation state for the per-sender state machine. Persisted (keyed by phone)
// so a patient can continue a booking across messages / restarts.

export type Language = "en" | "te" | "hi";

export const ConversationStep = {
  CHOOSE_LANGUAGE: "CHOOSE_LANGUAGE",
  GREET: "GREET",
  CHECK_EMERGENCY: "CHECK_EMERGENCY",
  CHOOSE_ACTION: "CHOOSE_ACTION",
  ASK_NAME: "ASK_NAME",
  CHOOSE_DOCTOR: "CHOOSE_DOCTOR",
  CHOOSE_SLOT: "CHOOSE_SLOT",
  CHOOSE_APPOINTMENT: "CHOOSE_APPOINTMENT",
  CONFIRM: "CONFIRM",
  DONE: "DONE",
} as const;
export type ConversationStep =
  (typeof ConversationStep)[keyof typeof ConversationStep];

export type ConversationAction =
  | "book"
  | "reschedule"
  | "cancel"
  | "view_appointments"
  | "our_doctors"
  | "about_hospital"
  | "talk_receptionist";

/** In-progress booking context. Offered* arrays map a 1-based reply to an id/slot. */
export interface ConversationContext {
  language?: Language;
  action?: ConversationAction;
  patientId?: string;
  patientName?: string;
  doctorId?: string;
  slotIso?: string;
  appointmentId?: string;
  offeredDoctorIds?: string[];
  offeredSlotsIso?: string[];
  offeredAppointmentIds?: string[];
}

export interface ConversationRecord {
  phone: string;
  step: ConversationStep;
  context: ConversationContext;
}

export interface ConversationStore {
  get(phone: string): Promise<ConversationRecord | null>;
  save(record: ConversationRecord): Promise<void>;
}
