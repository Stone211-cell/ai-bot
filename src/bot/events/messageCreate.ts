import { Events, Message, GuildMember } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { handleError } from "../../utils/errorHandler.js";
import { logger } from "../../utils/logger.js";
import { messageHandler } from "../handlers/messageHandler.js";
import { voiceService } from "../../services/voiceService.js";
import { chatService } from "../../services/chatService.js";
import type { DiscordMessageContext } from "../../types/index.js";
import { antiSpam } from "../../utils/antiSpam.js";

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
/**
 * ตรวจและจัดการคำสั่งแอดมินสำหรับผู้สร้าง (bibi.ubu) โดยตรง ไม่ผ่าน AI
 * ลบข้อความที่สั่งทันทีเพื่อไม่ให้คนอื่นเห็นรหัสผ่าน
 * Returns true ถ้าจัดการคำสั่งแล้ว
 */
async function handleAdminCommands(message: Message): Promise<boolean> {
  // เฉพาะ bibi.ubu เท่านั้น
  if (message.author.username !== CREATOR_USERNAME) return false;

  const content = message.content.trim();

  // ต้องมีรหัสลับนำหน้าหรือมีอยู่ในข้อความ
  if (!content.includes(KICK_SECRET)) return false;

  // พยายามลบข้อความต้นทางทันทีเพื่อป้องกันคนอื่นเห็นรหัสผ่าน
  try {
    if (message.deletable) {
      await message.delete();
    }
  } catch (err) {
    eventLogger.warn("Failed to delete creator command message (missing Manage Messages permission?)", { error: err });
  }

  const channel = message.channel as any;

  // 1. คำสั่งลบช่อง (Delete current channel)
  // Format: "ลบช่อง 19052006"
  if (/^ลบช่อง\s+/i.test(content)) {
    try {
      eventLogger.info(`Channel ${message.channelId} is being deleted by ${message.author.username}`);
      await channel.send("กำลังลบช่องนี้ตามคำสั่งเจ้านาย...");
      
      // หน่วงเวลาเล็กน้อยเพื่อให้ส่งข้อความตอบกลับเสร็จก่อนลบช่องจริง
      setTimeout(async () => {
        try {
          await message.channel.delete(`สั่งโดยผู้สร้าง ${CREATOR_USERNAME}`);
        } catch (err: any) {
          eventLogger.error("Failed to delete channel", { error: err });
        }
      }, 1000);
      return true;
    } catch (err: any) {
      eventLogger.error("Delete channel failed", { error: err });
      return true;
    }
  }

  // 2. คำสั่งออกเซิร์ฟเวอร์/ลบดิส (Leave Guild)
  // Format: "ออกดิส 19052006" หรือ "ลบดิส 19052006"
  if (/^(ออกดิส|ลบดิส)\s+/i.test(content)) {
    if (!message.guild) return false;
    try {
      eventLogger.info(`Leaving guild ${message.guild.name} (${message.guildId}) by ${message.author.username}`);
      await channel.send("ลาก่อนครับเจ้านาย...");
      
      const guild = message.guild;
      // หน่วงเวลาเล็กน้อยเพื่อให้ส่งข้อความเสร็จก่อนออก
      setTimeout(async () => {
        try {
          await guild.leave();
        } catch (err: any) {
          eventLogger.error("Failed to leave guild", { error: err });
        }
      }, 1000);
      return true;
    } catch (err: any) {
      eventLogger.error("Leave guild failed", { error: err });
      return true;
    }
  }

  // 3. คำสั่งเตะสมาชิก (Kick)
  // Format: "เตะ @user 19052006"
  if (/^(เตะ|kick)\s/i.test(content)) {
    const mentionedUsers = message.mentions.members;
    if (!mentionedUsers || mentionedUsers.size === 0) return false;

    const results: string[] = [];
    for (const [, member] of mentionedUsers) {
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
      }
    }
    if (results.length > 0) {
      await channel.send(results.join("\n"));
    }
    return true;
  }

  // 4. คำสั่งสแปมข้อความ (Spam)
  // Format: "สั่งสแปม <จำนวนครั้ง> <ข้อความ> 19052006"
  if (/^(สั่งสแปม|spam)\s+/i.test(content)) {
    const withoutSecret = content.replace(KICK_SECRET, "").trim();
    // ดึงตัวเลขและข้อความที่ต้องการสแปม
    const match = withoutSecret.match(/^(สั่งสแปม|spam)\s*(\d+)\s*(.+)$/i);
    if (!match) {
      await channel.send("รูปแบบไม่ถูกครับเจ้านาย ต้องเป็น: สั่งสแปม <จำนวนครั้ง> <ข้อความ> รหัสลับ");
      return true;
    }

    const count = Math.min(20, parseInt(match[2]!, 10)); // จำกัดสูงสุด 20 ครั้ง
    const spamText = match[3]!.trim();

    if (count <= 0 || !spamText) {
      await channel.send("ระบุจำนวนครั้งหรือข้อความไม่ถูกต้อง");
      return true;
    }

    eventLogger.info(`Spamming ${count} times by ${message.author.username}`);
    
    const spamPromises = [];
    for (let i = 0; i < count; i++) {
      spamPromises.push(
        channel.send(spamText).catch((err: any) => {
          eventLogger.error("Failed to send spam message", { error: err });
        })
      );
    }
    await Promise.all(spamPromises);
    
    return true;
  }

  return false;
}

export const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const message = args[0] as Message;

    // ── Guards ─────────────────────────────────────────────────────────────
    if (message.author.bot) return;
    if (!message.guild) {
      eventLogger.debug(`Ignored message from ${message.author.username}: Not in a guild (DM)`);
      return;
    }

    // ── Dictation Mode ────────────────────────────────────────────────────
    if (voiceService.isInVoice() && voiceService.getMode() === "read") {
      // อ่านข้อความถ้ามาจากห้องที่เรียกคำสั่ง หรือห้องที่อยู่ใน ALLOWED_TEXT_CHANNEL_IDS
      const isAllowedChannel = config.discord.allowedTextChannelIds.length === 0 || config.discord.allowedTextChannelIds.includes(message.channelId);
      if (message.channelId === voiceService.getLastTextChannelId() || isAllowedChannel) {
        let textToRead = message.content.replace(/https?:\/\/\S+/g, "").trim();
        textToRead = textToRead.replace(/<a?:\w+:\d+>/g, "").trim();
        
        // ถ้าข้อความว่างเปล่า อาจเกิดจากไม่ได้เปิด Message Content Intent
        if (textToRead) {
          const displayName = message.member?.displayName || message.author.globalName || message.author.username;
          voiceService.speak(`${displayName} บอกว่า ${textToRead}`);
        } else if (message.attachments.size === 0) {
          eventLogger.warn("Received empty message content. Message Content Intent might be disabled in Discord Developer Portal!");
        }
        return;
      }
    }

    // ── Channel filter ────────────────────────────────────────────────────
    if (
      config.discord.allowedTextChannelIds.length > 0 &&
      !config.discord.allowedTextChannelIds.includes(message.channelId)
    ) {
      eventLogger.debug(`Ignored message from ${message.author.username} in channel ${message.channelId}: Channel not in ALLOWED_TEXT_CHANNEL_IDS`);
      return;
    }

    if (config.discord.ignoredTextChannelIds.includes(message.channelId)) {
      eventLogger.debug(`Ignored message from ${message.author.username} in channel ${message.channelId}: Channel is in IGNORED_TEXT_CHANNEL_IDS`);
      return;
    }

    if (!message.content.trim() && message.attachments.size === 0) {
      eventLogger.debug(`Ignored empty message from ${message.author.username} in channel ${message.channelId}`);
      return;
    }

    // ── Creator Admin Commands (ตรวจสอบก่อนเสมอและซ่อนข้อความทันที) ────────
    try {
      const wasAdminCmd = await handleAdminCommands(message);
      if (wasAdminCmd) return;
    } catch (error) {
      handleError(error, "AdminCommands");
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

    // ลบ mention tag ออกจาก content และดูว่ามีรูปไหม
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();
    const hasImageAttachment = message.attachments.some((a) => a.contentType?.startsWith("image/"));

    // ถ้าโดนแท็ก (Mention) หรือตอบกลับบอท (Reply) ถือเป็นการเรียกตรง
    const isDirectCall = isMentioned || isReplyToBot;

    // ── Anti-Spam (Content Filter) ────────────────────────────────────────
    // ถ้าเป็นการเรียกตรง หรือมีรูปภาพ ไม่ต้องเช็คสแปม
    if (!isDirectCall && antiSpam.isSpammyContent(cleanContent) && !hasImageAttachment) {
      eventLogger.debug(`Ignored spammy/meaningless message from ${message.author.username}`);
      return;
    }

    // ── Rate Limiting (Cooldown) ──────────────────────────────────────────
    // ถ้าเป็นการเรียกตรง จะข้ามระบบคูลดาวน์ เพื่อรับประกันว่าบอทต้องตอบกลับผู้ใช้แน่นอน
    if (!isDirectCall) {
      const rateLimitStatus = antiSpam.checkRateLimit(message.author.id);
      if (rateLimitStatus === "ignored") return;
      if (rateLimitStatus === "warn") {
        try {
          await message.reply("ใจเย็นๆ สิวะ! มึงส่งข้อความรัวเกินไปละ กูตอบไม่ทัน ขอพัก 30 วิ (Cooldown)");
        } catch {
          eventLogger.warn("Could not send rate limit warning reply");
        }
        return;
      }
    }



    // เตะปกติถูกย้ายไปรวมใน handleAdminCommands แล้ว

    // hasImageAttachment ถูกประกาศไว้ตอนต้นของ execute() แล้ว

    const botWasCalled = true; // บังคับให้เป็น true เพื่อให้บอทประมวลผลทุกข้อความตามที่ user ต้องการ
    // ── บอทถูกเรียก → ส่งไป AI ───────────────────────────────────────────
    eventLogger.debug("Bot was called", {
      authorId: message.author.id,
      channelId: message.channelId,
      isMentioned,
      isReplyToBot,
      botCalledByName,
      hasImageAttachment,
    });

    // cleanContent ถูกประกาศไว้ตอนต้นของ execute() แล้ว

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
