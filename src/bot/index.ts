import { getClient, destroyClient } from "./client.js";
import { loadEvents } from "./handlers/eventLoader.js";
import { config } from "../config/index.js";
import { connectDatabase, disconnectDatabase } from "../database/prismaClient.js";
import { logger } from "../utils/logger.js";

const botLogger = logger.child("BotBootstrap");

export async function startBot(): Promise<void> {
  botLogger.info("Starting bot...");

  // ── 1. Connect to database ────────────────────────────────────────────────
  await connectDatabase();

  // ── 2. Get Discord client ─────────────────────────────────────────────────
  const client = getClient();

  // ── 3. Register event handlers ────────────────────────────────────────────
  loadEvents(client);

  // ── 4. Login to Discord ───────────────────────────────────────────────────
  await client.login(config.discord.token);

  botLogger.info("Bot started successfully");
}

export async function stopBot(): Promise<void> {
  botLogger.info("Shutting down bot...");

  destroyClient();
  await disconnectDatabase();

  botLogger.info("Bot shut down cleanly");
}

/**
 * Registers graceful shutdown handlers for SIGINT and SIGTERM.
 */
export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    botLogger.info(`Received ${signal} — initiating graceful shutdown`);
    await stopBot();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
