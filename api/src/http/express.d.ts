// Augment Express's Request with the authenticated staff profile set by
// requireAuth. Kept as a .d.ts so it is ambient across the http layer.

import type { StaffProfile } from "../auth/staff.js";

declare global {
  namespace Express {
    interface Request {
      staff?: StaffProfile;
    }
  }
}

export {};
