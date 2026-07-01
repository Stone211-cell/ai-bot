import { PrismaClient } from "../../generated/prisma/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

const dbLogger = logger.child("Database");

// Prevent multiple instances in development (hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: config.app.isDev
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
    datasources: {
      db: {
        url: config.database.url,
      },
    },
  });

  return client;
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (config.app.isDev) {
  globalThis.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    dbLogger.info("Database connected successfully");
  } catch (error) {
    dbLogger.error("Failed to connect to database", { error });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    dbLogger.info("Database disconnected");
  } catch (error) {
    dbLogger.error("Failed to disconnect from database", { error });
  }
}
