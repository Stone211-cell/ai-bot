import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { config } from './src/config/index.js';
import { messageHandler } from './src/bot/handlers/messageHandler.js';
import { connectDatabase, disconnectDatabase } from './src/database/prismaClient.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log('Logged in as', client.user?.tag);
  await connectDatabase();
  const channelId = '1522594478630633472';
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const textChannel = channel as TextChannel;
      
      const messages = await textChannel.messages.fetch({ limit: 1 });
      const lastMessage = messages.first();
      
      if (lastMessage) {
        console.log(`Mocking handle for message: ${lastMessage.content}`);
        const ctx = {
          discordId: "test",
          username: "tester",
          discriminator: "0",
          avatarUrl: null,
          channelId: textChannel.id,
          guildId: textChannel.guild.id,
          content: "ทดสอบ messageHandler.handle นะ",
          isVoice: false
        };
        await messageHandler.handle(lastMessage, ctx as any);
        console.log("Handle finished");
      } else {
        console.log("No messages in channel to mock");
      }
    }
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await disconnectDatabase();
    client.destroy();
  }
});

client.login(config.discord.token);
