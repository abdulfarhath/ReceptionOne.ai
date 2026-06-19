// Twilio WhatsApp channel with interactive message support. Outbound goes
// through the REST API using Content Templates for buttons and list-pickers;
// inbound webhook payloads are form fields From / Body / ButtonPayload.
//
// Content Templates are created lazily via the Content API and cached by
// structure (number of buttons / items) for the lifetime of the process.
// Each template uses variable placeholders ({{1}}, {{2}}, …) so a single
// template serves every message with the same shape.

import twilio from "twilio";

import {
  formatOptions,
  parseChoiceIndex,
  type ChannelAdapter,
  type InboundMessage,
  type InteractiveButton,
  type ListItem,
} from "./channel.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender, including the channel prefix, e.g. "whatsapp:+14155238886". */
  from: string;
  /** Optional Messaging Service SID — required by some Twilio setups for Content API. */
  messagingServiceSid?: string;
}

// WhatsApp limits
const BUTTON_TITLE_MAX = 20;
const LIST_TITLE_MAX = 24;
const LIST_DESC_MAX = 72;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/**
 * Lazily creates and caches Twilio Content Templates (one per structure).
 * A "2-button quick-reply" template is reused for every 2-button message;
 * the actual text is injected via contentVariables at send time.
 */
class ContentTemplateCache {
  private readonly client: ReturnType<typeof twilio>;
  /** Map from a cache key (e.g. "btn:3" or "list:5") to the Content SID. */
  private readonly sids = new Map<string, string>();
  /** Pending creation promises to avoid races on concurrent first-use. */
  private readonly pending = new Map<string, Promise<string>>();

  constructor(client: ReturnType<typeof twilio>) {
    this.client = client;
  }

  /** Get or create a quick-reply template for `count` buttons. */
  async getButtonsSid(count: number): Promise<string> {
    return this.getOrCreate(`btn:${count}`, () => this.createButtons(count));
  }

  /** Get or create a list-picker template for `count` items. */
  async getListSid(count: number): Promise<string> {
    return this.getOrCreate(`list:${count}`, () => this.createList(count));
  }

  private async getOrCreate(
    key: string,
    factory: () => Promise<string>,
  ): Promise<string> {
    const existing = this.sids.get(key);
    if (existing) return existing;

    // Deduplicate concurrent creation requests for the same key.
    let promise = this.pending.get(key);
    if (!promise) {
      promise = factory().then((sid) => {
        this.sids.set(key, sid);
        this.pending.delete(key);
        return sid;
      });
      this.pending.set(key, promise);
    }
    return promise;
  }

  /**
   * Create a twilio/quick-reply Content Template with `count` buttons.
   * Body = {{1}}, button titles = {{2}}, {{3}}, …
   */
  private async createButtons(count: number): Promise<string> {
    const actions = Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      title: `{{${i + 2}}}`,
    }));

    const content = await this.client.content.v1.contents.create({
      friendlyName: `receptionone_btn_${count}_${Date.now()}`,
      language: "en",
      // The Twilio SDK types don't include Content Template schemas yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      types: {
        "twilio/quick-reply": {
          body: "{{1}}",
          actions,
        },
      } as any,
    });
    return content.sid;
  }

  /**
   * Create a twilio/list-picker Content Template with `count` items.
   * Body = {{1}}, button label = {{2}}, item titles = {{3}}, {{5}}, {{7}}, …
   * item descriptions = {{4}}, {{6}}, {{8}}, … (empty string when unused).
   */
  private async createList(count: number): Promise<string> {
    const items = Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      item: `{{${3 + i * 2}}}`,
      description: `{{${4 + i * 2}}}`,
    }));

    const content = await this.client.content.v1.contents.create({
      friendlyName: `receptionone_list_${count}_${Date.now()}`,
      language: "en",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      types: {
        "twilio/list-picker": {
          body: "{{1}}",
          button: "{{2}}",
          items,
        },
      } as any,
    });
    return content.sid;
  }
}

export class TwilioWhatsAppChannelAdapter implements ChannelAdapter {
  private readonly client: ReturnType<typeof twilio>;
  private readonly from: string;
  private readonly messagingServiceSid?: string;
  private readonly templates: ContentTemplateCache;

  constructor(config: TwilioConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.from = config.from;
    if (config.messagingServiceSid) {
      this.messagingServiceSid = config.messagingServiceSid;
    }
    this.templates = new ContentTemplateCache(this.client);
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${to}`,
      body: text,
    });
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
  ): Promise<void> {
    const count = Math.min(buttons.length, 3); // WhatsApp max 3 buttons
    try {
      const contentSid = await this.templates.getButtonsSid(count);
      const vars: Record<string, string> = { "1": body };
      for (let i = 0; i < count; i++) {
        vars[String(i + 2)] = truncate(buttons[i]!.title, BUTTON_TITLE_MAX);
      }
      await this.client.messages.create({
        from: this.messagingServiceSid ?? this.from,
        to: `whatsapp:${to}`,
        contentSid,
        contentVariables: JSON.stringify(vars),
      });
    } catch {
      // Fallback to plain text if Content API is unavailable (e.g. sandbox).
      await this.sendOptions(
        to,
        body,
        buttons.map((b) => b.title),
      );
    }
  }

  async sendList(
    to: string,
    body: string,
    buttonLabel: string,
    items: ListItem[],
  ): Promise<void> {
    const count = Math.min(items.length, 10); // WhatsApp max 10 items
    try {
      const contentSid = await this.templates.getListSid(count);
      const vars: Record<string, string> = {
        "1": body,
        "2": truncate(buttonLabel, BUTTON_TITLE_MAX),
      };
      for (let i = 0; i < count; i++) {
        vars[String(3 + i * 2)] = truncate(items[i]!.title, LIST_TITLE_MAX);
        vars[String(4 + i * 2)] = truncate(
          items[i]!.description ?? " ",
          LIST_DESC_MAX,
        );
      }
      await this.client.messages.create({
        from: this.messagingServiceSid ?? this.from,
        to: `whatsapp:${to}`,
        contentSid,
        contentVariables: JSON.stringify(vars),
      });
    } catch {
      // Fallback to plain text if Content API is unavailable (e.g. sandbox).
      await this.sendOptions(
        to,
        body,
        items.map((item) =>
          item.description ? `${item.title} — ${item.description}` : item.title,
        ),
      );
    }
  }

  async sendOptions(to: string, text: string, options: string[]): Promise<void> {
    await this.sendText(to, formatOptions(text, options));
  }

  parseInbound(payload: unknown): InboundMessage {
    const p = (payload ?? {}) as {
      From?: unknown;
      Body?: unknown;
      ButtonPayload?: unknown;
    };
    const from = String(p.From ?? "").replace(/^whatsapp:/, "");
    const text = String(p.Body ?? "").trim();

    // Interactive replies: Twilio sends the tapped button/list-item ID in
    // ButtonPayload. This works for both quick-reply and list-picker.
    const buttonPayload = p.ButtonPayload
      ? String(p.ButtonPayload).trim()
      : undefined;
    const choiceIndex =
      parseChoiceIndex(buttonPayload ?? "") ?? parseChoiceIndex(text);

    return choiceIndex === undefined
      ? { from, text }
      : { from, text, choiceIndex };
  }
}
