import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './src/config/index.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log('Logged in as', client.user?.tag);
  const channelId = '1522594478630633472';
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send('เทสๆ จากระบบครับ! (ตอนนี้เช็กแล้วว่าโค้ดล่าสุดขึ้น Git เรียบร้อยครับ)');
      console.log('Sent message successfully');
    } else {
      console.log('Channel not found or not text based');
    }
  } catch (error) {
    console.error('Error:', error);
  }
  client.destroy();
});

client.login(config.discord.token);
