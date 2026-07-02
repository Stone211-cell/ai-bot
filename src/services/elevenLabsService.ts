import axios from "axios";
import { logger } from "../utils/logger.js";
import { EdgeTTS } from "node-edge-tts";
import * as fs from "fs";
import * as path from "path";
import { createAudioResource, AudioResource, StreamType } from "@discordjs/voice";

const elevenLogger = logger.child("ElevenLabs");

export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || "";
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || "TX3OmTkNgV0Rwal3s77d"; // Liam (Premade Voice)
  }

  /**
   * สร้างไฟล์เสียง TTS และคืนค่าเป็น AudioResource
   */
  public async generateAudio(text: string, tempFilePath: string): Promise<AudioResource> {
    if (!this.apiKey) {
      elevenLogger.info("No ElevenLabs API key found, falling back to EdgeTTS");
      return this.fallbackToEdgeTTS(text, tempFilePath);
    }

    try {
      elevenLogger.debug("Requesting ElevenLabs TTS for: \"" + text.substring(0, 50) + "\"");
      
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
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json"
          },
          responseType: "stream"
        }
      );

      elevenLogger.debug("ElevenLabs TTS streaming started");
      return createAudioResource(response.data);

    } catch (error: any) {
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

      elevenLogger.error("ElevenLabs TTS failed. Falling back to EdgeTTS.", { 
        error: errorDetail
      });
      return this.fallbackToEdgeTTS(text, tempFilePath);
    }
  }

  private async fallbackToEdgeTTS(text: string, tempFilePath: string): Promise<AudioResource> {
    const tts = new EdgeTTS({
      voice: "th-TH-NiwatNeural",
      lang: "th-TH",
      outputFormat: "webm-24khz-16bit-mono-opus",
    });

    await tts.ttsPromise(text, tempFilePath);
    return createAudioResource(fs.createReadStream(tempFilePath), {
      inputType: StreamType.WebmOpus,
    });
  }
}

export const elevenLabsService = new ElevenLabsService();
