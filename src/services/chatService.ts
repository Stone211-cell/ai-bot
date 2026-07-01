import type { DiscordMessageContext, ProcessMessageResult, ChatMessage } from "../types/index.js";
import { config } from "../config/index.js";
import { geminiService } from "../ai/chat/geminiService.js";
import { summaryService } from "../ai/summary/summaryService.js";
import { buildMessages, buildSystemPrompt } from "../ai/prompt/promptBuilder.js";
import { chatRepository } from "../repositories/chatRepository.js";
import { userRepository } from "../repositories/userRepository.js";
import { knowledgeRepository } from "../repositories/knowledgeRepository.js";
import { handleError } from "../utils/errorHandler.js";
import { logger } from "../utils/logger.js";

const svcLogger = logger.child("ChatService");

export interface IChatService {
  processMessage(ctx: DiscordMessageContext): Promise<ProcessMessageResult>;
}

export class ChatService implements IChatService {
  /**
   * Main pipeline:
   * 1. Upsert Discord user in DB
   * 2. Build prompt
   * 3. Send to OpenAI
   * 4. Persist user message + assistant reply in parallel
   * 5. Return the reply
   */
  async processMessage(
    ctx: DiscordMessageContext,
  ): Promise<ProcessMessageResult> {
    svcLogger.debug("Processing message", {
      discordId: ctx.discordId,
      channelId: ctx.channelId,
    });

    // ── 1. Upsert user ──────────────────────────────────────────────────────
    const user = await userRepository.upsert({
      discordId: ctx.discordId,
      username: ctx.username,
      discriminator: ctx.discriminator,
      avatarUrl: ctx.avatarUrl,
      isBot: false,
    });

    // ── 2. Fetch History ────────────────────────────────────────────────────
    const rawHistory = await chatRepository.findByUserAndChannel(
      user.id,
      ctx.channelId,
      config.gemini.maxHistory,
    );

    // Prisma returns them in descending order (newest first). 
    // We need them in ascending order (oldest first) for the prompt.
    const historyMessages: ChatMessage[] = rawHistory
      .reverse()
      .map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));

    // ── 3. Build prompt ─────────────────────────────────────────────────────
    const globalKnowledge = await knowledgeRepository.getAllFacts();
    
    const systemPrompt = buildSystemPrompt({
      username: ctx.username,
      summary: user.summary,
      globalKnowledge,
    });
    const messages = buildMessages(systemPrompt, ctx.content, historyMessages, ctx.imageParts);

    // ── 3. Call Gemini ────────────────────────────────────────────────
    const completion = await geminiService.chat({ 
      messages, 
      contextUsername: ctx.username 
    });

    // ── 4. Persist messages in parallel ──────────────────────────────────────
    // Fields shared by both records
    const base = {
      userId: user.id,
      channelId: ctx.channelId,
      guildId: ctx.guildId,
      model: completion.model,
    } as const;

    try {
      await Promise.all([
        chatRepository.create({
          ...base,
          role: "user",
          content: ctx.content,
          tokens: completion.usage.promptTokens,
        }),
        chatRepository.create({
          ...base,
          role: "assistant",
          content: completion.content,
          tokens: completion.usage.completionTokens,
        }),
      ]);
    } catch (error) {
      // Persistence failure must not break the reply — log and continue
      handleError(error, "ChatService.persistMessages");
    }

    // ── 5. Increment Msg Count and trigger summary if needed ─────────────────
    try {
      const updatedUser = await userRepository.incrementMsgCount(user.discordId);
      if (updatedUser.msgCountSinceSummary >= 10) {
        // Trigger background summary (do not await)
        summaryService.summarizeUser(user.discordId, user.summary).catch((err) => {
          svcLogger.error("Background summary failed", { error: err });
        });
      }
    } catch (error) {
      handleError(error, "ChatService.incrementMsgCount");
    }

    svcLogger.info("Message processed", {
      userId: user.id,
      totalTokens: completion.usage.totalTokens,
      model: completion.model,
    });

    return {
      reply: completion.content,
      tokensUsed: completion.usage.totalTokens,
      model: completion.model,
    };
  }
}

export const chatService = new ChatService();
