import express, { type Express } from "express";
import cookieParser from "cookie-parser";

import type { AppDeps } from "./deps.js";
import { errorHandler } from "./middleware/error.js";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { broadcastsRouter } from "./routes/broadcasts.js";
import { doctorsRouter } from "./routes/doctors.js";
import { patientsRouter } from "./routes/patients.js";
import { webhookRouter } from "./routes/webhook.js";

/** Build the Express app. All dependencies are injected for testability. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter(deps));
  app.use("/api/doctors", doctorsRouter(deps));
  app.use("/api/patients", patientsRouter(deps));
  app.use("/api/appointments", appointmentsRouter(deps));
  app.use("/api/analytics", analyticsRouter(deps));
  if (deps.broadcasts) {
    app.use("/api/broadcasts", broadcastsRouter(deps, deps.broadcasts));
  }

  if (deps.messaging) {
    app.use(
      "/webhook",
      webhookRouter({
        engine: deps.messaging.engine,
        channel: deps.messaging.channel,
        ...(deps.messaging.twilioAuthToken
          ? { twilioAuthToken: deps.messaging.twilioAuthToken }
          : {}),
        ...(deps.messaging.publicUrl
          ? { publicUrl: deps.messaging.publicUrl }
          : {}),
      }),
    );
  }

  // Single error middleware (must be last).
  app.use(errorHandler(deps.logger));

  return app;
}
