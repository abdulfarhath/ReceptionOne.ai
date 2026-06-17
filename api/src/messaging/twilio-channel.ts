// Twilio WhatsApp channel (works with the free sandbox). Outbound goes through
// the REST API; inbound webhook payloads are form fields From / Body.

import twilio from "twilio";

import {
  formatOptions,
  parseChoiceIndex,
  type ChannelAdapter,
  type InboundMessage,
} from "./channel.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender, including the channel prefix, e.g. "whatsapp:+14155238886". */
  from: string;
}

export class TwilioWhatsAppChannelAdapter implements ChannelAdapter {
  private readonly client: ReturnType<typeof twilio>;
  private readonly from: string;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.from = config.from;
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${to}`,
      body: text,
    });
  }

  async sendOptions(to: string, text: string, options: string[]): Promise<void> {
    await this.sendText(to, formatOptions(text, options));
  }

  parseInbound(payload: unknown): InboundMessage {
    const p = (payload ?? {}) as { From?: unknown; Body?: unknown };
    const from = String(p.From ?? "").replace(/^whatsapp:/, "");
    const text = String(p.Body ?? "").trim();
    const choiceIndex = parseChoiceIndex(text);
    return choiceIndex === undefined
      ? { from, text }
      : { from, text, choiceIndex };
  }
}
