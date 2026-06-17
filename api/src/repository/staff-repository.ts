// Persistence boundary for staff accounts. Kept separate from the scheduling
// Repository; a single adapter may implement both.

import type { Staff, StaffRole } from "../auth/staff.js";

export interface CreateStaffInput {
  email: string;
  passwordHash: string;
  name: string;
  role: StaffRole;
  active?: boolean;
}

export interface StaffRepository {
  getStaffById(id: string): Promise<Staff | null>;
  getStaffByEmail(email: string): Promise<Staff | null>;
  createStaff(input: CreateStaffInput): Promise<Staff>;
}
