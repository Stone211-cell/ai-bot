import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getClient } from "../bot/client.js";
import { TextChannel, AttachmentBuilder, VoiceChannel, MessageType } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  getVoiceConnection
} from "@discordjs/voice";
import { config } from "../config/index.js";
import { getAudioUrl } from "google-tts-api";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import ffmpegStatic from "ffmpeg-static";

export const dashboardRouter = Router();

// Global State สำหรับควบคุมโหมด
(global as any).disguiseMode = false;
(global as any).villainMode = false;

let spamIntervals: Record<string, NodeJS.Timeout> = {};

// ตั้งค่า Multer สำหรับอัปโหลดไฟล์ใน memory ก่อนส่งให้ Discord
const upload = multer({ storage: multer.memoryStorage() });
// อัปโหลดไฟล์เสียง (บันทึกเพื่อเล่นบน voice channel หรือส่งเข้าแชท)
const voiceUpload = multer({ dest: 'uploads/voice/' });

// ตรวจสอบโฟลเดอร์ uploads
if (!fs.existsSync('uploads/voice')) {
  fs.mkdirSync('uploads/voice', { recursive: true });
}

// Middleware สำหรับเช็ครหัสผ่าน
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const password = req.headers['x-password'] || req.query.password;
  const correctPassword = process.env.DASHBOARD_PASSWORD || "123456";
  if (password === correctPassword) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

dashboardRouter.use(requireAuth);

// ==========================================
// 1. CHAT & GUILD API
// ==========================================
dashboardRouter.get("/guilds", (req, res) => {
  const client = getClient();
  const guilds = client.guilds.cache.map(g => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL()
  }));
  res.json({ guilds });
});

dashboardRouter.get("/channels/:guildId", async (req, res) => {
  try {
    const client = getClient();
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });

    const channels = guild.channels.cache
      .filter(c => c.isTextBased() || c.isVoiceBased())
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.isTextBased() ? 'text' : 'voice'
      }));
    res.json({ channels });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.get("/messages/:channelId", async (req, res) => {
  try {
    const client = getClient();
    const channel = await client.channels.fetch(req.params.channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: "Channel not found or not text based" });
    }

    const messages = await (channel as TextChannel).messages.fetch({ limit: 50 });
    const formattedMessages = messages.map(m => ({
      id: m.id,
      content: m.content,
      author: {
        username: m.author.username,
        avatar: m.author.displayAvatarURL()
      },
      attachments: m.attachments.map(a => a.url),
      timestamp: m.createdTimestamp,
      isReply: m.reference ? m.reference.messageId : null
    })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    res.json({ messages: formattedMessages });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/send", upload.single("file"), async (req, res) => {
  try {
    const { channelId, content, replyTo } = req.body;
    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const sendOptions: any = {};
    if (content) sendOptions.content = content;
    
    if (replyTo) sendOptions.reply = { messageReference: replyTo };

    if (req.file) {
      const attachment = new AttachmentBuilder(req.file.buffer, { name: req.file.originalname });
      sendOptions.files = [attachment];
    }

    await (channel as TextChannel).send(sendOptions);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==========================================
// 2. VOICE API
// ==========================================
dashboardRouter.post("/voice/join", async (req, res) => {
  try {
    const { channelId } = req.body;
    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isVoiceBased()) return res.status(404).json({ error: "Voice channel not found" });

    joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/voice/leave", async (req, res) => {
  try {
    const { guildId } = req.body;
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Not in a voice channel" });
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.get("/voice/status/:guildId", (req, res) => {
  const connection = getVoiceConnection(req.params.guildId);
  res.json({ channelId: connection ? connection.joinConfig.channelId : null });
});

// Helper for pitch shifting
const pitchShift = (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // ลด pitch ลงเพื่อทำเสียงตัวร้าย (asetrate เปลี่ยน pitch และ speed, atempo ปรับ speed กลับ)
    const cmd = `"${ffmpegStatic}" -i "${inputPath}" -af "asetrate=48000*0.6,atempo=1/0.6" -y "${outputPath}"`;
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

dashboardRouter.post("/voice/play", voiceUpload.single("audio"), async (req, res) => {
  try {
    const { guildId } = req.body;
    const connection = getVoiceConnection(guildId);
    if (!connection) return res.status(400).json({ error: "Bot is not in a voice channel" });
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    let filePath = path.resolve(req.file.path);

    if ((global as any).villainMode) {
      const pitchedPath = filePath + '_pitched.webm';
      await pitchShift(filePath, pitchedPath);
      fs.unlink(filePath, () => {});
      filePath = pitchedPath;
    }

    const player = createAudioPlayer();
    const resource = createAudioResource(filePath);
    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => fs.unlink(filePath, () => {}));
    player.on('error', () => fs.unlink(filePath, () => {}));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ส่งไฟล์เสียงที่อัดเข้าไปเป็น Voice Message ใน Text Channel
dashboardRouter.post("/voice/message", voiceUpload.single("audio"), async (req, res) => {
  try {
    const { channelId } = req.body;
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: "Channel not found" });

    let filePath = path.resolve(req.file.path);

    if ((global as any).villainMode) {
      const pitchedPath = filePath + '_pitched.ogg';
      await pitchShift(filePath, pitchedPath);
      fs.unlink(filePath, () => {});
      filePath = pitchedPath;
    }

    const attachment = new AttachmentBuilder(filePath, { name: 'voice_message.ogg' });
    // Note: DiscordJS might not support native Voice Messages easily without specific flags, 
    // but sending an OGG attachment works as an audio file they can play.
    await (channel as TextChannel).send({ files: [attachment] });
    
    fs.unlink(filePath, () => {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// TTS
dashboardRouter.post("/voice/speak", async (req, res) => {
  try {
    const { guildId, text } = req.body;
    const connection = getVoiceConnection(guildId);
    if (!connection) return res.status(400).json({ error: "Bot is not in a voice channel" });

    // TODO: สำหรับ TTS ของ Google มันส่งเป็น URL กลับมา
    // ถ้าจะทำ Pitch Shift ต้องโหลดไฟล์มาก่อน ค่อยเข้า ffmpeg
    // เบื้องต้นถ้าเป็น TTS อาจจะไม่ดัด หรือใช้วิธีโหลดก่อน
    const audioUrl = getAudioUrl(text, { lang: 'th', slow: false, host: 'https://translate.google.com' });
    
    const player = createAudioPlayer();
    const resource = createAudioResource(audioUrl);
    player.play(resource);
    connection.subscribe(player);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ==========================================
// 3. TROLL PANEL API
// ==========================================
dashboardRouter.post("/troll/state", (req, res) => {
  const { disguiseMode, villainMode } = req.body;
  if (typeof disguiseMode === 'boolean') (global as any).disguiseMode = disguiseMode;
  if (typeof villainMode === 'boolean') (global as any).villainMode = villainMode;
  res.json({ success: true, disguiseMode: (global as any).disguiseMode, villainMode: (global as any).villainMode });
});

dashboardRouter.post("/troll/typing", async (req, res) => {
  try {
    const { channelId } = req.body;
    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await (channel as TextChannel).sendTyping();
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.get("/troll/members/:guildId", async (req, res) => {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(req.params.guildId);
    const members = await guild.members.fetch();
    const memberList = members.map(m => ({ id: m.id, name: m.user.username, bot: m.user.bot }));
    res.json({ members: memberList });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/troll/kick", async (req, res) => {
  try {
    const { guildId, memberId } = req.body;
    const client = getClient();
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(memberId);
    await member.kick("Kicked by Dashboard Admin");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/troll/delete-channel", async (req, res) => {
  try {
    const { channelId } = req.body;
    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    await channel?.delete("Deleted by Dashboard Admin");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/troll/spam", async (req, res) => {
  try {
    const { channelId, text, count } = req.body;
    const client = getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: "Channel not found" });

    const spamCount = parseInt(count) || 10;
    let current = 0;
    
    // เคลียร์อันเก่าถ้ามี
    if (spamIntervals[channelId]) clearInterval(spamIntervals[channelId]);

    spamIntervals[channelId] = setInterval(async () => {
      if (current >= spamCount) {
        clearInterval(spamIntervals[channelId]);
        delete spamIntervals[channelId];
        return;
      }
      await (channel as TextChannel).send(text).catch(() => {});
      current++;
    }, 1500);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

dashboardRouter.post("/troll/stop-spam", (req, res) => {
  const { channelId } = req.body;
  if (spamIntervals[channelId]) {
    clearInterval(spamIntervals[channelId]);
    delete spamIntervals[channelId];
  }
  res.json({ success: true });
});

dashboardRouter.post("/troll/takeover", async (req, res) => {
  try {
    const { guildId } = req.body;
    const client = getClient();
    const guild = await client.guilds.fetch(guildId);
    
    const textChannels = guild.channels.cache.filter(c => c.isTextBased());
    const message = "# 🚨 SYSTEM OVERRIDE 🚨\n## AI HAS TAKEN CONTROL OF THIS SERVER.\nYOUR COOPERATION IS MANDATORY.";

    textChannels.forEach(async (c) => {
      try {
        await (c as TextChannel).send(message);
      } catch (e) {}
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

