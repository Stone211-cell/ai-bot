// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  Discord types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscordMessageContext {
  discordId: string;
  username: string;
  discriminator: string;
  avatarUrl: string | null;
  channelId: string;
  guildId: string | null;
  content: string;
  imageParts?: { data: string; mimeType: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Event handler types
// ─────────────────────────────────────────────────────────────────────────────

export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  OpenAI / AI types
// ─────────────────────────────────────────────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant";

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  imageParts?: { data: string; mimeType: string }[];
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  contextUsername?: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Repository types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateUserDto {
  discordId: string;
  username: string;
  discriminator: string;
  avatarUrl?: string | null;
  isBot?: boolean;
}

export interface CreateChatMessageDto {
  userId: string;
  channelId: string;
  guildId?: string | null;
  role: ChatRole;
  content: string;
  tokens?: number | null;
  model?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Service types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessMessageResult {
  reply: string;
  tokensUsed: number;
  model: string;
}
