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
import "./preload.js"; // MUST BE FIRST
import { registerGlobalErrorHandlers } from "./utils/errorHandler.js";
import { startBot, registerShutdownHandlers } from "./bot/index.js";
import { logger } from "./utils/logger.js";
import express from "express";
import dns from "dns";
import { generateDependencyReport } from "@discordjs/voice";
import { dashboardRouter } from "./api/dashboard.js";
import path from "path";
import { fileURLToPath } from "url";

// แก้ปัญหา Discord Voice (UDP Timeout) ที่เกิดจาก Node.js พยายามใช้ IPv6 
dns.setDefaultResultOrder('ipv4first');

const appLogger = logger.child("App");

async function main(): Promise<void> {
  appLogger.info("=== Discord AI Bot ===");
  appLogger.debug(`Voice Dependencies:\n${generateDependencyReport()}`);

  registerGlobalErrorHandlers();
  registerShutdownHandlers();

  // Start HTTP Server for Render.com Port Binding
  const app = express();
  const port = process.env.PORT || 3000;
  
  // ให้ Express รองรับ JSON
  app.use(express.json());

  // เสิร์ฟโฟลเดอร์หน้าเว็บ (Frontend)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.join(__dirname, "../public")));

  // นำเข้า API ของ Dashboard
  app.use("/api", dashboardRouter);
  
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
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
