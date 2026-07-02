import { knowledgeRepository } from "../../repositories/knowledgeRepository.js";
import { userRepository } from "../../repositories/userRepository.js";
import { chatRepository } from "../../repositories/chatRepository.js";
import { getClient } from "../../bot/client.js";
import { logger } from "../../utils/logger.js";
import type { Type } from "@google/genai";
import { search } from "duck-duck-scrape";

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
  {
    name: "search_web",
    description: "Search the web using DuckDuckGo to find real-time information, news, or facts.",
    parameters: {
      type: "OBJECT" as unknown as Type,
      properties: {
        query: {
          type: "STRING" as unknown as Type,
          description: "The search query to look up on the internet.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "kick_member",
    description: "Kick (เตะ) a member from the Discord server. ONLY bibi.ubu can use this command. Use when bibi.ubu explicitly tells you to kick/เตะ someone out of the server.",
    parameters: {
      type: "OBJECT" as unknown as Type,
      properties: {
        caller_username: {
          type: "STRING" as unknown as Type,
          description: "Username of the person requesting the kick — must be bibi.ubu",
        },
        target_username: {
          type: "STRING" as unknown as Type,
          description: "Display name or username of the person to kick",
        },
        reason: {
          type: "STRING" as unknown as Type,
          description: "Reason for the kick (optional)",
        },
      },
      required: ["caller_username", "target_username"],
    },
  },
  {
    name: "save_nickname",
    description: "Save or update the nickname (ชื่อเล่น) of a user in the database. Use this IMMEDIATELY when a user tells you their nickname.",
    parameters: {
      type: "OBJECT" as unknown as Type,
      properties: {
        discord_id: {
          type: "STRING" as unknown as Type,
          description: "The discord ID of the user whose nickname you want to save.",
        },
        nickname: {
          type: "STRING" as unknown as Type,
          description: "The Thai nickname (ชื่อเล่น) of the user (e.g., 'แอล', 'บอม', 'บีม')",
        },
      },
      required: ["nickname"], // make discord_id optional for the AI
    },
  },
];

export async function handleFunctionCall(
  name: string,
  args: Record<string, any>,
  contextUser: string,
  guildId?: string | null,
  contextDiscordId?: string,
): Promise<string> {
  toolsLogger.info("Function called", { name, args, contextUser, contextDiscordId });

  switch (name) {
    // ── save_nickname ────────────────────────────────────────────────────────
    case "save_nickname": {
      const { nickname } = args;
      const targetId = args.discord_id || contextDiscordId;
      if (!targetId) {
        return "ERROR: Missing user discord ID.";
      }
      await userRepository.saveNickname(targetId, nickname);
      return `จำไว้แล้วว่า ${targetId} มีชื่อเล่นว่า "${nickname}"`;
    }

    // ── learn_fact ───────────────────────────────────────────────────────────
    case "learn_fact": {
      const { topic, fact } = args;
      await knowledgeRepository.addFact(topic, fact);
      return `Successfully memorized fact about ${topic}.`;
    }

    // ── clear_memory ─────────────────────────────────────────────────────────
    case "clear_memory": {
      const { caller_username, password, target_discord_id } = args;
      const isCreator = (caller_username === "bibi.ubu" || caller_username === "L_fullultra_HD") 
        && (contextUser === "bibi.ubu" || contextUser === "L_fullultra_HD");
      
      if (!isCreator) {
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

    // ── search_web ───────────────────────────────────────────────────────────
    case "search_web": {
      const { query } = args;
      try {
        const results = await search(query);
        const topResults = results.results
          .slice(0, 3)
          .map((r, i) => `${i + 1}. ${r.title}\n${r.description}\nURL: ${r.url}`)
          .join("\n\n");
        if (!topResults) return "No search results found.";
        return `Search results for "${query}":\n\n${topResults}`;
      } catch (error) {
        toolsLogger.error("Search failed", { error });
        return "Search failed. Could not retrieve results.";
      }
    }

    // ── kick_member ──────────────────────────────────────────────────────────
    case "kick_member": {
      const { caller_username, target_username, reason } = args;

      // Permission check: เฉพาะ bibi.ubu หรือ L_fullultra_HD เท่านั้น
      const isCreator = (caller_username === "bibi.ubu" || caller_username === "L_fullultra_HD") 
        && (contextUser === "bibi.ubu" || contextUser === "L_fullultra_HD");
        
      if (!isCreator) {
        toolsLogger.warn("Kick denied: not bibi.ubu", { caller_username, contextUser });
        return "ERROR: แกไม่ใช่ bibi.ubu กูไม่เตะให้หรอก";
      }

      if (!guildId) {
        return "ERROR: ไม่รู้ว่า server ไหน ลองส่งข้อความในห้องของ server อีกทีได้เลย";
      }

      try {
        const client = getClient();
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return "ERROR: ไม่เจอ server";

        // ค้นหา member จาก display name / username / globalName
        const members = await guild.members.fetch();
        const target = members.find(
          (m) =>
            m.displayName.toLowerCase() === target_username.toLowerCase() ||
            m.user.username.toLowerCase() === target_username.toLowerCase() ||
            (m.user.globalName?.toLowerCase() ?? "") === target_username.toLowerCase(),
        );

        if (!target) {
          return `ERROR: ไม่เจอคนชื่อ "${target_username}" ใน server`;
        }

        // Safety checks
        if (target.user.id === client.user?.id) {
          return "ERROR: กูไม่เตะตัวเองหรอก";
        }
        if (target.user.username === "bibi.ubu") {
          return "ERROR: กูไม่เตะลูกพี่หรอก แกบ้าเหรอ";
        }

        const kickReason = reason ?? "สั่งโดย bibi.ubu";
        await target.kick(kickReason);

        toolsLogger.info("Member kicked successfully", {
          target: target.user.username,
          by: caller_username,
          reason: kickReason,
        });
        return `เตะ ${target.displayName} (${target.user.username}) ออกไปแล้ว 👟`;
      } catch (error: any) {
        toolsLogger.error("Kick failed", { error });
        if (error?.code === 50013) {
          return "ERROR: บอทไม่มีสิทธิ์เตะคนนี้ — ต้องให้บอทมี role สูงกว่าเขา และมี permission KICK_MEMBERS";
        }
        return `ERROR: เตะไม่ได้ — ${error?.message ?? "unknown error"}`;
      }
    }

    default:
      return `Unknown function ${name}`;
  }
}
