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
        temperature: 0.0, // ช่วยลดโอกาสการหลอนของโมเดล
      });

      let text = transcription.text.trim();
      
      // กรองคำหลอน (Hallucinations) ของ Whisper ที่เกิดจากเสียงพัดลม/เสียงช็อต/เสียงหัวเราะ
      const hallucinations = [
        "ขอบคุณค่ะ", "ขอบคุณครับ", "ขอบคุณที่รับชม", "ขอบคุณที่รับชมค่ะ", "ขอบคุณที่รับชมครับ",
        "สวัสดีค่ะ", "สวัสดีครับ", "คำบรรยายโดย", "คำบรรยายภาพโดย", "โอเค", "อืม", "อือ", "เอ่อ",
        "ซับไทยโดย", "amara.org", "subscribe", "รับชม", "ลาก่อน", "ค่ะ", "ครับ",
        "ฮ่าๆ", "ฮ่าๆๆ", "ฮ่า", "อิอิ", "หึๆ", "อืมม", "อ่า", "อ้าว", "เอ๊ะ", "อุ้ย", "หือ",
        "เงียบ", "เสียงดนตรี", "ดนตรี", "เพลง", "ไม่มีเสียง"
      ];
      
      const strippedText = text.toLowerCase().replace(/[\s\.\!]/g, "");
      if (strippedText.length < 2) return "";

      // ถ้า Whisper คาย tag อธิบายเสียงแปลกๆ ออกมา (เช่น เสียงหัวเราะ, ถอนหายใจ)
      if (/^\(.*\)$|^\[.*\]$/.test(text.trim())) {
        sttLogger.debug(`Dropped Whisper caption tag: "${text}"`);
        return "";
      }
      
      for (const h of hallucinations) {
        if (strippedText === h.toLowerCase() || 
            strippedText.includes("ขอบคุณที่รับชม") || 
            strippedText.includes("คำบรรยาย") ||
            strippedText.includes("ซับไทย")) {
          sttLogger.debug(`Dropped Whisper hallucination: "${text}"`);
          return "";
        }
      }

      sttLogger.debug(`Transcription result: "${text}"`);
      return text;
    } catch (error: any) {
      sttLogger.error("STT transcription failed", { error: error.message });
      return "";
    }
  }
}

export const speechToTextService = new SpeechToTextService();

