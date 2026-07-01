import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  VoiceConnection,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import * as googleTTS from "google-tts-api";
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

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
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
      // Get audio URL from google-tts-api
      const url = googleTTS.getAudioUrl(text, {
        lang: "th",
        slow: false,
        host: "https://translate.google.com",
      });

      const resource = createAudioResource(url);
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
