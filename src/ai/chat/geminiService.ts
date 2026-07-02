import { GoogleGenAI } from "@google/genai";
import { config } from "../../config/index.js";
import type { ChatCompletionOptions, ChatCompletionResult } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { functionDeclarations, handleFunctionCall } from "../tools/index.js";

const aiLogger = logger.child("GeminiService");

export interface IGeminiService {
  chat(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
}

export class GeminiService implements IGeminiService {
  private currentKeyIndex = 0;

  private getClient(): GoogleGenAI {
    const key = config.gemini.apiKeys[this.currentKeyIndex];
    if (!key) throw new Error("No API keys available");
    return new GoogleGenAI({ apiKey: key });
  }

  private rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % config.gemini.apiKeys.length;
    aiLogger.warn(`Rotated Gemini API Key to index ${this.currentKeyIndex}`);
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const model = options.model ?? config.gemini.model;
    const maxOutputTokens = options.maxTokens ?? config.gemini.maxTokens;
    const temperature = options.temperature ?? config.gemini.temperature;

    // Build contents array from messages (skip system role — handled separately)
    const systemMessage = options.messages.find((m) => m.role === "system");
    const userMessages = options.messages.filter((m) => m.role !== "system");

    // systemInstruction ต้องเป็น string ธรรมดาใน @google/genai
    const systemInstruction = systemMessage?.content ?? undefined;

    const contents = userMessages.map((m) => {
      const parts: any[] = [{ text: m.content || " " }]; // GenAI requires non-empty text
      if (m.imageParts && m.imageParts.length > 0) {
        for (const img of m.imageParts) {
          parts.push({
            inlineData: {
              data: img.data,
              mimeType: img.mimeType,
            },
          });
        }
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    aiLogger.debug("Sending Gemini request", {
      model,
      messageCount: options.messages.length,
      maxOutputTokens,
    });

    const tools: any[] | undefined = options.disableTools ? undefined : [
      { functionDeclarations }
    ];

    const maxRetries = config.gemini.apiKeys.length;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const client = this.getClient();
        let response = await client.models.generateContent({
          model,
          contents,
          config: {
            maxOutputTokens,
            temperature,
            tools,
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        });

        // Handle function calls
        if (response.functionCalls && response.functionCalls.length > 0) {
          const call = response.functionCalls[0];
          if (!call) throw new Error("Empty function call returned");
          aiLogger.info("Executing function call", { name: call.name, contextUsername: options.contextUsername });
          const functionResult = await handleFunctionCall(
            call.name!, 
            call.args as Record<string, any>, 
            options.contextUsername || "unknown",
            options.guildId ?? null,
            options.contextDiscordId,
          );

          // Append to contents and call again
          // ส่งอ็อบเจกต์ Candidates Content ดิบกลับเข้าไปตรงๆ เพื่อรักษา thought_signature ไว้ให้ครบถ้วนตามมาตรฐานใหม่ของ Google
          if (response.candidates?.[0]?.content) {
            const contentObj = response.candidates[0].content;
            contents.push({
              role: contentObj.role || "model",
              parts: contentObj.parts as any[],
            });
          } else {
            contents.push({
              role: "model",
              parts: [{ functionCall: call }],
            });
          }

          contents.push({
            role: "user",
            parts: [{ functionResponse: { name: call.name!, response: { result: functionResult } } }],
          });

          response = await client.models.generateContent({
            model,
            contents,
            config: {
              maxOutputTokens,
              temperature,
              tools,
              ...(systemInstruction ? { systemInstruction } : {}),
            },
          });
        }

        let text = "";
        try {
          text = response.text || "";
        } catch (e) {
          // Gemini SDK getter for text throws if blocked by safety or no parts exist
          aiLogger.warn("Gemini text getter threw an error (possibly safety blocked)", { error: e });
        }

        if (!text) {
          aiLogger.warn("Gemini returned an empty response. Using fallback.");
          text = "[IGNORE]";
        }

        const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
        const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

        const result: ChatCompletionResult = {
          content: text,
          model,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        };

        aiLogger.debug("Gemini response received", {
          model: result.model,
          totalTokens: result.usage.totalTokens,
        });

        return result;
      } catch (error: any) {
        attempt++;
        const message = error?.message || String(error);
        const shouldRetry = message.includes("429") || 
                            message.includes("RESOURCE_EXHAUSTED") || 
                            message.includes("503") || 
                            message.includes("UNAVAILABLE") || 
                            message.includes("500") || 
                            message.includes("INTERNAL");

        if (shouldRetry && attempt < maxRetries) {
          aiLogger.warn(`Gemini API Temporary Error (${message}). Rotating key and retrying...`, { attempt });
          this.rotateKey();
          continue;
        }

        aiLogger.error("Gemini request failed", {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "Unknown",
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw new Error(`Gemini request failed: ${message}`);
      }
    }
    
    throw new Error("All Gemini API keys failed (Rate Limit or Service Unavailable)");
  }
}

// Export singleton instance
export const geminiService = new GeminiService();
