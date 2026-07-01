import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelsToTest = [
    'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.5-flash'
  ];

  for (const model of modelsToTest) {
    console.log(`\nTesting ${model}...`);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: "Hello"
      });
      console.log(`✅ ${model} WORKS!`);
      break; // Stop on first success
    } catch (e: any) {
      console.log(`❌ ${model} FAILED: ${e.message.substring(0, 100)}`);
    }
  }
}
main().catch(console.error);
