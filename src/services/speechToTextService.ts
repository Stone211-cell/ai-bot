import { Groq } from "groq-sdk";
import * as fs from "fs";
import { logger } from "../utils/logger.js";

const sttLogger = logger.child("SpeechToText");

export class SpeechToTextService {
  private groq: Groq | null = null;

  private getClient(): Groq {
    if (!this.groq) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set — Speech-to-Text is disabled");
      }
      this.groq = new Groq({ apiKey });
    }
    return this.groq;
  }

  /**
   * ส่งไฟล์เสียงไปให้ Groq (Whisper-large-v3) แปลงเป็นข้อความ
   * @param filePath Path ของไฟล์เสียง .wav หรือ .ogg
   * @returns ข้อความที่แปลงได้
   */
  public async transcribe(filePath: string): Promise<string> {
    try {
      sttLogger.debug(`Transcribing audio file: ${filePath}`);
      
      const transcription = await this.getClient().audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3",
        language: "th",
        prompt: "Transcribe Thai audio accurately, including slang and informal language.",
        response_format: "json",
      });

      sttLogger.debug(`Transcription result: "${transcription.text}"`);
      return transcription.text.trim();
    } catch (error: any) {
      sttLogger.error("STT transcription failed", { error: error.message });
      return "";
    }
  }
}

export const speechToTextService = new SpeechToTextService();

