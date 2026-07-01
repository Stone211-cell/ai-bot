import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  DISCORD_TOKEN: required("DISCORD_TOKEN"),
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  DATABASE_URL: required("DATABASE_URL"),
};