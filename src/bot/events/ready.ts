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
        description: "-",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "talkmom",
        description: "-",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "readmom",
        description: "-",
        type: ApplicationCommandType.ChatInput,
      },
      {
        name: "leavemom",
        description: "-",
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
