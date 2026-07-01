/**
 * Application Entrypoint
 *
 * Responsibilities:
 * - Register global error handlers
 * - Register graceful shutdown handlers
 * - Start the bot
 *
 * NO business logic lives here.
 */
import { registerGlobalErrorHandlers } from "./utils/errorHandler.js";
import { startBot, registerShutdownHandlers } from "./bot/index.js";
import { logger } from "./utils/logger.js";
import ffmpegPath from "ffmpeg-static";
import express from "express";

// Ensure FFMPEG is available for Discord.js Voice
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const appLogger = logger.child("App");

async function main(): Promise<void> {
  appLogger.info("=== Discord AI Bot ===");

  registerGlobalErrorHandlers();
  registerShutdownHandlers();

  // Start HTTP Server for Render.com Port Binding
  const app = express();
  const port = process.env.PORT || 3000;
  
  app.get("/", (req, res) => {
    res.send("Bot is running 24/7!");
  });

  app.listen(port, () => {
    appLogger.info(`Web server is listening on port ${port}`);
  });

  await startBot();
}

main().catch((error: unknown) => {
  appLogger.error("Fatal error during startup", { error });
  process.exit(1);
});
