// Selects the WhatsApp channel from env: Twilio when its creds are present,
// otherwise the Mock (used by the CLI and as a safe default).

import type { ChannelAdapter } from "./channel.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { TwilioWhatsAppChannelAdapter } from "./twilio-channel.js";

export interface ChannelSelection {
  channel: ChannelAdapter;
  usingTwilio: boolean;
  /** Present when Twilio is active; used to validate inbound webhook signatures. */
  twilioAuthToken?: string;
}

export function createChannelFromEnv(
  log?: (line: string) => void,
): ChannelSelection {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && from) {
    return {
      channel: new TwilioWhatsAppChannelAdapter({ accountSid, authToken, from }),
      usingTwilio: true,
      twilioAuthToken: authToken,
    };
  }
  return { channel: new MockChannelAdapter(log), usingTwilio: false };
}
