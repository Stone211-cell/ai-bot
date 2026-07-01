import { logger } from "./logger.js";

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string = "INTERNAL_ERROR",
    statusCode: number = 500,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DiscordError extends AppError {
  constructor(message: string, code: string = "DISCORD_ERROR") {
    super(message, code, 500, true);
    this.name = "DiscordError";
  }
}

export class OpenAIError extends AppError {
  constructor(message: string, code: string = "OPENAI_ERROR") {
    super(message, code, 502, true);
    this.name = "OpenAIError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, code: string = "DATABASE_ERROR") {
    super(message, code, 500, true);
    this.name = "DatabaseError";
  }
}

const errorLogger = logger.child("ErrorHandler");

/**
 * Handles errors globally. Logs them and determines if the process should exit.
 */
export function handleError(error: unknown, context?: string): void {
  if (error instanceof AppError) {
    if (error.isOperational) {
      errorLogger.warn(
        `[${context ?? error.name}] ${error.message}`,
        { code: error.code, stack: error.stack },
      );
    } else {
      errorLogger.error(
        `[${context ?? error.name}] CRITICAL — ${error.message}`,
        { code: error.code, stack: error.stack },
      );
      process.exit(1);
    }
    return;
  }

  if (error instanceof Error) {
    errorLogger.error(`[${context ?? "Unhandled"}] ${error.message}`, {
      stack: error.stack,
    });
    return;
  }

  errorLogger.error(`[${context ?? "Unknown"}] Unknown error`, { error });
}

/**
 * Register global process-level error handlers.
 */
export function registerGlobalErrorHandlers(): void {
  process.on("uncaughtException", (error: Error) => {
    errorLogger.error("Uncaught Exception — shutting down", {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    errorLogger.error("Unhandled Promise Rejection", { reason });
  });

  errorLogger.debug("Global error handlers registered");
}
