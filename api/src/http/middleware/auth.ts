import type { RequestHandler } from "express";

import type { StaffRole } from "../../auth/staff.js";
import { toStaffProfile } from "../../auth/staff.js";
import { verifyAuthToken } from "../../auth/tokens.js";
import type { AppDeps } from "../deps.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";

// DEV-ONLY auth bypass, gated by env so it is OFF by default (tests + prod get
// real auth) and ON only when AUTH_BYPASS=true is set in your local api/.env.
// Never enable this in a deployed environment.
const BYPASS_AUTH = process.env.AUTH_BYPASS === "true";
const BYPASS_STAFF = {
  id: "dev-bypass",
  email: "dev@receptionone.ai",
  name: "Dev User",
  role: "ADMIN" as StaffRole,
  active: true,
};

/** Require a valid session cookie; attaches req.staff. */
export function requireAuth(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    if (BYPASS_AUTH) {
      req.staff = BYPASS_STAFF;
      next();
      return;
    }
    void (async () => {
      const token = req.cookies?.[deps.config.cookieName] as string | undefined;
      if (!token) throw new UnauthorizedError();

      let payload;
      try {
        payload = verifyAuthToken(token, deps.config.jwtSecret);
      } catch {
        throw new UnauthorizedError("Invalid or expired session");
      }

      const staff = await deps.repo.getStaffById(payload.sub);
      if (!staff || !staff.active) {
        throw new UnauthorizedError("Account is inactive or no longer exists");
      }
      req.staff = toStaffProfile(staff);
      next();
    })().catch(next);
  };
}

/** Require the authenticated staff to hold one of the given roles. */
export function requireRole(...allowed: StaffRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.staff) {
      next(new UnauthorizedError());
      return;
    }
    if (!allowed.includes(req.staff.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
