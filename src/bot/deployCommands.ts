import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const commands = [
  new SlashCommandBuilder()
    .setName("joinmom")
    .setDescription("-"),
  new SlashCommandBuilder()
    .setName("talkmom")
    .setDescription("-"),
  new SlashCommandBuilder()
    .setName("readmom")
    .setDescription("-"),
  new SlashCommandBuilder()
    .setName("leavemom")
    .setDescription("-"),
  new SlashCommandBuilder()
    .setName("echomom")
    .setDescription("เข้าโหมดเครื่องแปลงเสียง (พูดแล้วบอทพูดตาม)"),
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
