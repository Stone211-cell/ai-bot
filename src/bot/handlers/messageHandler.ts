import type { Message, TextBasedChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { chatService } from "../../services/chatService.js";
import type { DiscordMessageContext } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

const handlerLogger = logger.child("MessageHandler");

/** Channels that support both sendTyping() and send(). */
interface SendableChannel {
  sendTyping(): Promise<void>;
  send(content: string): Promise<unknown>;
}

/**
 * PartialGroupDMChannel (type GroupDM) is the only TextBasedChannel
 * that lacks sendTyping / send. Narrow it out once and reuse the
 * typed reference for both the typing indicator and the send call.
 */
function asSendable(channel: TextBasedChannel): SendableChannel | null {
  if (channel.type === ChannelType.GroupDM) return null;
  return channel as unknown as SendableChannel;
}

const DISCORD_MAX_LENGTH = 2000;

export class MessageHandler {
  /**
   * Maps a raw Discord Message to a typed context and passes it
   * to the ChatService pipeline.
   */
  async handle(message: Message): Promise<void> {
    const sendable = asSendable(message.channel);

    if (!sendable) {
      handlerLogger.warn("Received message in GroupDM — skipping");
      return;
    }

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
          handlerLogger.error("Failed to download attachment", { error });
        }
      }
    }

    const ctx: DiscordMessageContext = {
      discordId: message.author.id,
      username: message.author.username,
      discriminator: message.author.discriminator ?? "0",
      avatarUrl: message.author.displayAvatarURL() ?? null,
      channelId: message.channelId,
      guildId: message.guildId,
      content: message.content.trim(),
      imageParts: imageParts.length > 0 ? imageParts : undefined,
    };

    handlerLogger.debug("Handling message context", {
      discordId: ctx.discordId,
      username: ctx.username,
      channelId: ctx.channelId,
    });

    await sendable.sendTyping();

    const result = await chatService.processMessage(ctx);

    if (result.reply.length <= DISCORD_MAX_LENGTH) {
      await message.reply(result.reply);
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

  /**
   * Splits a long string into chunks no larger than `maxLength`,
   * preferring to break at newline boundaries.
   */
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
