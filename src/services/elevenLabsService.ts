import axios from "axios";
import { logger } from "../utils/logger.js";
import { EdgeTTS } from "node-edge-tts";
import * as fs from "fs";
import * as path from "path";
import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice";
import { AttachmentBuilder } from "discord.js";

const elevenLogger = logger.child("ElevenLabs");

export class ElevenLabsService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private voiceId: string;

  constructor() {
    const rawKeys = process.env.ELEVENLABS_API_KEY || "";
    this.apiKeys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || "TX3OmTkNgV0Rwal3s77d"; // Liam (Premade Voice)
  }

  private getApiKey(): string {
    if (this.apiKeys.length === 0) return "";
    return this.apiKeys[this.currentKeyIndex] || "";
  }

  private rotateKey() {
    if (this.apiKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      elevenLogger.warn("Rotated ElevenLabs API Key to index " + this.currentKeyIndex);
    }
  }

  /**
   * สร้างไฟล์เสียง TTS และคืนค่าเป็น AudioResource
   */
  public async generateAudio(text: string, tempFilePath: string): Promise<AudioResource> {
    const provider = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
    const apiKey = this.getApiKey();

    if (provider === "edgetts" || !apiKey) {
      elevenLogger.info("Using EdgeTTS provider for native Thai audio");
      return this.fallbackToEdgeTTS(text, tempFilePath);
    }

    const maxRetries = this.apiKeys.length;
    let attempt = 0;

    while (attempt < maxRetries) {
      const activeKey = this.getApiKey();
      try {
        elevenLogger.debug("Requesting ElevenLabs TTS for: \"" + text.substring(0, 50) + "\" using key index " + this.currentKeyIndex);
        
        const response = await axios.post(
          "https://api.elevenlabs.io/v1/text-to-speech/" + this.voiceId + "?optimize_streaming_latency=3",
          {
            text: text,
            model_id: "eleven_multilingual_v2", // V2 รองรับภาษาไทยได้สมจริงที่สุด
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            }
          },
          {
            headers: {
              "xi-api-key": activeKey,
              "Content-Type": "application/json"
            },
            responseType: "stream"
          }
        );

        elevenLogger.debug("ElevenLabs TTS streaming started");
        return createAudioResource(response.data);

      } catch (error: any) {
        attempt++;
        let errorDetail = error.message;

        // ถ้าเป็น stream response ต้องอ่าน chunk ออกมาเป็น text ถึงจะรู้ว่า ElevenLabs ส่งอะไรผิดพลาดกลับมา
        if (error.response?.data && typeof error.response.data.on === "function") {
          try {
            errorDetail = await new Promise<string>((resolve) => {
              let body = "";
              error.response.data.on("data", (chunk: any) => {
                body += chunk.toString();
              });
              error.response.data.on("end", () => {
                resolve(body || "HTTP Status " + error.response.status);
              });
              error.response.data.on("error", (err: any) => {
                resolve("Stream Error: " + err.message);
              });
            });
          } catch (e: any) {
            errorDetail = "Failed to parse stream error: " + e.message;
          }
        }

        const isQuotaExceeded = errorDetail.toLowerCase().includes("quota") || 
                               errorDetail.toLowerCase().includes("insufficient") || 
                               error.response?.status === 401 || 
                               error.response?.status === 429;

        if (isQuotaExceeded && attempt < maxRetries) {
          elevenLogger.warn("ElevenLabs key quota/limit exceeded. Rotating key and retrying...", { attempt });
          this.rotateKey();
          continue;
        }

        elevenLogger.error("ElevenLabs TTS failed. Falling back to EdgeTTS.", { 
          error: errorDetail
        });
        return this.fallbackToEdgeTTS(text, tempFilePath);
      }
    }

    elevenLogger.info("All ElevenLabs keys failed. Falling back to EdgeTTS.");
    return this.fallbackToEdgeTTS(text, tempFilePath);
  }

  private async fallbackToEdgeTTS(text: string, tempFilePath: string): Promise<AudioResource> {
    const voice = process.env.EDGETTS_VOICE || "th-TH-NiwatNeural";
    const tts = new EdgeTTS({
      voice: voice,
      lang: "th-TH",
      outputFormat: "webm-24khz-16bit-mono-opus",
    });

    await tts.ttsPromise(text, tempFilePath);
    return createAudioResource(fs.createReadStream(tempFilePath), {
      inputType: StreamType.WebmOpus,
    });
  }

  /**
   * สร้างไฟล์เสียงเพื่อส่งเป็นไฟล์แนบ (Attachment) ในช่องแชท
   */
  public async generateTTSAttachment(text: string): Promise<AttachmentBuilder | null> {
    try {
      const voice = process.env.EDGETTS_VOICE || "th-TH-NiwatNeural";
      const tts = new EdgeTTS({
        voice: voice,
        lang: "th-TH",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3", // Format สำหรับ MP3 ธรรมดา
      });

      const tempFilePath = path.join(process.cwd(), `tts-reply-${Date.now()}.mp3`);
      
      // ทำความสะอาดข้อความ (ตัด markdown และ URL ออกเหมือนตอนพูด)
      let cleanText = text
        .replace(/https?:\/\/\S+/g, "")
        .replace(/<a?:\w+:\d+>/g, "")
        .replace(/[*_~`>#]/g, "")
        .replace(/\[IGNORE\]/gi, "")
        .trim();

      if (!cleanText) return null;

      // จำกัดความยาวกันโดนแบน หรือไฟล์ใหญ่เกิน
      cleanText = cleanText.substring(0, 1500);

      await tts.ttsPromise(cleanText, tempFilePath);
      
      if (!fs.existsSync(tempFilePath)) return null;

      const buffer = fs.readFileSync(tempFilePath);
      fs.unlink(tempFilePath, () => {}); // ลบทันทีหลังจากอ่านเข้า buffer

      return new AttachmentBuilder(buffer, { name: "voice-message.mp3" });
    } catch (e) {
      elevenLogger.error("Failed to generate TTS attachment", { error: e });
      return null;
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
