// Typed domain errors. Each carries a stable `code` that the HTTP error
// middleware maps to a status. PURE module — no DB/HTTP imports.

export type DomainErrorCode =
  | "SLOT_UNAVAILABLE"
  | "OUTSIDE_HOURS"
  | "PAST_TIME"
  | "NOT_FOUND"
  | "INVALID_TRANSITION";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested slot is already taken (or otherwise not bookable). */
export class SlotUnavailableError extends DomainError {
  readonly code = "SLOT_UNAVAILABLE";
}

/** The requested time falls outside the doctor's availability windows. */
export class OutsideHoursError extends DomainError {
  readonly code = "OUTSIDE_HOURS";
}

/** The requested time is in the past. */
export class PastTimeError extends DomainError {
  readonly code = "PAST_TIME";
}

/** A referenced entity (doctor, patient, appointment) does not exist. */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
}

/** An illegal queue-entry status transition was attempted. */
export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";
}
