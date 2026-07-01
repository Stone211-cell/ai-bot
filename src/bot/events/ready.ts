import type { Client, ApplicationCommandDataResolvable } from "discord.js";
import { Events, ApplicationCommandType, ApplicationCommandOptionType } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

const eventLogger = logger.child("ReadyEvent");

export const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,

  async execute(...args: unknown[]): Promise<void> {
    const client = args[0] as Client<true>;

    eventLogger.info(`Logged in as ${client.user.tag}`, {
      id: client.user.id,
      guilds: client.guilds.cache.size,
    });

    const commands: ApplicationCommandDataResolvable[] = [
      {
        name: "joinmom",
        description: "เรียกบอทเข้าห้องเสียงเพื่อพูดคุยตอบโต้แบบ AI (โทนี่ สตาร์ค)",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "talkmom",
        description: "เรียกบอทเข้าห้องเสียงเพื่อพูดคุยตอบโต้แบบ AI (โทนี่ สตาร์ค)",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "readmom",
        description: "เรียกบอทเข้าห้องเสียงเพื่ออ่านแชทแทนคนไม่มีไมค์ (ไม่ตอบโต้)",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "leavemom",
        description: "สั่งให้บอทออกจากห้องเสียง",
        type: ApplicationCommandType.ChatInput,
      },
    ];

    try {
      await client.application.commands.set(commands);
      eventLogger.info("Successfully registered global Slash Commands!");
    } catch (error) {
      eventLogger.error("Failed to register Slash Commands:", { error });
    }
  },
};
