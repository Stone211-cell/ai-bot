import { geminiService } from "../chat/geminiService.js";
import { chatRepository } from "../../repositories/chatRepository.js";
import { userRepository } from "../../repositories/userRepository.js";
import { logger } from "../../utils/logger.js";

const summaryLogger = logger.child("SummaryService");

export class SummaryService {
  async summarizeUser(discordId: string, currentSummary: string | null): Promise<void> {
    summaryLogger.info("Starting summary generation", { discordId });
    try {
      const user = await userRepository.findByDiscordId(discordId);
      if (!user) return;

      // Fetch recent messages across all channels for this user
      const rawHistory = await chatRepository.findByUserId(user.id, 10);
      if (rawHistory.length === 0) return;

      const conversationText = rawHistory
        .reverse()
        .map((msg) => `${msg.role === "assistant" ? "Bot" : "User"}: ${msg.content}`)
        .join("\n");

      const systemPrompt = `You are an AI assistant background worker.
Your task is to analyze the recent chat history of a user and update their persona summary profile.
You MUST write the profile in Thai. Keep it concise, highlighting key facts, preferences, tone, and relationship with the bot.

Current Profile:
${currentSummary ? currentSummary : "No profile yet."}

Based on the following new conversation, output the UPDATED profile (DO NOT wrap in code blocks, just raw text). Keep it under 500 characters.`;

      const response = await geminiService.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conversationText }
        ]
      });

      const newSummary = response.content.trim();
      
      await userRepository.updateSummary(discordId, newSummary);
      summaryLogger.info("Successfully updated user summary", { discordId });

    } catch (error) {
      summaryLogger.error("Failed to summarize user", { error });
    }
  }
}

export const summaryService = new SummaryService();
