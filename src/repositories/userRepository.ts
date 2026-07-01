import type { User } from "../../generated/prisma/index.js";
import { prisma } from "../database/prismaClient.js";
import type { CreateUserDto } from "../types/index.js";
import { withDbError } from "../utils/db.js";

export interface IUserRepository {
  findByDiscordId(discordId: string): Promise<User | null>;
  findById(discordId: string): Promise<User | null>;
  upsert(dto: CreateUserDto): Promise<User>;
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
