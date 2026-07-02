import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.list();
  
  for await (const model of response) {
    if (model.name?.includes('flash')) {
      console.log(model.name);
    }
  }
}
main().catch(console.error);
