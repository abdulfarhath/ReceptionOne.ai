import { Router, urlencoded } from "express";
import twilio from "twilio";
import { z } from "zod";

import type { ChannelAdapter } from "../../messaging/channel.js";
import type { ConversationEngine } from "../../messaging/engine.js";
import { ah } from "../async-handler.js";

export interface WebhookDeps {
  engine: ConversationEngine;
  channel: ChannelAdapter;
  /** When set, validate the X-Twilio-Signature header. */
  twilioAuthToken?: string;
  /** Public base URL Twilio calls (e.g. the ngrok https origin), for signature checks. */
  publicUrl?: string;
}

// Twilio sends many fields; we only need From/Body but keep the rest for signing.
const twilioBodySchema = z
  .object({ From: z.string().optional(), Body: z.string().optional() })
  .passthrough();

/** Inbound WhatsApp webhook. Validates, normalises, feeds the engine, replies. */
export function webhookRouter(deps: WebhookDeps): Router {
  const router = Router();

  router.post(
    "/",
    urlencoded({ extended: false }),
    ah(async (req, res) => {
      if (deps.twilioAuthToken) {
        const signature = req.header("X-Twilio-Signature") ?? "";
        const base = deps.publicUrl ?? `${req.protocol}://${req.get("host")}`;
        const url = `${base}${req.originalUrl}`;
        const valid = twilio.validateRequest(
          deps.twilioAuthToken,
          signature,
          url,
          (req.body ?? {}) as Record<string, string>,
        );
        if (!valid) {
          res
            .status(403)
            .json({ error: { code: "FORBIDDEN", message: "Invalid signature" } });
          return;
        }
      }

      const parsed = twilioBodySchema.parse(req.body ?? {});
      const inbound = deps.channel.parseInbound(parsed);

      // Reply via the channel (REST). Acknowledge with empty TwiML.
      if (inbound.from && inbound.text) {
        await deps.engine.handle(inbound);
      }
      res.status(200).type("text/xml").send("<Response></Response>");
    }),
  );

  return router;
}
