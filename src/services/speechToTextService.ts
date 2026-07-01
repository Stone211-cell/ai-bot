import { Groq } from "groq-sdk";
import * as fs from "fs";
import { logger } from "../utils/logger.js";

const sttLogger = logger.child("SpeechToText");

export class SpeechToTextService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  /**
   * ส่งไฟล์เสียงไปให้ Groq (Whisper-large-v3) แปลงเป็นข้อความ
   * @param filePath Path ของไฟล์เสียง .wav หรือ .ogg
   * @returns ข้อความที่แปลงได้
   */
  public async transcribe(filePath: string): Promise<string> {
    try {
      sttLogger.debug(`Transcribing audio file: ${filePath}`);
      
      const transcription = await this.groq.audio.transcriptions.create({
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
