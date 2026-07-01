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

  public join(channel: VoiceBasedChannel) {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
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
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.queue = [];
      this.player.stop();
    }
  }

  public speak(text: string) {
    if (!this.connection) {
      voiceLogger.warn("Cannot speak, not in a voice channel.");
      return;
    }
    
    // Clean text for TTS (remove URLs, long emojis, etc)
    const cleanText = text.replace(/https?:\/\/\S+/g, "").substring(0, 200);
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
