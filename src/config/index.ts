import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/** Parses a comma-separated list of IDs, filtering out empty strings. */
function optionalEnvList(key: string): string[] {
  const raw = process.env[key] ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  discord: {
    token: requireEnv("DISCORD_TOKEN"),
    clientId: optionalEnv("DISCORD_CLIENT_ID", ""),
    allowedTextChannelIds: process.env.ALLOWED_TEXT_CHANNEL_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    ignoredTextChannelIds: process.env.IGNORED_TEXT_CHANNEL_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    allowedVoiceChannelIds: process.env.ALLOWED_VOICE_CHANNEL_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    ignoredVoiceChannelIds: process.env.IGNORED_VOICE_CHANNEL_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
  },

  gemini: {
    apiKeys: requireEnv("GEMINI_API_KEYS").split(",").map((s) => s.trim()).filter(Boolean),
    model: optionalEnv("GEMINI_MODEL", "gemini-2.0-flash"),
    maxTokens: parseInt(optionalEnv("GEMINI_MAX_TOKENS", "1024"), 10),
    temperature: parseFloat(optionalEnv("GEMINI_TEMPERATURE", "0.7")),
    /** จำนวนข้อความย้อนหลังที่บอทจะจำได้ */
    maxHistory: parseInt(optionalEnv("GEMINI_MAX_HISTORY", "10"), 10),
  },

  database: {
    url: requireEnv("DATABASE_URL"),
  },

  app: {
    env: optionalEnv("NODE_ENV", "development"),
    logLevel: optionalEnv("LOG_LEVEL", "info"),
    isDev: optionalEnv("NODE_ENV", "development") === "development",
  },
} as const;

export type Config = typeof config;
