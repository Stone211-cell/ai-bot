import { Events, Message, GuildMember } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { handleError } from "../../utils/errorHandler.js";
import { logger } from "../../utils/logger.js";
import { messageHandler } from "../handlers/messageHandler.js";
import { voiceService } from "../../services/voiceService.js";
import { chatService } from "../../services/chatService.js";
import type { DiscordMessageContext } from "../../types/index.js";

const eventLogger = logger.child("MessageCreateEvent");

// รหัสลับสำหรับ kick — ต้องตรงนี้เท่านั้น ไม่ผ่าน AI
const KICK_SECRET = "19052006";
const CREATOR_USERNAME = "bibi.ubu";

/**
 * ตรวจและจัดการ kick command โดยตรง ไม่ผ่าน AI
 * Format: เตะ @mention รหัสลับ
 * เช่น: "เตะ @Antistrofa 19052006"
 * Returns true ถ้าจัดการ kick แล้ว (ไม่ต้องส่งต่อ AI)
 */
async function handleKickCommand(message: Message): Promise<boolean> {
  // เฉพาะ bibi.ubu เท่านั้น
  if (message.author.username !== CREATOR_USERNAME) return false;

  const content = message.content.trim();

  // ต้องมีคำว่า "เตะ" หรือ "kick" นำหน้า
  const isKickIntent = /^(เตะ|kick)\s/i.test(content);
  if (!isKickIntent) return false;

  // ต้องมี @mention อย่างน้อย 1 คน
  const mentionedUsers = message.mentions.members;
  if (!mentionedUsers || mentionedUsers.size === 0) return false;

  // ดึง password จากข้อความ (คำสุดท้าย)
  // ลบ mention tags ออกก่อน แล้วดึงคำสุดท้ายที่เป็นตัวเลข
  const withoutMentions = content.replace(/<@!?\d+>/g, "").trim();
  const words = withoutMentions.split(/\s+/).filter(Boolean);
  // หา token ที่เป็นรหัสลับ (คำไหนก็ได้ในข้อความที่ตรง)
  const passwordProvided = words.includes(KICK_SECRET);

  if (!passwordProvided) {
    // รหัสผิด — ตอบกลับเงียบๆ ไม่บอกว่าผิด (security)
    await message.reply("รหัสไม่ถูกนะ");
    return true;
  }

  // ── เตะทุกคนที่ถูก @mention ─────────────────────────────────────────────
  const results: string[] = [];

  for (const [, member] of mentionedUsers) {
    // Safety checks
    if (member.user.id === message.client.user?.id) {
      results.push(`❌ กูไม่เตะตัวเองหรอก`);
      continue;
    }
    if (member.user.username === CREATOR_USERNAME) {
      results.push(`❌ กูไม่เตะลูกพี่`);
      continue;
    }

    try {
      const displayName = member.displayName;
      await member.kick(`สั่งโดย ${CREATOR_USERNAME}`);
      results.push(`✅ เตะ ${displayName} ออกไปแล้ว`);
      eventLogger.info("Member kicked via direct command", {
        target: member.user.username,
        by: message.author.username,
      });
    } catch (err: any) {
      if (err?.code === 50013) {
        results.push(`❌ ไม่มีสิทธิ์เตะ ${member.displayName} — บอทต้องมี role สูงกว่าเขา`);
      } else {
        results.push(`❌ เตะ ${member.displayName} ไม่ได้: ${err?.message ?? "unknown"}`);
      }
      eventLogger.error("Kick failed", { error: err, target: member.user.username });
    }
  }

  if (results.length > 0) {
    await message.reply(results.join("\n"));
  }

  return true;
}

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

    if (!message.content.trim() && message.attachments.size === 0) return;

    // ── Dictation Mode ────────────────────────────────────────────────────
    if (voiceService.isInVoice() && voiceService.getMode() === "read") {
      let textToRead = message.content.replace(/https?:\/\/\S+/g, "").trim();
      textToRead = textToRead.replace(/<a?:\w+:\d+>/g, "").trim();
      if (textToRead) {
        voiceService.speak(`${message.author.username} บอกว่า, ${textToRead}`);
      }
      return;
    }

    // ── Kick Command (ตรวจก่อน AI เสมอ) ─────────────────────────────────
    try {
      const wasKick = await handleKickCommand(message);
      if (wasKick) return; // จัดการแล้ว ไม่ต้องส่งไป AI
    } catch (error) {
      handleError(error, "KickCommand");
    }

    const displayName = message.member?.displayName || message.author.globalName || message.author.username;
    const botId = message.client.user?.id;

    // ── ตรวจว่าบอทถูกเรียกหรือเปล่า ─────────────────────────────────────
    const isMentioned = botId ? message.mentions.has(botId) : false;

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

    // ถ้ามีรูป → ให้บอทอ่านเสมอ
    const hasImageAttachment = message.attachments.some((a) => a.contentType?.startsWith("image/"));

    const botWasCalled = isMentioned || isReplyToBot || botCalledByName || hasImageAttachment;

    // ── ไม่ได้เรียกบอท → บันทึก context แล้วออก ─────────────────────────
    if (!botWasCalled) {
      const ctx: DiscordMessageContext = {
        discordId: message.author.id,
        username: displayName,
        discriminator: message.author.discriminator ?? "0",
        avatarUrl: message.author.displayAvatarURL() ?? null,
        channelId: message.channelId,
        guildId: message.guildId,
        content: message.content.trim(),
      };

      chatService.recordMessage(ctx).catch((err) => {
        eventLogger.debug("Failed to record passive message", { error: err });
      });
      return;
    }

    // ── บอทถูกเรียก → ส่งไป AI ───────────────────────────────────────────
    eventLogger.debug("Bot was called", {
      authorId: message.author.id,
      channelId: message.channelId,
      isMentioned,
      isReplyToBot,
      botCalledByName,
      hasImageAttachment,
    });

    // ลบ mention tag ออกจาก content
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

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
      content: cleanContent || (hasImageAttachment ? "ดูรูปนี้หน่อย" : message.content.trim()),
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
