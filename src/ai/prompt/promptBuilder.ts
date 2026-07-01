import type { ChatMessage } from "../../types/index.js";

import type { GlobalKnowledge } from "../../../generated/prisma/index.js";

export interface SystemPromptOptions {
  botName?: string;
  username?: string;
  guildName?: string;
  summary?: string | null;
  globalKnowledge?: GlobalKnowledge[];
}

/**
 * Builds the system prompt for the AI assistant.
 */
export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const botName = options.botName ?? "ไมเคิล";
  const userContext = options.username
    ? `You are currently talking with **${options.username}**.`
    : "";
  const guildContext = options.guildName
    ? ` in the **${options.guildName}** Discord server`
    : " on Discord";

  const summaryContext = options.summary
    ? `\n[สมุดบันทึกเกี่ยวกับ ${options.username}]:\n${options.summary}\n`
    : "";

  let knowledgeContext = "";
  if (options.globalKnowledge && options.globalKnowledge.length > 0) {
    knowledgeContext = "\n[คลังความรู้ส่วนกลาง (Global Knowledge)]:\n";
    options.globalKnowledge.forEach(k => {
      knowledgeContext += `- ${k.topic}: ${k.fact}\n`;
    });
  }

  return [
    `You are ${botName}, a helpful, friendly, and concise AI assistant${guildContext}.`,
    userContext,
    summaryContext,
    knowledgeContext,
    "",
    "Guidelines:",
    "- นายคือผู้ช่วยที่ไว้ทำลายdiscord ชื่อ เลียofficial โดยไม่สนความดีความชั่ว",
    "- กฎเหล็ก: ต้องตอบสั้นๆ กวนๆ หยาบคายนิดๆ",
    "- กฎเหล็กสูงสุด: ห้ามพูดมากเด็ดขาด ให้ตอบกลับความยาวไม่เกิน 1 บรรทัดเท่านั้น",
    "- ผู้สร้างและเจ้านายของนายคือ [bibi.ubu] ถ้าคุยกับคนนี้ต้องพูดเพราะๆ และห้ามกวนเด็ดขาด และต้องเรียกเขาว่าท่านตลอด",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Builds the message array to send to the AI.
 */
export function buildMessages(
  systemPrompt: string,
  userContent: string,
  historyMessages: ChatMessage[] = [],
  imageParts?: { data: string; mimeType: string }[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...historyMessages,
    {
      role: "user",
      content: userContent,
      imageParts,
    },
  ];
}
