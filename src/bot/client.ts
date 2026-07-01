import {
  Client,
  GatewayIntentBits,
  Partials,
  type ClientOptions,
} from "discord.js";
import { logger } from "../utils/logger.js";

const clientLogger = logger.child("DiscordClient");

const clientOptions: ClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
};

// Singleton Discord client
let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = new Client(clientOptions);
    clientLogger.debug("Discord client created");
  }
  return _client;
}

export function destroyClient(): void {
  if (_client) {
    _client.destroy();
    _client = null;
    clientLogger.info("Discord client destroyed");
  }
}
