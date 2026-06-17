import type { ErrorRequestHandler } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";

import type { DomainErrorCode } from "../../domain/errors.js";
import { DomainError } from "../../domain/errors.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";

const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  SLOT_UNAVAILABLE: 409,
  OUTSIDE_HOURS: 422,
  PAST_TIME: 422,
};

/** The single error middleware. Maps known errors to status codes; never leaks stacks. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: { code: "VALIDATION", message: "Invalid request", issues: err.issues },
      });
      return;
    }
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: err.message } });
      return;
    }
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: err.message } });
      return;
    }
    if (err instanceof DomainError) {
      res
        .status(DOMAIN_STATUS[err.code])
        .json({ error: { code: err.code, message: err.message } });
      return;
    }
    logger.error({ err }, "Unhandled error");
    res
      .status(500)
      .json({ error: { code: "INTERNAL", message: "Internal server error" } });
  };
}
