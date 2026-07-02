import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
  StreamType,
  EndBehaviorType,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { EdgeTTS } from "node-edge-tts";
import * as fs from "fs";
import * as path from "path";
import prism from "prism-media";
import { logger } from "../utils/logger.js";
import { speechToTextService } from "./speechToTextService.js";
import { chatService } from "./chatService.js";
import { execFile } from "child_process";

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

    // ดักจับสถานะเครือข่ายของห้องเสียง (ช่วยแก้ปัญหาเข้าแล้วเด้งออก)
    this.connection.on("stateChange", (oldState, newState) => {
      const oldNetworking = Reflect.get(oldState, "networking");
      const newNetworking = Reflect.get(newState, "networking");

      const networkStateChange = (oldNetworking && newNetworking) ? 
        `Network: ${Reflect.get(oldNetworking, "state")?.code} -> ${Reflect.get(newNetworking, "state")?.code}` : "";
      
      voiceLogger.debug(`Voice status changed from ${oldState.status} to ${newState.status} ${networkStateChange}`);
    });

    // เปิดโหมด Debug พิมพ์ Error เชิงลึกแบบละเอียดที่สุด
    this.connection.on("debug", (message) => {
      voiceLogger.debug(`[VOICE_INTERNAL] ${message}`);
    });
    
    this.connection.on("error", (error) => {
      voiceLogger.error(`[VOICE_CRITICAL_ERROR]`, { error: error.message, stack: error.stack });
    });

    // รอให้ connection พร้อมก่อน subscribe player
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
      voiceLogger.info("Voice connection is Ready");
    } catch (err) {
      voiceLogger.error("Voice connection failed to become Ready (UDP Timeout)", { err });
      this.connection.destroy();
      this.connection = null;
      throw new Error("Voice connection failed to become Ready (UDP Timeout)");
    }

    this.connection.subscribe(this.player);
    voiceLogger.info(`Joined and subscribed to voice channel: ${channel.id}`);

    this.setupAudioReceiver(channel);

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

  private setupAudioReceiver(channel: VoiceBasedChannel) {
    if (!this.connection) return;

    const receiver = this.connection.receiver;

    receiver.speaking.on("start", (userId) => {
      // ถ้าระบบไม่ได้อยู่ในโหมด AI หรือไม่ได้คุยอยู่ ไม่ต้องฟัง
      if (this.mode !== "talk") return;
      if (userId === channel.client.user?.id) return; // ไม่ฟังตัวเอง

      voiceLogger.debug(`Started listening to user: ${userId}`);

      const opusStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 700, // รอเงียบ 0.7 วินาทีถึงตัดจบไฟล์ (ลดดีเลย์)
        },
      });

      // ใช้ prism.opus.Decoder แปลง Opus เป็น PCM raw audio
      const pcmDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      // ดักจับ error ของ decoder เพื่อไม่ให้บอทค้าง/ดับ หากมีแพ็กเก็ตเสียงเสียหาย (เช่น คลื่นแทรก/เน็ตกระตุก)
      pcmDecoder.on("error", (err) => {
        voiceLogger.warn(`Opus decoder warning (packet loss/corruption) for user ${userId}:`, { error: err.message });
      });

      const tempPcmPath = path.join(process.cwd(), `user-${userId}-${Date.now()}.pcm`);
      const tempWavPath = tempPcmPath.replace(".pcm", ".wav");
      const writeStream = fs.createWriteStream(tempPcmPath);

      opusStream.on("error", (err) => {
        voiceLogger.error(`Opus stream error for user ${userId}:`, { error: err.message });
      });

      writeStream.on("error", (err) => {
        voiceLogger.error(`Write stream error for user ${userId}:`, { error: err.message });
      });

      opusStream.pipe(pcmDecoder).pipe(writeStream);

      writeStream.on("finish", async () => {
        voiceLogger.debug(`Finished receiving PCM audio from ${userId}, converting to WAV...`);
        
        const { default: ffmpegPath } = await import("ffmpeg-static");
        const ffmpegBinary = process.env.FFMPEG_PATH || ffmpegPath || "ffmpeg";
        
        // ใช้ execFile แทน exec เพื่อหลีกเลี่ยงปัญหา Double Quotes ใน cmd.exe ของ Windows
        const args = [
          "-y",
          "-f", "s16le",
          "-ar", "48000",
          "-ac", "2",
          "-i", tempPcmPath,
          tempWavPath
        ];
        
        execFile(ffmpegBinary, args, async (error) => {
          // ลบไฟล์ PCM ทิ้งทันทีหลังแปลงเสร็จ
          if (fs.existsSync(tempPcmPath)) {
            fs.unlink(tempPcmPath, () => {});
          }

          if (error) {
            voiceLogger.error("Failed to convert PCM to WAV using ffmpeg", { error: error.message });
            if (fs.existsSync(tempWavPath)) {
              fs.unlink(tempWavPath, () => {});
            }
            return;
          }

          try {
            voiceLogger.debug("Successfully converted to WAV, sending to STT...");
            // 1. แปลงเสียงเป็นข้อความ
            const text = await speechToTextService.transcribe(tempWavPath);
            
            // ลบไฟล์ WAV ทิ้งหลังส่งเสร็จ
            if (fs.existsSync(tempWavPath)) {
              fs.unlink(tempWavPath, () => {});
            }

            if (!text || text.length < 2) return; // ถ้าไม่มีข้อความ หรือสั้นเกินไปข้าม

            voiceLogger.info(`User ${userId} said: "${text}"`);

            // 2. ดึงชื่อผู้ใช้
            const user = await channel.client.users.fetch(userId).catch(() => null);
            const username = user?.username || "VoiceUser";

            // 3. ส่งข้อความให้ AI คิดคำตอบ
            const result = await chatService.processMessage({
              discordId: userId,
              username: username,
              discriminator: "0",
              avatarUrl: null,
              channelId: this.lastTextChannelId || channel.id,
              guildId: null,
              content: text,
              imageParts: [],
            });

            // 4. ให้บอทพูดคำตอบออกทางเสียง
            if (!result.reply.includes("[IGNORE]")) {
              this.speak(result.reply);
            }
          } catch (err: any) {
            voiceLogger.error("Error processing voice input", { error: err.message });
            if (fs.existsSync(tempWavPath)) {
              fs.unlink(tempWavPath, () => {});
            }
          }
        });
      });
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

      const { elevenLabsService } = await import("./elevenLabsService.js");
      const resource = await elevenLabsService.generateAudio(text, tempFilePath);

      // ตรวจว่าไฟล์ถูกสร้างและมีข้อมูล (เฉพาะเมื่อมีการบันทึกไฟล์ลงดิสก์ เช่น EdgeTTS)
      if (fs.existsSync(tempFilePath)) {
        const stat = fs.statSync(tempFilePath);
        if (stat.size === 0) {
          throw new Error("TTS output file is empty");
        }
        voiceLogger.debug(`TTS file verified: ${stat.size} bytes`);
      } else {
        voiceLogger.debug("TTS resource streamed directly (no temp file)");
      }

      // Resource ถูกสร้างจาก elevenLabsService แล้ว ไม่ต้องสร้างใหม่
      // Cleanup ไฟล์ชั่วคราวเมื่อเล่นจบ
      const cleanup = () => {
        if (fs.existsSync(tempFilePath)) {
          fs.unlink(tempFilePath, (err) => {
            if (err && err.code !== "ENOENT") {
              voiceLogger.error("Failed to delete temp TTS file", { err: err.message });
            }
          });
        }
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
