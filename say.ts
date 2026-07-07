import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './src/config/index.js';

const channelId = process.argv[2];
const messageContent = process.argv.slice(3).join(' ');

if (!channelId || !messageContent) {
  console.log('❌ วิธีใช้งาน: npx tsx say.ts <ไอดีห้องแชท> <ข้อความที่ต้องการพิมพ์>');
  console.log('ตัวอย่าง: npx tsx say.ts 123456789012345678 "สวัสดีครับทุกคน"');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`👻 สวมร่างบอทสำเร็จ: ${client.user?.tag}`);
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased() && 'send' in channel) {
      await (channel as any).send(messageContent);
      console.log('✅ ส่งข้อความสำเร็จ!');
    } else {
      console.log('❌ หาห้องแชทไม่เจอ หรือห้องนั้นพิมพ์ข้อความไม่ได้');
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
  client.destroy();
});

client.login(config.discord.token);
