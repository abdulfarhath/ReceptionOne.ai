// In-memory channel for tests and the CLI: outbound messages are recorded (and
// optionally logged). Inbound payloads are plain { from, text } objects.

import {
  formatButtons,
  formatList,
  formatOptions,
  parseChoiceIndex,
  type ChannelAdapter,
  type InboundMessage,
  type InteractiveButton,
  type ListItem,
} from "./channel.js";

export interface SentMessage {
  to: string;
  text: string;
}

export class MockChannelAdapter implements ChannelAdapter {
  readonly outbox: SentMessage[] = [];

  constructor(private readonly log: (line: string) => void = () => {}) {}

  async sendText(to: string, text: string): Promise<void> {
    this.outbox.push({ to, text });
    this.log(text);
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
  ): Promise<void> {
    const text = formatButtons(body, buttons);
    this.outbox.push({ to, text });
    this.log(text);
  }

  async sendList(
    to: string,
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<void> {
    const text = formatList(body, buttonLabel, items);
    this.outbox.push({ to, text });
    this.log(text);
  }

  async sendOptions(to: string, text: string, options: string[]): Promise<void> {
    const body = formatOptions(text, options);
    this.outbox.push({ to, text: body });
    this.log(body);
  }

  parseInbound(payload: unknown): InboundMessage {
    const p = (payload ?? {}) as { from?: unknown; text?: unknown };
    const from = String(p.from ?? "");
    const text = String(p.text ?? "").trim();
    const choiceIndex = parseChoiceIndex(text);
    return choiceIndex === undefined
      ? { from, text }
      : { from, text, choiceIndex };
  }

  /** The most recent outbound message (handy in tests). */
  last(): SentMessage | undefined {
    return this.outbox.at(-1);
  }
}
