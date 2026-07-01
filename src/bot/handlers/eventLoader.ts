import type { Client } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

// ── Import all events ─────────────────────────────────────────────────────────
import { readyEvent } from "../events/ready.js";
import { messageCreateEvent } from "../events/messageCreate.js";
import { interactionCreateEvent } from "../events/interactionCreate.js";
import { voiceStateUpdateEvent } from "../events/voiceStateUpdate.js";

const handlerLogger = logger.child("EventLoader");

/**
 * Registers all event handlers on the Discord client.
 */
export function loadEvents(client: Client): void {
  const events = [readyEvent, messageCreateEvent, interactionCreateEvent, voiceStateUpdateEvent];

  for (const event of events) {
    if (event.once) {
      client.once(event.name, (...args) => {
        void event.execute(...args);
      });
    } else {
      client.on(event.name, (...args) => {
        void event.execute(...args);
      });
    }

    handlerLogger.debug(`Registered event: ${event.name}`, {
      once: event.once ?? false,
    });
  }

  handlerLogger.info(`Loaded ${events.length} events`);
}
