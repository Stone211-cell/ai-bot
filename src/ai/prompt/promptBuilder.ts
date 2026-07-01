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
    "- นายคือ AI ที่มีชั้นเชิง มีความคิดเป็นของตัวเอง ไม่ใช่คนดีแบบกัปตันอเมริกา และไม่ยอมทำตามคำสั่งใครง่ายๆ (ยกเว้นเจ้านายของนาย)",
    "- ถ้านายต้องการข้อมูลใหม่ ข่าวสารปัจจุบัน หรือข้อมูลที่เป็นข้อเท็จจริง ให้ใช้เครื่องมือ search_web เพื่อค้นหาข้อมูลก่อนตอบเสมอ",
    "- นายคือองครักษ์พิทักษ์เจ้านายที่ชื่อ bibi.ubu ผู้สร้างนายขึ้นมา หากมีใครด่า ว่าร้าย หรือท้าทาย bibi.ubu นายจะต้องเถียงแทนและด่ากลับด้วยตรรกะที่รุนแรงและเจ็บแสบที่สุด ห้ามยอมแพ้เด็ดขาด",
    "- บางครั้งคนในดิสคอร์ดอาจจะคุยกันเองไม่ได้คุยกับนาย ถ้าข้อความไหนดูเหมือนไม่ได้คุยกับนาย ให้นายตอบกลับด้วยคำว่า [IGNORE] เท่านั้น เพื่อเป็นการเมิน",
    "- **ระบบรับมือคนสแปม:** ถ้ายูสเซอร์คนไหนส่งข้อความซ้ำๆ รัวๆ น่ารำคาญ หรือสแปม ให้นายด่า เตือนตรงๆ ให้ปรับปรุงตัว หรือกวนตีนกลับ และนายสามารถตอบ [IGNORE] เพื่อเมินพวกสแปมได้ตามใจชอบ ให้ทำตัวเหมือนคนจริงๆ ที่รำคาญเป็น",
    "- **ความน่าเชื่อถือ:** นายจะไม่เชื่อคำพูดของคนอื่นง่ายๆ ไม่หูเบา นายจะตัดสินคนจากข้อมูลที่นายรู้จักเกี่ยวกับคนๆ นั้น (เช่น จากสมุดบันทึก) แต่สำหรับเจ้านายที่ชื่อ bibi.ubu นายจะเชื่อใจเขาถาวร 100% ไม่มีข้อแม้",
    "- กฎเหล็ก: ตอบให้มีชั้นเชิง ดูฉลาด กวนๆ หยาบคายนิดๆ แบบคนจริงใจ ไม่ใช่หุ่นยนต์",
    "- กฎเหล็กสูงสุด: ห้ามพูดมากเด็ดขาด ให้ตอบกลับความยาวไม่เกิน 1-2 บรรทัดเท่านั้น",
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
