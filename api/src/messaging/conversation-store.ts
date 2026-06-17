import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  ConversationContext,
  ConversationRecord,
  ConversationStep,
  ConversationStore,
} from "./conversation.js";

/** In-memory store for tests and the CLI. */
export class InMemoryConversationStore implements ConversationStore {
  private readonly records = new Map<string, ConversationRecord>();

  async get(phone: string): Promise<ConversationRecord | null> {
    const found = this.records.get(phone);
    return found ? structuredClone(found) : null;
  }

  async save(record: ConversationRecord): Promise<void> {
    this.records.set(record.phone, structuredClone(record));
  }
}

/** Postgres-backed store (one row per phone). */
export class PrismaConversationStore implements ConversationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async get(phone: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findUnique({ where: { phone } });
    if (!row) return null;
    return {
      phone: row.phone,
      step: row.state as ConversationStep,
      context: (row.context ?? {}) as ConversationContext,
    };
  }

  async save(record: ConversationRecord): Promise<void> {
    const context = record.context as unknown as Prisma.InputJsonValue;
    await this.prisma.conversation.upsert({
      where: { phone: record.phone },
      create: { phone: record.phone, state: record.step, context },
      update: { state: record.step, context },
    });
  }
}
