// The messaging boundary. Every channel (Mock, Twilio WhatsApp, future WebChat)
// implements ChannelAdapter. The ConversationEngine talks only to this interface.

/** A normalised inbound message, channel-agnostic. */
export interface InboundMessage {
  /** Sender phone in E.164 (no "whatsapp:" prefix). */
  from: string;
  /** Raw message text, trimmed. */
  text: string;
  /** If the text is a positive integer (a menu reply), its value. */
  choiceIndex?: number;
}

export interface ChannelAdapter {
  /** Send a plain text message. */
  sendText(to: string, text: string): Promise<void>;
  /** Send a prompt followed by a NUMBERED option list (sandbox-friendly). */
  sendOptions(to: string, text: string, options: string[]): Promise<void>;
  /** Turn a raw inbound webhook payload into an InboundMessage. */
  parseInbound(payload: unknown): InboundMessage;
}

/** Parse a numbered-menu reply ("2", " 2 ") into its integer, else undefined. */
export function parseChoiceIndex(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Render a prompt plus a numbered list: "text\n\n1. a\n2. b". */
export function formatOptions(text: string, options: string[]): string {
  const lines = options.map((opt, i) => `${i + 1}. ${opt}`);
  return `${text}\n\n${lines.join("\n")}`;
}
