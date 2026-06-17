// Staff identity types. Staff authenticate with email+password; patients never
// log in (they are identified by phone elsewhere in the domain).

export const StaffRole = {
  ADMIN: "ADMIN",
  RECEPTIONIST: "RECEPTIONIST",
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export interface Staff {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: StaffRole;
  active: boolean;
}

/** Staff data safe to return over the wire (no password hash). */
export interface StaffProfile {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
}

export function toStaffProfile(staff: Staff): StaffProfile {
  return {
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    active: staff.active,
  };
}

const ROLES = new Set<string>(Object.values(StaffRole));

/** Validate a role string coming from the DB boundary. */
export function toStaffRole(value: string): StaffRole {
  if (!ROLES.has(value)) {
    throw new Error(`Unknown staff role from DB: ${value}`);
  }
  return value as StaffRole;
}
