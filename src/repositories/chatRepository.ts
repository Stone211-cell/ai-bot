import type { ChatMessage } from "../../generated/prisma/index.js";
import { prisma } from "../database/prismaClient.js";
import type { CreateChatMessageDto } from "../types/index.js";
import { withDbError } from "../utils/db.js";

export interface IChatRepository {
  create(dto: CreateChatMessageDto): Promise<ChatMessage>;
  findByUserId(userId: string, limit?: number): Promise<ChatMessage[]>;
  findByChannelId(channelId: string, limit?: number): Promise<ChatMessage[]>;
  findByUserAndChannel(userId: string, channelId: string, limit?: number): Promise<ChatMessage[]>;
  countByUserId(userId: string): Promise<number>;
  deleteByUserId(userId: string): Promise<void>;
}

const DEFAULT_LIMIT = 50;

export class ChatRepository implements IChatRepository {
  create(dto: CreateChatMessageDto): Promise<ChatMessage> {
    return withDbError("ChatMessage.create", { userId: dto.userId }, () =>
      prisma.chatMessage.create({
        data: {
          userId: dto.userId,
          channelId: dto.channelId,
          guildId: dto.guildId ?? null,
          role: dto.role,
          content: dto.content,
          tokens: dto.tokens ?? null,
          model: dto.model ?? null,
        },
      }),
    );
  }

  findByUserId(
    userId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<ChatMessage[]> {
    return this.findManyOrdered({ userId }, limit, "ChatMessage.findByUserId", {
      userId,
    });
  }

  findByChannelId(
    channelId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<ChatMessage[]> {
    return this.findManyOrdered(
      { channelId },
      limit,
      "ChatMessage.findByChannelId",
      { channelId },
    );
  }

  findByUserAndChannel(
    userId: string,
    channelId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<ChatMessage[]> {
    return this.findManyOrdered(
      { userId, channelId },
      limit,
      "ChatMessage.findByUserAndChannel",
      { userId, channelId },
    );
  }

  countByUserId(userId: string): Promise<number> {
    return withDbError("ChatMessage.countByUserId", { userId }, () =>
      prisma.chatMessage.count({ where: { userId } }),
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Shared query for both `findByUserId` and `findByChannelId`.
   * Both are identical in shape — ordered desc by createdAt with a limit —
   * differing only in the `where` clause.
   */
  private findManyOrdered(
    where: { userId?: string; channelId?: string },
    limit: number,
    operation: string,
    meta: Record<string, unknown>,
  ): Promise<ChatMessage[]> {
    return withDbError(operation, meta, () =>
      prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    );
  }

  async deleteByUserId(userId: string): Promise<void> {
    await withDbError("Chat.deleteByUserId", { userId }, () =>
      prisma.chatMessage.deleteMany({
        where: { userId },
      }),
    );
  }
}

export const chatRepository = new ChatRepository();
