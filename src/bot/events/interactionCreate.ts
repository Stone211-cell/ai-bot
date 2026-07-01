import { Events, Interaction } from "discord.js";
import type { BotEvent } from "../../types/index.js";
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
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    try {
      if (commandName === "joinmom" || commandName === "talkmom") {
        if (!voiceChannel) {
          await interaction.reply({ content: "❌ คุณต้องอยู่ในช่องเสียงก่อนถึงจะเรียกฉันได้นะ!", ephemeral: true });
          return;
        }
        voiceService.setMode("talk");
        voiceService.join(voiceChannel);
        await interaction.reply("🤖 โหมด AI พูดคุย: ฉันจะคิดคำตอบและพูดคุยกับทุกคนอย่างเป็นธรรมชาติ!");
      } 
      
      else if (commandName === "readmom") {
        if (!voiceChannel) {
          await interaction.reply({ content: "❌ คุณต้องอยู่ในช่องเสียงก่อนถึงจะเรียกฉันได้นะ!", ephemeral: true });
          return;
        }
        voiceService.setMode("read");
        voiceService.join(voiceChannel);
        await interaction.reply("🎙️ โหมดอ่านข้อความ: พิมพ์อะไรมาฉันก็จะอ่านตามนั้นเป๊ะๆ (ไม่มี AI ตอบโต้)");
      } 
      
      else if (commandName === "leavemom") {
        voiceService.leave();
        await interaction.reply("👋 ไปละ บาย");
      }
    } catch (error) {
      eventLogger.error("Failed to execute slash command", { error });
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ เกิดข้อผิดพลาดขณะรันคำสั่ง!", ephemeral: true });
      }
    }
  },
};
