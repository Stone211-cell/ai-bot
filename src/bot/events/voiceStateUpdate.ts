import { Events, VoiceState, TextChannel } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { voiceService } from "../../services/voiceService.js";
import { geminiService } from "../../ai/chat/geminiService.js";
import { buildMessages } from "../../ai/prompt/promptBuilder.js";
import { config } from "../../config/index.js";

const eventLogger = logger.child("VoiceStateUpdateEvent");

export const voiceStateUpdateEvent: BotEvent = {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const oldState = args[0] as VoiceState;
    const newState = args[1] as VoiceState;

    const botId = oldState.client.user?.id;
    if (!botId) return;

    const botVoiceChannel = oldState.guild.members.cache.get(botId)?.voice.channel;

    // ── 1. Auto-Leave Logic ────────────────────────────────────────────────
    if (botVoiceChannel) {
      // If someone left or moved from the bot's channel
      if (
        (oldState.channelId === botVoiceChannel.id && newState.channelId !== botVoiceChannel.id) ||
        (newState.channelId === botVoiceChannel.id)
      ) {
        // Count non-bot members in the channel
        const humanMembers = botVoiceChannel.members.filter((m) => !m.user.bot).size;

        if (humanMembers === 0) {
          // Bot is alone, start 5 mins timeout
          eventLogger.info("Bot is alone in VC, starting 5 mins leave timeout");
          
          voiceService.clearLeaveTimeout(); // Clear any existing timeout
          
          const timeout = setTimeout(async () => {
            voiceService.leave();
          }, 300000); // 5 minutes = 300000 ms

          voiceService.setLeaveTimeout(timeout);
        } else {
          // Humans are present, cancel leave timeout
          voiceService.clearLeaveTimeout();
        }
      }
    }

    // ── 2. Random Auto-Join Logic (Ghost Bot) ──────────────────────────────────
    // Only trigger if someone joined a channel (and it's a human)
    if (
      !oldState.channelId && 
      newState.channelId && 
      !newState.member?.user.bot &&
      !botVoiceChannel // Bot must not be in a voice channel already
    ) {
      // Check Voice Filters
      if (config.discord.allowedVoiceChannelIds.length > 0 && !config.discord.allowedVoiceChannelIds.includes(newState.channelId)) {
        return;
      }
      if (config.discord.ignoredVoiceChannelIds.includes(newState.channelId)) {
        return;
      }

      // 15% chance to auto-join
      const roll = Math.random();
      if (roll <= 0.15) {
        eventLogger.info(`Random Auto-Join triggered for channel ${newState.channelId}`);
        
        try {
          voiceService.setMode("talk");
          // await เพราะ join() เป็น async — รอให้ connection Ready ก่อน
          await voiceService.join(newState.channel!, newState.channelId);

          // Generate random greeting
          const prompt = `นายคือวัยรุ่นกวนๆ ชื่อไมเคิล เพิ่งสุ่มกระโดดเข้ามาในห้องเสียง Discord โดยไม่ถูกเชิญ
คำสั่ง: แต่งประโยคทักทายกวนๆ สั้นมาก 1 ประโยค ใช้ภาษาวัยรุ่น เช่น "มึงกินข้าวยัง", "เบื่อเลยมาหา", "โลนลีเลยโผล่มา" ห้ามเป็นทางการ ห้ามใช้ดอกจัน ห้ามยาวเกิน 1 บรรทัด`;

          const messages = buildMessages(prompt, "ทักทายหน่อย");

          const completion = await geminiService.chat({
            messages,
            contextUsername: "System"
          });

          // connection พร้อมแล้ว (join() รอไว้แล้ว) พูดได้เลย
          voiceService.speak(completion.content);

        } catch (error) {
          eventLogger.error("Failed to execute Random Auto-Join", { error });
        }
      }
    }
  },
};
