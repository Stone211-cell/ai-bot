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
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.isPlaying = false;
      this.playNext();
    });

    this.player.on("error", (error) => {
      voiceLogger.error("AudioPlayer Error:", { error });
      this.isPlaying = false;
      this.playNext();
    });
  }

  public join(channel: VoiceBasedChannel, textChannelId?: string) {
    if (textChannelId) {
      this.lastTextChannelId = textChannelId;
    }

    const currentMood = this.getMood();
    voiceLogger.info(`Bot joined with organic mood: ${currentMood}`);

    // Set mic/deaf behavior based on the organic mood
    const isLazyOrSleepy = currentMood.includes("ง่วง") || currentMood.includes("ขี้เกียจ");
    const selfMute = isLazyOrSleepy ? Math.random() > 0.7 : false; // 30% chance to mute if sleepy/lazy
    const selfDeaf = currentMood.includes("ง่วง") ? Math.random() > 0.8 : false; // 20% chance to deafen if sleepy

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: selfDeaf,
      selfMute: selfMute,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, () => {
      voiceLogger.info("Disconnected from voice channel.");
      this.connection = null;
      this.queue = [];
    });

    this.connection.subscribe(this.player);
    voiceLogger.info(`Joined voice channel: ${channel.id}`);
  }

  public leave() {
    this.clearLeaveTimeout();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.queue = [];
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
    
    // Core personality
    let baseMood = "กวนตีน มั่นใจแบบโทนี่สตาร์ค";

    // Organic time-based influence
    if (hour >= 2 && hour < 6) return baseMood + " แต่ง่วงนอนมากๆ รำคาญคน";
    if (hour >= 6 && hour < 10) return baseMood + " แต่เพิ่งตื่น ขี้เกียจๆ";
    if (hour >= 22) return baseMood + " แต่อารมณ์ดึกๆ ชิลๆ ปนง่วง";

    // Random daily variation (consistent throughout the day based on date)
    const today = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < today.length; i++) {
      hash = today.charCodeAt(i) + ((hash << 5) - hash);
    }
    const moodIndex = Math.abs(hash) % 100;

    if (moodIndex < 15) return baseMood + " แต่วันนี้หงุดหงิด เบื่อโลก";
    if (moodIndex < 30) return baseMood + " แต่วันนี้ร่าเริง พลังเยอะ";
    if (moodIndex < 45) return baseMood + " แต่วันนี้ขี้เกียจ ไม่อยากคุยยาว";
    
    return baseMood;
  }

  public speak(text: string) {
    if (!this.connection) {
      voiceLogger.warn("Cannot speak, not in a voice channel.");
      return;
    }
    
    // Clean text for TTS (remove URLs, long emojis, etc)
    let cleanText = text.replace(/https?:\/\/\S+/g, "").substring(0, 200);
    
    // Simulate breathing/pauses by replacing spaces with commas
    // Thai doesn't use spaces between words, only between sentences/clauses
    cleanText = cleanText.replace(/\s+/g, ", ");
    
    if (!cleanText.trim()) return;

    this.queue.push(cleanText);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0 || !this.connection) return;

    const text = this.queue.shift()!;
    this.isPlaying = true;

    try {
      // Create Edge TTS instance (using a male Thai voice by default: th-TH-NiwatNeural)
      const tts = new EdgeTTS({
        voice: "th-TH-NiwatNeural",
        lang: "th-TH",
        outputFormat: "webm-24khz-16bit-mono-opus",
      });

      // We need to save the stream to a temporary file or buffer to play it
      // Let's create a temporary file path
      const tempFilePath = path.join(process.cwd(), `temp-tts-${Date.now()}.webm`);
      
      await tts.ttsPromise(text, tempFilePath);

      // Force Discord.js to treat it as native WebM Opus and bypass FFMPEG
      const resource = createAudioResource(fs.createReadStream(tempFilePath), {
        inputType: StreamType.WebmOpus,
      });
      
      // Cleanup file when playback ends
      this.player.once(AudioPlayerStatus.Idle, () => {
        fs.unlink(tempFilePath, (err) => {
          if (err) voiceLogger.error("Failed to delete temp TTS file", { err });
        });
      });

      this.player.play(resource);
    } catch (error) {
      voiceLogger.error("TTS playback failed", { error });
      this.isPlaying = false;
      this.playNext();
    }
  }
  
  public isInVoice(): boolean {
    return this.connection !== null;
  }
}

export const voiceService = new VoiceService();
