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

function inferAffinityDelta(text: string): number {
  const normalized = text.toLowerCase();
  const positiveWords = ["ชอบ", "รัก", "ขอบคุณ", "ดี", "เก่ง", "น่ารัก", "หล่อ", "เยี่ยม", "สวัสดี", "โอเค", "ปลื้ม", "ชื่นชม", "ขำ"];
  const negativeWords = ["เกลียด", "ไม่ชอบ", "แย่", "ห่วย", "บอท", "ai", "โปรแกรม", "โง่", "ด่า", "รำคาญ", "เบื่อ"];

  const positiveMatches = positiveWords.filter((word) => normalized.includes(word)).length;
  const negativeMatches = negativeWords.filter((word) => normalized.includes(word)).length;

  if (positiveMatches > 0 && negativeMatches > 0) return 0;
  if (positiveMatches > 0) return 3;
  if (negativeMatches > 0) return -3;
  return 0;
}

function inferRelationshipStatus(affinity: number): string | null {
  if (affinity >= 20) return "love";
  if (affinity <= -20) return "hate";
  return "neutral";
}

export interface IChatService {
  processMessage(ctx: DiscordMessageContext): Promise<ProcessMessageResult>;
  recordMessage(ctx: DiscordMessageContext): Promise<void>;
}

export class ChatService implements IChatService {

  /**
   * บันทึกข้อความของ user ลง DB เฉยๆ โดยไม่เรียก AI
   * ใช้สำหรับข้อความที่คนคุยกันเองไม่ได้เรียกบอท
   * เพื่อให้บอทมี context ของ channel เวลาถูกเรียก
   */
  async recordMessage(ctx: DiscordMessageContext): Promise<void> {
    try {
      const user = await userRepository.upsert({
        discordId: ctx.discordId,
        username: ctx.username,
        discriminator: ctx.discriminator,
        avatarUrl: ctx.avatarUrl,
        isBot: false,
      });

      // เก็บข้อความจริงๆ (ไม่ใส่ prefix [ชื่อ] เพราะ chatService จะใส่ตอนดึง history)
      await chatRepository.create({
        userId: user.id,
        channelId: ctx.channelId,
        guildId: ctx.guildId,
        role: "user",
        content: ctx.content,
        tokens: null,
        model: null,
      });

      svcLogger.debug("Recorded message (no AI call)", {
        discordId: ctx.discordId,
        channelId: ctx.channelId,
      });
    } catch (error) {
      handleError(error, "ChatService.recordMessage");
    }
  }

  /**
   * Main pipeline — เรียกเมื่อบอทถูก mention หรือ reply โดยตรง:
   * 1. Upsert Discord user in DB
   * 2. ดึง channel history ทั้งหมด (เห็นบทสนทนาของทุกคน)
   * 3. Build prompt
   * 4. Call Gemini
   * 5. Persist messages
   */
  async processMessage(ctx: DiscordMessageContext): Promise<ProcessMessageResult> {
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

    // ── 2. Fetch Channel History ─────────────────────────────────────────────
    // ดึง history ระดับ channel ทั้งหมด เพื่อให้บอทเห็น conversation ของทุกคน
    const rawHistory = await chatRepository.findByChannelId(
      ctx.channelId,
      config.gemini.maxHistory,
    );

    // Prisma returns desc (newest first) → reverse to asc (oldest first)
    // โหลด username สำหรับแต่ละ userId (cache ไม่ query ซ้ำ)
    const userCache = new Map<string, string>();
    const historyMessages: ChatMessage[] = [];

    for (const msg of rawHistory.reverse()) {
      let senderName: string;

      if (msg.role === "assistant") {
        senderName = "ไมเคิล";
      } else {
        if (!userCache.has(msg.userId)) {
          const u = await userRepository.findById(msg.userId);
          userCache.set(msg.userId, u?.username ?? "someone");
        }
        senderName = userCache.get(msg.userId) ?? "someone";
      }

      historyMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        // ใส่ชื่อผู้ส่งเพื่อให้ AI รู้ว่าใครพูดอะไร
        content: msg.role === "assistant"
          ? msg.content
          : `[${senderName}]: ${msg.content}`,
      });
    }

    // ── 3. Build prompt ─────────────────────────────────────────────────────
    const globalKnowledge = await knowledgeRepository.getAllFacts();
    const relationshipHighlights = await userRepository.getRelationshipHighlights();

    const systemPrompt = buildSystemPrompt({
      username: ctx.username,
      summary: user.summary,
      globalKnowledge,
      favoriteUsers: relationshipHighlights.favoriteUsers,
      dislikedUsers: relationshipHighlights.dislikedUsers,
    });

    // content ที่ส่งถึง AI คือข้อความของ current sender (ไม่ต้องใส่ prefix เพราะ AI รู้อยู่แล้วจาก systemPrompt)
    const messages = buildMessages(systemPrompt, ctx.content, historyMessages, ctx.imageParts);

    // ── 4. Call Gemini ────────────────────────────────────────────────────────
    const completion = await geminiService.chat({
      messages,
      contextUsername: ctx.username,
      guildId: ctx.guildId,  // ส่งไปให้ AI tools ใช้ (เช่น kick_member)
    });

    // ── 5. Update affinity ───────────────────────────────────────────────────
    try {
      const affinityDelta = inferAffinityDelta(ctx.content);
      if (affinityDelta !== 0) {
        await userRepository.updateAffinity(
          user.discordId,
          affinityDelta,
          inferRelationshipStatus((user.affinity ?? 0) + affinityDelta),
        );
      }
    } catch (error) {
      handleError(error, "ChatService.updateAffinity");
    }

    // ── 6. Persist messages ───────────────────────────────────────────────────
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
      handleError(error, "ChatService.persistMessages");
    }

    // ── 7. Increment Msg Count & trigger summary ─────────────────────────────
    try {
      const updatedUser = await userRepository.incrementMsgCount(user.discordId);
      if (updatedUser.msgCountSinceSummary >= 10) {
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
