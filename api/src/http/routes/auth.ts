import { Router } from "express";
import { z } from "zod";

import { toStaffProfile } from "../../auth/staff.js";
import { verifyPassword } from "../../auth/passwords.js";
import { signAuthToken } from "../../auth/tokens.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import { UnauthorizedError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export function authRouter(deps: AppDeps): Router {
  const router = Router();

  router.post(
    "/login",
    ah(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body);

      const staff = await deps.repo.getStaffByEmail(email);
      // Same error whether the email is unknown or the password is wrong.
      if (!staff || !staff.active) {
        throw new UnauthorizedError("Invalid email or password");
      }
      const ok = await verifyPassword(password, staff.passwordHash);
      if (!ok) throw new UnauthorizedError("Invalid email or password");

      const token = signAuthToken(
        { sub: staff.id, role: staff.role },
        deps.config.jwtSecret,
        deps.config.jwtExpiresInSeconds,
      );
      res.cookie(deps.config.cookieName, token, {
        httpOnly: true,
        secure: deps.config.cookieSecure,
        sameSite: "lax",
        maxAge: deps.config.jwtExpiresInSeconds * 1000,
        path: "/",
      });
      res.json(toStaffProfile(staff));
    }),
  );

  router.post("/logout", (_req, res) => {
    res.clearCookie(deps.config.cookieName, {
      httpOnly: true,
      secure: deps.config.cookieSecure,
      sameSite: "lax",
      path: "/",
    });
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireAuth(deps), (req, res) => {
    res.json(req.staff);
  });

  return router;
}
