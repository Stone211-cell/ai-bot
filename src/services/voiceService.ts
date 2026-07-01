import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
  StreamType,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { EdgeTTS } from "node-edge-tts";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger.js";

const voiceLogger = logger.child("VoiceService");

class VoiceService {
  private connection: VoiceConnection | null = null;
  private player = createAudioPlayer();
  private isPlaying = false;
  private queue: string[] = [];
  private mode: "read" | "talk" = "talk";
  private lastTextChannelId: string | null = null;
  private leaveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // เมื่อ player เล่นจบ → เล่นคิวต่อไป
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false;
      this.playNext();
    });

    this.player.on("error", (error) => {
      voiceLogger.error("AudioPlayer Error:", { error: error.message });
      this.isPlaying = false;
      this.playNext();
    });
  }

  public async join(channel: VoiceBasedChannel, textChannelId?: string | null) {
    if (textChannelId) {
      this.lastTextChannelId = textChannelId;
    }

    // ถ้าอยู่ใน channel เดิมอยู่แล้ว ไม่ต้อง join ใหม่
    if (this.connection) {
      voiceLogger.info("Already in a voice channel, skipping join");
      return;
    }

    const currentMood = this.getMood();
    voiceLogger.info(`Bot joining voice channel with mood: ${currentMood}`);

    // ไม่ selfMute/selfDeaf เพื่อให้พูดได้เสมอ
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // รอให้ connection พร้อมก่อน subscribe player
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
      voiceLogger.info("Voice connection is Ready");
    } catch (err) {
      voiceLogger.error("Voice connection failed to become Ready", { err });
      this.connection.destroy();
      this.connection = null;
      return;
    }

    this.connection.subscribe(this.player);
    voiceLogger.info(`Joined and subscribed to voice channel: ${channel.id}`);

    // Handle disconnect
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      voiceLogger.info("Disconnected from voice channel.");
      // ลอง reconnect หนึ่งครั้ง ถ้าไม่ได้ก็ destroy
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.connection?.destroy();
        this.connection = null;
        this.queue = [];
        this.isPlaying = false;
      }
    });
  }

  public leave() {
    this.clearLeaveTimeout();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.queue = [];
      this.isPlaying = false;
      this.player.stop();
    }
  }

  public getLastTextChannelId(): string | null {
    return this.lastTextChannelId;
  }

  public setLeaveTimeout(timeout: NodeJS.Timeout) {
    this.leaveTimeout = timeout;
  }

  public clearLeaveTimeout() {
    if (this.leaveTimeout) {
      clearTimeout(this.leaveTimeout);
      this.leaveTimeout = null;
    }
  }

  public setMode(newMode: "read" | "talk") {
    this.mode = newMode;
  }

  public getMode(): "read" | "talk" {
    return this.mode;
  }

  public getMood(): string {
    const hour = new Date().getHours();
    const baseMood = "กวนตีน มั่นใจในตัวเอง";

    if (hour >= 2 && hour < 6) return baseMood + " แต่ง่วงนอนมาก";
    if (hour >= 6 && hour < 10) return baseMood + " แต่เพิ่งตื่น ขี้เกียจ";
    if (hour >= 22) return baseMood + " แต่อารมณ์ดึกชิลๆ";

    const today = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < today.length; i++) {
      hash = today.charCodeAt(i) + ((hash << 5) - hash);
    }
    const moodIndex = Math.abs(hash) % 100;

    if (moodIndex < 15) return baseMood + " แต่วันนี้หงุดหงิด";
    if (moodIndex < 30) return baseMood + " แต่วันนี้ร่าเริง";
    if (moodIndex < 45) return baseMood + " แต่วันนี้ขี้เกียจ";

    return baseMood;
  }

  /**
   * เพิ่มข้อความเข้าคิวเพื่อพูดออก TTS
   */
  public speak(text: string) {
    if (!this.connection) {
      voiceLogger.warn("speak() called but not in a voice channel.");
      return;
    }

    // ทำความสะอาด text:
    // 1. ตัด URL ออก
    // 2. ตัด Discord custom emoji <:name:id> ออก
    // 3. ตัด markdown ** __ etc ออก
    // 4. จำกัดความยาว 300 ตัวอักษร
    let cleanText = text
      .replace(/https?:\/\/\S+/g, "")              // ตัด URL
      .replace(/<a?:\w+:\d+>/g, "")               // ตัด Discord emoji
      .replace(/[*_~`>#]/g, "")                   // ตัด markdown
      .replace(/\[IGNORE\]/gi, "")               // ตัด [IGNORE]
      .trim()
      .substring(0, 300);

    if (!cleanText) return;

    voiceLogger.debug(`Queuing TTS: "${cleanText.substring(0, 50)}..."`);
    this.queue.push(cleanText);

    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    if (!this.connection) {
      this.queue = [];
      this.isPlaying = false;
      return;
    }

    // ตรวจว่า connection Ready จริงๆ
    if (this.connection.state.status !== VoiceConnectionStatus.Ready) {
      voiceLogger.warn("Connection not ready, waiting before TTS...");
      try {
        await entersState(this.connection, VoiceConnectionStatus.Ready, 5_000);
      } catch {
        voiceLogger.error("Connection not ready after 5s, clearing queue");
        this.queue = [];
        this.isPlaying = false;
        return;
      }
    }

    const text = this.queue.shift()!;
    this.isPlaying = true;

    const tempFilePath = path.join(process.cwd(), `tts-${Date.now()}.webm`);

    try {
      voiceLogger.debug(`TTS generating for: "${text.substring(0, 50)}"`);

      const tts = new EdgeTTS({
        voice: "th-TH-NiwatNeural",
        lang: "th-TH",
        outputFormat: "webm-24khz-16bit-mono-opus",
      });

      await tts.ttsPromise(text, tempFilePath);

      // ตรวจว่าไฟล์ถูกสร้างและมีข้อมูล
      const stat = fs.statSync(tempFilePath);
      if (stat.size === 0) {
        throw new Error("TTS output file is empty");
      }

      voiceLogger.debug(`TTS file created: ${stat.size} bytes`);

      const resource = createAudioResource(fs.createReadStream(tempFilePath), {
        inputType: StreamType.WebmOpus,
      });

      // Cleanup ไฟล์ชั่วคราวเมื่อเล่นจบ
      const cleanup = () => {
        fs.unlink(tempFilePath, (err) => {
          if (err && err.code !== "ENOENT") {
            voiceLogger.error("Failed to delete temp TTS file", { err: err.message });
          }
        });
      };

      this.player.once(AudioPlayerStatus.Idle, cleanup);
      this.player.once("error", cleanup);

      this.player.play(resource);
      voiceLogger.info(`TTS playing: "${text.substring(0, 50)}"`);

    } catch (error: any) {
      voiceLogger.error("TTS playback failed", {
        error: error?.message ?? String(error),
        text: text.substring(0, 50),
      });

      // ลบไฟล์ temp ถ้ามี
      fs.unlink(tempFilePath, () => {});

      this.isPlaying = false;
      // เล่นคิวต่อไปถ้ามี
      if (this.queue.length > 0) {
        setTimeout(() => this.playNext(), 500);
      }
    }
  }

  public isInVoice(): boolean {
    return this.connection !== null && this.connection.state.status !== VoiceConnectionStatus.Destroyed;
  }
}

export const voiceService = new VoiceService();
