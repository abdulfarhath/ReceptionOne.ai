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

/** A tappable button for quick-reply messages (WhatsApp allows up to 3). */
export interface InteractiveButton {
  /** Stable identifier returned in the webhook when tapped (e.g. "1"). */
  id: string;
  /** Visible label (max 20 chars for WhatsApp). */
  title: string;
}

/** An item in a list-picker menu (WhatsApp allows up to 10). */
export interface ListItem {
  /** Stable identifier returned in the webhook when selected (e.g. "1"). */
  id: string;
  /** Primary label (max 24 chars for WhatsApp). */
  title: string;
  /** Optional secondary line (max 72 chars for WhatsApp). */
  description?: string;
}

export interface ChannelAdapter {
  /** Send a plain text message. */
  sendText(to: string, text: string): Promise<void>;

  /**
   * Send a prompt followed by tappable quick-reply buttons.
   * WhatsApp supports up to 3 buttons; use sendList for more options.
   */
  sendButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
  ): Promise<void>;

  /**
   * Send a prompt with a list-picker menu the patient can scroll and tap.
   * WhatsApp supports up to 10 items; ideal for 4+ choices.
   * @param buttonLabel The text shown on the "open menu" button (max 20 chars).
   */
  sendList(
    to: string,
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<void>;

  /**
   * Legacy: send a prompt followed by a NUMBERED option list as plain text.
   * Kept for backward compatibility; new code should prefer sendButtons / sendList.
   */
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

/** Render a prompt plus button labels: "text\n\n[1] a\n[2] b". */
export function formatButtons(
  text: string,
  buttons: InteractiveButton[],
): string {
  const lines = buttons.map((b) => `[${b.id}] ${b.title}`);
  return `${text}\n\n${lines.join("\n")}`;
}

/** Render a prompt plus list items: "text\n\n1. title — description". */
export function formatList(
  text: string,
  _buttonLabel: string,
  items: ListItem[],
): string {
  const lines = items.map(
    (item) =>
      `${item.id}. ${item.title}${item.description ? ` — ${item.description}` : ""}`,
  );
  return `${text}\n\n${lines.join("\n")}`;
}
