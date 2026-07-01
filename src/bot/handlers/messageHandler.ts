import type { Message, TextBasedChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { chatService } from "../../services/chatService.js";
import type { DiscordMessageContext } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { voiceService } from "../../services/voiceService.js";

const handlerLogger = logger.child("MessageHandler");

interface SendableChannel {
  sendTyping(): Promise<void>;
  send(content: string): Promise<unknown>;
}

function asSendable(channel: TextBasedChannel): SendableChannel | null {
  if (channel.type === ChannelType.GroupDM) return null;
  return channel as unknown as SendableChannel;
}

const DISCORD_MAX_LENGTH = 2000;

export class MessageHandler {
  /**
   * รับ ctx ที่สร้างแล้วจาก messageCreate.ts เพื่อประมวลผลโดย chatService
   * (ไม่ต้องสร้าง ctx อีกรอบ)
   */
  async handle(message: Message, ctx: DiscordMessageContext): Promise<void> {
    const sendable = asSendable(message.channel);

    if (!sendable) {
      handlerLogger.warn("Received message in GroupDM — skipping");
      return;
    }

    handlerLogger.debug("Handling message context", {
      discordId: ctx.discordId,
      username: ctx.username,
      channelId: ctx.channelId,
    });

    await sendable.sendTyping();

    const result = await chatService.processMessage(ctx);

    if (result.reply.includes("[IGNORE]")) {
      handlerLogger.debug("AI decided to ignore the message");
      return;
    }

    if (voiceService.isInVoice() && voiceService.getMode() === "talk") {
      voiceService.speak(result.reply);
      return; // ไม่ต้องส่งข้อความลงแชท
    }

    if (result.reply.length <= DISCORD_MAX_LENGTH) {
      await sendable.send(result.reply);
    } else {
      for (const chunk of this.chunkMessage(result.reply, DISCORD_MAX_LENGTH)) {
        await sendable.send(chunk);
      }
    }

    handlerLogger.debug("Reply sent", {
      tokensUsed: result.tokensUsed,
      model: result.model,
    });
  }

  private chunkMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let breakAt = remaining.lastIndexOf("\n", maxLength);
      if (breakAt === -1) breakAt = maxLength;

      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }

    return chunks;
  }
}

export const messageHandler = new MessageHandler();
