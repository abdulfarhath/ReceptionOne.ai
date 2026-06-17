// Signed JWT helpers for the staff session cookie. The decoded token is treated
// as external input and validated with zod before use.

import jwt from "jsonwebtoken";
import { z } from "zod";

import { StaffRole } from "./staff.js";

const payloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum([StaffRole.ADMIN, StaffRole.RECEPTIONIST]),
});

export type AuthTokenPayload = z.infer<typeof payloadSchema>;

export function signAuthToken(
  payload: AuthTokenPayload,
  secret: string,
  expiresInSeconds: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
}

/** Verify + shape-check a token. Throws if invalid/expired/malformed. */
export function verifyAuthToken(
  token: string,
  secret: string,
): AuthTokenPayload {
  const decoded = jwt.verify(token, secret);
  return payloadSchema.parse(decoded);
}
