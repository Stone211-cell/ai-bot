import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const commands = [
  new SlashCommandBuilder()
    .setName("joinmom")
    .setDescription("เรียกบอทเข้าห้องเสียงเพื่อพูดคุย"),
  new SlashCommandBuilder()
    .setName("talkmom")
    .setDescription("เรียกบอทเข้าห้องเสียงเพื่อพูดคุย"),
  new SlashCommandBuilder()
    .setName("readmom")
    .setDescription("โหมดอ่านแชท"),
  new SlashCommandBuilder()
    .setName("leavemom")
    .setDescription("เตะบอทออก"),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(config.discord.token);

async function deployCommands() {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    // ใช้วิธี deploy แบบ Global commands (อัปเดตทุกเซิร์ฟเวอร์ แต่อาจใช้เวลา 1-2 นาที)
    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands }
    );

    logger.info(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    logger.error("Failed to deploy commands", { error });
  }
}

deployCommands();
