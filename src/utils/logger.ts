import { config } from "../config/index.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: "\x1b[36m", // Cyan
  info: "\x1b[32m",  // Green
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function getTimestamp(): string {
  return new Date().toISOString();
}

/** JSON.stringify replacer that serializes Error objects properly. */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value as unknown as Record<string, unknown>),
    };
  }
  return value;
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: string,
  meta?: unknown,
): string {
  const ts = COLORS.dim + getTimestamp() + COLORS.reset;
  const lvl =
    COLORS[level] +
    COLORS.bold +
    level.toUpperCase().padEnd(5) +
    COLORS.reset;
  const ctx = context
    ? COLORS.dim + `[${context}]` + COLORS.reset + " "
    : "";
  const metaStr =
    meta !== undefined
      ? "\n" + COLORS.dim + JSON.stringify(meta, errorReplacer, 2) + COLORS.reset
      : "";

  return `${ts} ${lvl} ${ctx}${message}${metaStr}`;
}

class Logger {
  // Store the raw level string so child() can pass it directly
  // without an expensive reverse-lookup on LEVELS.
  private readonly level: LogLevel;
  private readonly minLevel: number;
  private readonly context?: string;

  constructor(level: LogLevel = "info", context?: string) {
    this.level = level;
    this.minLevel = LEVELS[level];
    this.context = context;
  }

  child(context: string): Logger {
    return new Logger(this.level, context);
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVELS[level] < this.minLevel) return;

    const formatted = formatMessage(level, message, this.context, meta);

    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log("error", message, meta);
  }
}

export const logger = new Logger(
  (config.app.logLevel as LogLevel) ?? "info",
  "Bot",
);

export { Logger };
