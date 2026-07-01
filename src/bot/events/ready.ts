import type { Client } from "discord.js";
import { Events } from "discord.js";
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
  },
};
