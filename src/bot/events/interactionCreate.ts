import { Events, Interaction } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { voiceService } from "../../services/voiceService.js";

const eventLogger = logger.child("InteractionCreateEvent");

export const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const interaction = args[0] as Interaction;

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ── deferReply ทันที ก่อน async ใดๆ เพื่อไม่ให้ timeout (3 วินาที) ──
    const isVoiceCommand = ["joinmom", "talkmom", "readmom", "leavemom", "echomom"].includes(commandName);
    if (isVoiceCommand) {
      await interaction.deferReply({ ephemeral: true });
    }

    try {
      // Fetch voice channel หลัง defer แล้ว (ไม่มี timeout แล้ว)
      const guild = interaction.guild;
      let member = guild?.members.cache.get(interaction.user.id);
      if (!member && guild) {
        member = await guild.members.fetch(interaction.user.id).catch(() => undefined);
      }
      const voiceChannel = member?.voice?.channel;

      // Check Voice Channel Filters
      if (voiceChannel) {
        if (config.discord.allowedVoiceChannelIds.length > 0 && !config.discord.allowedVoiceChannelIds.includes(voiceChannel.id)) {
          await interaction.editReply({ content: "❌ ฉันไม่ได้รับอนุญาตให้เข้าห้องเสียงนี้ครับ!" });
          return;
        }
        if (config.discord.ignoredVoiceChannelIds.includes(voiceChannel.id)) {
          await interaction.editReply({ content: "❌ ฉันถูกแบนไม่ให้เข้าห้องเสียงนี้ครับ!" });
          return;
        }
      }

      if (commandName === "joinmom" || commandName === "talkmom") {
        if (!voiceChannel) {
          await interaction.editReply({ content: "❌ คุณต้องอยู่ในช่องเสียงก่อนถึงจะเรียกฉันได้นะ!" });
          return;
        }

        voiceService.setMode("talk");
        await voiceService.join(voiceChannel, interaction.channelId);

        await interaction.deleteReply();
        // เงียบๆ เข้ามาเลย ไม่ต้องทักทาย
      } 
      
      else if (commandName === "echomom") {
        if (!voiceChannel) {
          await interaction.editReply({ content: "❌ คุณต้องอยู่ในช่องเสียงก่อนถึงจะใช้โหมดแปลงเสียงได้นะ!" });
          return;
        }

        voiceService.setMode("echo");
        await voiceService.join(voiceChannel, interaction.channelId);

        await interaction.deleteReply();
      }
      
      else if (commandName === "readmom") {
        if (!voiceChannel) {
          await interaction.editReply({ content: "คุณต้องอยู่ในห้องเสียงก่อนนะ" });
          return;
        }

        voiceService.setMode("read");
        await voiceService.join(voiceChannel, interaction.channelId);

        await interaction.deleteReply();
        
        // ให้ AI สุ่มประโยคทักทายตอนถูกเชิญเข้าห้อง
        try {
          const prompt = `นายคือวัยรุ่นกวนๆ ชื่อไมเคิล เพิ่งถูกผู้ใช้ชื่อ ${interaction.user.username} เชิญเข้ามาในห้องเสียง
คำสั่ง: แต่งประโยคทักทายกวนๆ หรือชวนคุย สั้นมาก 1 ประโยค ใช้ภาษาวัยรุ่น ห้ามเป็นทางการ ห้ามใช้ดอกจัน ห้ามยาวเกิน 1 บรรทัด`;
          
          const geminiService = (await import("../../ai/chat/geminiService.js")).geminiService;
          const { buildMessages } = await import("../../ai/prompt/promptBuilder.js");
          const messages = buildMessages(prompt, [], "ทักทายหน่อย", "System");
          
          const completion = await geminiService.chat({
            messages,
            contextUsername: "System"
          });
          
          voiceService.speak(completion.content);
        } catch (err) {
          voiceService.speak("มาแล้ววัยรุ่น มีไรให้รับใช้");
        }
      } 
      
      else if (commandName === "leavemom") {
        voiceService.leave();
        await interaction.deleteReply();
      }
    } catch (error) {
      eventLogger.error("Failed to execute slash command", { error });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ เซิร์ฟเวอร์ไม่สามารถเชื่อมต่อห้องเสียงได้ (UDP Blocked/Timeout) โปรดลองใหม่" }).catch(() => {});
      }
    }
  },
};
