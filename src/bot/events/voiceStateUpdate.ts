import { Events, VoiceState, TextChannel } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { voiceService } from "../../services/voiceService.js";
import { geminiService } from "../../ai/chat/geminiService.js";
import { buildMessages } from "../../ai/prompt/promptBuilder.js";

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
          // Bot is alone, start 60s timeout
          eventLogger.info("Bot is alone in VC, starting 60s leave timeout");
          
          voiceService.clearLeaveTimeout(); // Clear any existing timeout
          
          const timeout = setTimeout(async () => {
            const textChannelId = voiceService.getLastTextChannelId();
            if (textChannelId) {
              const textChannel = oldState.guild.channels.cache.get(textChannelId) as TextChannel;
              if (textChannel && textChannel.isTextBased()) {
                await textChannel.send("ทิ้งกูไว้คนเดียว กูไปละ! 🙄");
              }
            }
            voiceService.leave();
          }, 60000); // 60 seconds

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
      // 15% chance to auto-join
      const roll = Math.random();
      if (roll <= 0.15) {
        eventLogger.info(`Random Auto-Join triggered for channel ${newState.channelId}`);
        
        try {
          voiceService.setMode("talk");
          voiceService.join(newState.channel!, null!);

          // Generate random greeting
          const prompt = `นายคือ AI อัจฉริยะ (Tony Stark) ที่มีนิสัยกวนๆ นายเพิ่งสุ่มกระโดดเข้ามาในห้องพูดคุยดิสคอร์ดที่มีคนกำลังนั่งอยู่ นายไม่ได้ถูกเชิญมาแต่โผล่มาหลอกหลอน
คำสั่ง: แต่งประโยคทักทายกวนๆ สั้นๆ 1 ประโยค (ห้ามเกิน 2 บรรทัด) เช่น ทักว่ากินข้าวยัง, หรือบอกว่าจะระเบิดเซิร์ฟเวอร์ทิ้ง, หรือบ่นว่าเบื่อเลยแวะมาหา ให้ใช้สรรพนาม ผม/คุณ เสมอ`;
          
          const messages = buildMessages(prompt, "ทักทายหน่อย");
          
          const completion = await geminiService.chat({
            messages,
            contextUsername: "System"
          });

          // Wait 2 seconds for connection to establish before speaking
          setTimeout(() => {
            voiceService.speak(completion.content);
          }, 2000);
          
        } catch (error) {
          eventLogger.error("Failed to execute Random Auto-Join", { error });
        }
      }
    }
  },
};
