import { knowledgeRepository } from "../../repositories/knowledgeRepository.js";
import { userRepository } from "../../repositories/userRepository.js";
import { chatRepository } from "../../repositories/chatRepository.js";
import { logger } from "../../utils/logger.js";
import type { Type } from "@google/genai";

const toolsLogger = logger.child("AITools");

export const functionDeclarations = [
  {
    name: "learn_fact",
    description: "Learn and memorize an important new fact or knowledge globally for future reference. Use this ONLY when you learn something universally useful or a permanent fact about the server/users.",
    parameters: {
      type: "OBJECT" as unknown as Type,
      properties: {
        topic: {
          type: "STRING" as unknown as Type,
          description: "The topic or subject of the fact (e.g., 'User bibi.ubu', 'Server Rules', 'General Knowledge')",
        },
        fact: {
          type: "STRING" as unknown as Type,
          description: "The detailed fact to remember",
        },
      },
      required: ["topic", "fact"],
    },
  },
  {
    name: "clear_memory",
    description: "Clear the memory of a specific user. IMPORTANT: You must verify the caller is bibi.ubu and the password is correct.",
    parameters: {
      type: "OBJECT" as unknown as Type,
      properties: {
        caller_username: {
          type: "STRING" as unknown as Type,
          description: "The username of the person requesting the action",
        },
        password: {
          type: "STRING" as unknown as Type,
          description: "The secret password provided by the user in the chat",
        },
        target_discord_id: {
          type: "STRING" as unknown as Type,
          description: "The discord ID of the user whose memory should be cleared",
        },
      },
      required: ["caller_username", "password", "target_discord_id"],
    },
  },
];

export async function handleFunctionCall(name: string, args: Record<string, any>, contextUser: string): Promise<string> {
  toolsLogger.info("Function called", { name, args, contextUser });

  switch (name) {
    case "learn_fact": {
      const { topic, fact } = args;
      await knowledgeRepository.addFact(topic, fact);
      return `Successfully memorized fact about ${topic}.`;
    }
    case "clear_memory": {
      const { caller_username, password, target_discord_id } = args;
      if (caller_username !== "bibi.ubu" || contextUser !== "bibi.ubu") {
        return "ERROR: Permission denied. Only bibi.ubu can use this command.";
      }
      if (password !== "19052006") {
        return "ERROR: Incorrect password.";
      }
      
      const user = await userRepository.findByDiscordId(target_discord_id);
      if (!user) return "User not found.";
      
      await userRepository.updateSummary(target_discord_id, "");
      await chatRepository.deleteByUserId(user.id);
      return `Successfully cleared memory for user ${target_discord_id}.`;
    }
    default:
      return `Unknown function ${name}`;
  }
}
