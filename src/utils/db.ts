import { DatabaseError } from "./errorHandler.js";
import { logger } from "./logger.js";

const dbLogger = logger.child("DB");

/**
 * Wraps a Prisma call with consistent error handling.
 * Logs the failure, then re-throws as a typed `DatabaseError`.
 *
 * @param operation  - A short label used in the log message (e.g. "User.findById").
 * @param meta       - Extra fields logged alongside the error.
 * @param fn         - The async Prisma call to execute.
 */
export async function withDbError<T>(
  operation: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    dbLogger.error(`${operation} failed`, { ...meta, error });
    throw new DatabaseError(`Database operation failed: ${operation}`);
  }
}
