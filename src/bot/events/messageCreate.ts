import { Events, Message } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { handleError } from "../../utils/errorHandler.js";
import { logger } from "../../utils/logger.js";
import { messageHandler } from "../handlers/messageHandler.js";

const eventLogger = logger.child("MessageCreateEvent");

export const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const message = args[0] as Message;

    // ── Guards ─────────────────────────────────────────────────────────────
    // Ignore all bots (including itself)
    if (message.author.bot) return;

    // Ignore DMs
    if (!message.guild) {
      eventLogger.debug("Ignored DM message", {
        authorId: message.author.id,
      });
      return;
    }

    // ── Channel filter (whitelist) ────────────────────────────────────────────
    const { allowedChannelIds, ignoredChannelIds } = config.discord;

    if (allowedChannelIds.length > 0 && !allowedChannelIds.includes(message.channelId)) {
      eventLogger.debug("Ignored message — channel not in whitelist", {
        channelId: message.channelId,
      });
      return;
    }

    // ── Channel filter (blacklist) ────────────────────────────────────────────
    if (ignoredChannelIds.includes(message.channelId)) {
      eventLogger.debug("Ignored message — channel is blacklisted", {
        channelId: message.channelId,
      });
      return;
    }

    // Ignore empty messages
    if (!message.content.trim()) return;

    eventLogger.debug("Received message", {
      authorId: message.author.id,
      channelId: message.channelId,
      guildId: message.guildId,
      contentLength: message.content.length,
    });

    try {
      await messageHandler.handle(message);
    } catch (error) {
      handleError(error, "MessageCreateEvent");

      // Attempt to reply with a user-facing error message
      try {
        await message.reply(
          "❌ An error occurred while processing your message. Please try again.",
        );
      } catch {
        // If the reply itself fails, just log silently
        eventLogger.warn("Could not send error reply to user");
      }
    }
  },
};
