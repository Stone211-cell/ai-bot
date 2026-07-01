import { Events, Message } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { handleError } from "../../utils/errorHandler.js";
import { logger } from "../../utils/logger.js";
import { messageHandler } from "../handlers/messageHandler.js";
import { voiceService } from "../../services/voiceService.js";
import { chatService } from "../../services/chatService.js";
import type { DiscordMessageContext } from "../../types/index.js";

const eventLogger = logger.child("MessageCreateEvent");

export const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const message = args[0] as Message;

    // ── Guards ─────────────────────────────────────────────────────────────
    if (message.author.bot) return;
    if (!message.guild) return;

    // ── Channel filter ────────────────────────────────────────────────────
    if (
      config.discord.allowedTextChannelIds.length > 0 &&
      !config.discord.allowedTextChannelIds.includes(message.channelId)
    ) return;

    if (config.discord.ignoredTextChannelIds.includes(message.channelId)) return;

    if (!message.content.trim()) return;

    // ── Dictation Mode Hook ──────────────────────────────────────────────────
    if (voiceService.isInVoice() && voiceService.getMode() === "read") {
      let textToRead = message.content.replace(/https?:\/\/\S+/g, "").trim();
      textToRead = textToRead.replace(/<a?:\w+:\d+>/g, "").trim();
      if (textToRead) {
        voiceService.speak(`${message.author.username} บอกว่า, ${textToRead}`);
      }
      return;
    }

    const displayName = message.member?.displayName || message.author.globalName || message.author.username;
    const botId = message.client.user?.id;

    // ── ตรวจว่าบอทถูกเรียกหรือเปล่า ─────────────────────────────────────────
    const isMentioned = botId ? message.mentions.has(botId) : false;

    // ตรวจว่า reply มาที่บอทโดยตรง
    let isReplyToBot = false;
    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = refMsg.author.id === botId;
      } catch {
        // ถ้า fetch ไม่ได้ ถือว่าไม่ได้ reply บอท
      }
    }

    const botCalledByName = /ไมเคิล|michael|มค|บอท/.test(message.content.toLowerCase());

    const botWasCalled = isMentioned || isReplyToBot || botCalledByName;

    // ── ถ้าไม่ได้เรียกบอท → บันทึก context แล้วออก ─────────────────────────
    if (!botWasCalled) {
      // บันทึกข้อความลง DB เพื่อเป็น context ให้บอทตอนถูกเรียกในภายหลัง
      const ctx: DiscordMessageContext = {
        discordId: message.author.id,
        username: displayName,
        discriminator: message.author.discriminator ?? "0",
        avatarUrl: message.author.displayAvatarURL() ?? null,
        channelId: message.channelId,
        guildId: message.guildId,
        content: message.content.trim(),
      };

      // บันทึก background ไม่ต้อง await
      chatService.recordMessage(ctx).catch((err) => {
        eventLogger.debug("Failed to record passive message", { error: err });
      });
      return;
    }

    // ── บอทถูกเรียก → ส่งไป AI ─────────────────────────────────────────────
    eventLogger.debug("Bot was called", {
      authorId: message.author.id,
      channelId: message.channelId,
      isMentioned,
      isReplyToBot,
      botCalledByName,
    });

    // ลบ mention ออกจาก content เพื่อให้ AI ไม่เห็น <@123456789>
    const cleanContent = message.content
      .replace(/<@!?\d+>/g, "")
      .trim();

    const imageParts: { data: string; mimeType: string }[] = [];
    for (const attachment of message.attachments.values()) {
      if (attachment.contentType?.startsWith("image/")) {
        try {
          const res = await fetch(attachment.url);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          imageParts.push({
            data: buffer.toString("base64"),
            mimeType: attachment.contentType,
          });
        } catch (error) {
          eventLogger.error("Failed to download attachment", { error });
        }
      }
    }

    const ctx: DiscordMessageContext = {
      discordId: message.author.id,
      username: displayName,
      discriminator: message.author.discriminator ?? "0",
      avatarUrl: message.author.displayAvatarURL() ?? null,
      channelId: message.channelId,
      guildId: message.guildId,
      content: cleanContent || message.content.trim(), // fallback ถ้า clean แล้วว่าง
      imageParts: imageParts.length > 0 ? imageParts : undefined,
    };

    try {
      await messageHandler.handle(message, ctx);
    } catch (error) {
      handleError(error, "MessageCreateEvent");
      try {
        await message.reply("❌ เกิด error ขึ้น ลองใหม่นะ");
      } catch {
        eventLogger.warn("Could not send error reply to user");
      }
    }
  },
};
