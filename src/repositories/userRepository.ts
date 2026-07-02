import type { User } from "../../generated/prisma/index.js";
import { prisma } from "../database/prismaClient.js";
import type { CreateUserDto } from "../types/index.js";
import { withDbError } from "../utils/db.js";

export interface IUserRepository {
  findByDiscordId(discordId: string): Promise<User | null>;
  findById(discordId: string): Promise<User | null>;
  upsert(dto: CreateUserDto): Promise<User>;
  getRelationshipHighlights(limit?: number): Promise<{ favoriteUsers: string[]; dislikedUsers: string[] }>;
  updateAffinity(discordId: string, delta: number, relationshipStatus?: string | null): Promise<User>;
  setRelationshipStatus(discordId: string, relationshipStatus: string | null): Promise<User>;
  saveNickname(discordId: string, nickname: string): Promise<User>;
  updateSummary(discordId: string, summary: string): Promise<User>;
  incrementMsgCount(discordId: string): Promise<User>;
  resetMsgCount(discordId: string): Promise<User>;
}

export class UserRepository implements IUserRepository {
  findByDiscordId(discordId: string): Promise<User | null> {
    return withDbError("User.findByDiscordId", { discordId }, () =>
      prisma.user.findUnique({ where: { discordId } }),
    );
  }

  findById(id: string): Promise<User | null> {
    return withDbError("User.findById", { id }, () =>
      prisma.user.findUnique({ where: { id } }),
    );
  }

  async getRelationshipHighlights(limit = 5): Promise<{ favoriteUsers: string[]; dislikedUsers: string[] }> {
    return withDbError("User.getRelationshipHighlights", { limit }, async () => {
      const [favoriteUsers, dislikedUsers] = await prisma.$transaction([
        prisma.user.findMany({
          where: { affinity: { gt: 0 } },
          orderBy: [{ affinity: "desc" }, { updatedAt: "desc" }],
          take: limit,
          select: { username: true },
        }),
        prisma.user.findMany({
          where: { affinity: { lt: 0 } },
          orderBy: [{ affinity: "asc" }, { updatedAt: "desc" }],
          take: limit,
          select: { username: true },
        }),
      ]);

      return {
        favoriteUsers: favoriteUsers.map((user) => user.username),
        dislikedUsers: dislikedUsers.map((user) => user.username),
      };
    });
  }

  async updateAffinity(discordId: string, delta: number, relationshipStatus?: string | null): Promise<User> {
    return withDbError("User.updateAffinity", { discordId, delta }, async () => {
      const current = await prisma.user.findUnique({
        where: { discordId },
        select: { affinity: true },
      });
      const nextAffinity = Math.max(-100, Math.min(100, (current?.affinity ?? 0) + delta));

      return prisma.user.update({
        where: { discordId },
        data: {
          affinity: nextAffinity,
          ...(relationshipStatus !== undefined ? { relationshipStatus } : {}),
        },
      });
    });
  }

  setRelationshipStatus(discordId: string, relationshipStatus: string | null): Promise<User> {
    return withDbError("User.setRelationshipStatus", { discordId, relationshipStatus }, () =>
      prisma.user.update({
        where: { discordId },
        data: { relationshipStatus },
      }),
    );
  }

  saveNickname(discordId: string, nickname: string): Promise<User> {
    return withDbError("User.saveNickname", { discordId, nickname }, async () => {
      // 1. ลองหา/อัพเดตตรงๆ ด้วย discordId (ถ้าเป็นตัวเลขล้วน)
      if (/^\d+$/.test(discordId)) {
        try {
          return await prisma.user.update({
            where: { discordId },
            data: { nickname },
          });
        } catch (err) {
          // ถ้าเกิดหาไม่เจอในขั้นตอนนี้ ค่อยเลื่อนไปค้นหาด้วย username ด้านล่าง
        }
      }

      // 2. ถ้าไม่ใช่ตัวเลข หรือหาด้วย id ไม่เจอ ให้หาจาก username หรือ nickname (case-insensitive)
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: discordId, mode: "insensitive" } },
            { nickname: { equals: discordId, mode: "insensitive" } },
          ],
        },
      });

      if (!user) {
        throw new Error(`User with ID or Username "${discordId}" not found in database.`);
      }

      return prisma.user.update({
        where: { id: user.id },
        data: { nickname },
      });
    });
  }

  upsert(dto: CreateUserDto): Promise<User> {
    return withDbError("User.upsert", { discordId: dto.discordId }, () =>
      prisma.user.upsert({
        where: { discordId: dto.discordId },
        update: {
          username: dto.username,
          discriminator: dto.discriminator,
          avatarUrl: dto.avatarUrl,
        },
        create: {
          discordId: dto.discordId,
          username: dto.username,
          discriminator: dto.discriminator,
          avatarUrl: dto.avatarUrl,
          isBot: dto.isBot ?? false,
          msgCountSinceSummary: 0,
        },
      }),
    );
  }

  updateSummary(discordId: string, summary: string): Promise<User> {
    return withDbError("User.updateSummary", { discordId }, () =>
      prisma.user.update({
        where: { discordId },
        data: { summary, msgCountSinceSummary: 0 },
      }),
    );
  }

  incrementMsgCount(discordId: string): Promise<User> {
    return withDbError("User.incrementMsgCount", { discordId }, () =>
      prisma.user.update({
        where: { discordId },
        data: { msgCountSinceSummary: { increment: 1 } },
      }),
    );
  }

  resetMsgCount(discordId: string): Promise<User> {
    return withDbError("User.resetMsgCount", { discordId }, () =>
      prisma.user.update({
        where: { discordId },
        data: { msgCountSinceSummary: 0 },
      }),
    );
  }
}

export const userRepository = new UserRepository();
