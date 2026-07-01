import { Client, GatewayIntentBits, VoiceChannel } from "discord.js";
import { joinVoiceChannel, VoiceConnectionStatus, entersState, generateDependencyReport } from "@discordjs/voice";
import { config } from "dotenv";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");
config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.on("ready", async () => {
  console.log("Logged in as", client.user?.tag);
  console.log(generateDependencyReport());

  let targetChannel: VoiceChannel | undefined;
  for (const guild of client.guilds.cache.values()) {
    const channels = await guild.channels.fetch();
    targetChannel = channels.find(c => c.isVoiceBased()) as VoiceChannel;
    if (targetChannel) break;
  }

  if (!targetChannel) {
    console.error("No voice channel found to test.");
    process.exit(1);
  }

  console.log(`Attempting to join voice channel: ${targetChannel.name} (${targetChannel.id})`);

  const connection = joinVoiceChannel({
    channelId: targetChannel.id,
    guildId: targetChannel.guild.id,
    adapterCreator: targetChannel.guild.voiceAdapterCreator,
  });

  connection.on("stateChange", (oldState, newState) => {
    const oldNetworking = Reflect.get(oldState, "networking");
    const newNetworking = Reflect.get(newState, "networking");
    const networkStateChange = (oldNetworking && newNetworking) ? 
      `Network: ${Reflect.get(oldNetworking, "state")?.code} -> ${Reflect.get(newNetworking, "state")?.code}` : "";
    console.log(`State changed: ${oldState.status} -> ${newState.status} ${networkStateChange}`);
  });

  connection.on("debug", (msg) => console.log(`[DEBUG] ${msg}`));
  connection.on("error", (err) => console.error(`[ERROR]`, err));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    console.log("Successfully connected to voice!");
    process.exit(0);
  } catch (error) {
    console.error("Failed to connect:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
