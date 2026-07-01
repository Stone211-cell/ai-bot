import { Events, Interaction } from "discord.js";
import type { BotEvent } from "../../types/index.js";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { voiceService } from "../../services/voiceService.js";
import type { GuildMember } from "discord.js";

const eventLogger = logger.child("InteractionCreateEvent");

export const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  once: false,

  async execute(...args: unknown[]): Promise<void> {
    const interaction = args[0] as Interaction;

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const guild = interaction.guild;
    
    let member = guild?.members.cache.get(interaction.user.id);
    if (!member && guild) {
      member = await guild.members.fetch(interaction.user.id).catch(() => undefined);
    }
    
    const voiceChannel = member?.voice?.channel;

    // Check Voice Channel Filters
    if (voiceChannel) {
      if (config.discord.allowedVoiceChannelIds.length > 0 && !config.discord.allowedVoiceChannelIds.includes(voiceChannel.id)) {
        await interaction.reply({ content: "❌ ฉันไม่ได้รับอนุญาตให้เข้าห้องเสียงนี้ครับ!", ephemeral: true });
        return;
      }
      if (config.discord.ignoredVoiceChannelIds.includes(voiceChannel.id)) {
        await interaction.reply({ content: "❌ ฉันถูกแบนไม่ให้เข้าห้องเสียงนี้ครับ!", ephemeral: true });
        return;
      }
    }

    try {
      if (commandName === "joinmom" || commandName === "talkmom") {
        if (!voiceChannel) {
          await interaction.reply({ content: "❌ คุณต้องอยู่ในช่องเสียงก่อนถึงจะเรียกฉันได้นะ!", ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        
        voiceService.setMode("talk");
        voiceService.join(voiceChannel, interaction.channelId);
        
        await interaction.deleteReply();
        
        // ให้ AI สร้างคำทักทายตอนเข้าห้องผ่านระบบเสียงแทน (ถ้าเปิดไมค์)
        const isCreator = interaction.user.username.toLowerCase() === "bibi.ubu";
        if (isCreator) {
          voiceService.speak("สวัสดีครับท่านบอส ผมมารายงานตัวแล้วครับ");
        } else {
          // สุ่มพูดทักทาย
          const greetings = ["หวัดดีทุกคน", "เข้ามาละ", "มีใครอยู่ป่าว", "มาแล้วๆ ว่าไง"];
          voiceService.speak(greetings[Math.floor(Math.random() * greetings.length)]);
        }
      } 
      
      else if (commandName === "readmom") {
        if (!voiceChannel) {
          await interaction.reply({ content: "คุณต้องอยู่ในห้องเสียงก่อนนะ", ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        
        voiceService.setMode("read");
        voiceService.join(voiceChannel, interaction.channelId);
        
        await interaction.deleteReply();
        voiceService.speak("โหมดอ่านข้อความทำงานแล้ว พิมพ์อะไรมาเดี๋ยวอ่านให้ฟัง");
      } 
      
      else if (commandName === "leavemom") {
        await interaction.deferReply({ ephemeral: true });
        voiceService.leave();
        await interaction.deleteReply();
      }
    } catch (error) {
      eventLogger.error("Failed to execute slash command", { error });
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ เกิดข้อผิดพลาดขณะรันคำสั่ง!", ephemeral: true });
      }
    }
  },
};
