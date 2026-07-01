# 🤖 Discord AI Bot

A production-ready Discord AI Bot starter built with **TypeScript**, **Discord.js v14**, **OpenAI**, **Prisma ORM**, and **Supabase PostgreSQL**.

## 🏗️ Architecture

```
src/
├── index.ts                  # Entrypoint (bootstrap only)
├── config/
│   └── index.ts              # Centralized env validation
├── bot/
│   ├── client.ts             # Discord client singleton
│   ├── index.ts              # Bot bootstrap + shutdown handlers
│   ├── events/
│   │   ├── ready.ts          # ClientReady event
│   │   └── messageCreate.ts  # MessageCreate event
│   ├── handlers/
│   │   ├── eventLoader.ts    # Dynamic event registration
│   │   └── messageHandler.ts # Maps Discord message → ChatService
│   └── commands/             # (Ready for slash commands)
├── ai/
│   ├── chat/
│   │   └── openAIService.ts  # OpenAI SDK wrapper
│   └── prompt/
│       └── promptBuilder.ts  # System prompt + message builder
├── services/
│   └── chatService.ts        # Orchestrates user upsert → AI → DB
├── repositories/
│   ├── userRepository.ts     # User CRUD (Repository Pattern)
│   └── chatRepository.ts     # ChatMessage CRUD (Repository Pattern)
├── database/
│   └── prismaClient.ts       # Prisma singleton
├── types/
│   └── index.ts              # Shared TypeScript types & DTOs
└── utils/
    ├── logger.ts             # Colorized structured logger
    └── errorHandler.ts       # Typed errors + global handlers
```

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from [Discord Developer Portal](https://discord.com/developers) |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal |
| `OPENAI_API_KEY` | OpenAI API key |
| `DATABASE_URL` | Supabase **pooled** connection string (port 6543) |
| `DIRECT_URL` | Supabase **direct** connection string (port 5432) |

### 3. Enable Privileged Gateway Intents

In the Discord Developer Portal → Bot → enable:
- ✅ **Message Content Intent**
- ✅ **Server Members Intent** (optional)

### 4. Set up database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to Supabase (for development)
npm run db:push

# OR run migrations (for production)
npm run db:migrate
```

### 5. Run the bot

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

## 🔧 Supabase Connection Strings

In your Supabase dashboard → Project Settings → Database:

```env
# Google Gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
GEMINI_MAX_TOKENS=1024
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_HISTORY=10 # จำนวนประวัติการคุยที่บอทจะจำได้ต่อคน/ต่อช่อง

# Pooler (Session mode) — use for runtime queries
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct — use for migrations
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

## ✨ Features & Commands

บอทตัวนี้มีฟีเจอร์ล้ำๆ มากมาย โดยสามารถคุยเล่นผ่านข้อความได้ตามปกติ และมีคำสั่งพิเศษดังนี้:

### 💬 ระบบ Voice & เสียงพูด (TTS)
บอทสามารถเข้ามาพูดคุยในช่องเสียง (Voice Channel) ได้ 2 โหมด:
- **`/joinmom`** หรือ **`/talkmom`**: **โหมด AI พูดคุย** (บอทเข้าช่องเสียงมาเพื่อเป็นเพื่อนคุย มันจะคิดคำตอบจากแชทแล้วพูดออกมาอย่างเป็นธรรมชาติ มีจังหวะหายใจ)
- **`/readmom`**: **โหมดเครื่องแปลภาษา/อ่านแชท** (บอทจะเข้าช่องเสียงเพื่ออ่านตามแชทที่คุณพิมพ์เป๊ะๆ เหมาะสำหรับคนไม่มีไมค์ โดย AI จะไม่ตอบโต้)
- **`/leavemom`**: สั่งให้บอทออกจากช่องเสียง

### 🛡️ ระบบองครักษ์ & ตรรกะแบบคน
- **เถียงแทนเจ้านาย:** บอทถูกโปรแกรมมาให้ปกป้องผู้สร้าง (`bibi.ubu`) ใครมาด่าเจ้านาย มันจะเถียงกลับแบบกัดไม่ปล่อย
- **เมินคนเนียนๆ:** ถ้าคนในเซิร์ฟเวอร์คุยกันเอง บอทจะรู้จักประเมินว่า "ไม่ได้คุยกับมัน" และจะเมินแชทนั้นไป ไม่ตอบทุกข้อความให้รำคาญ
- **ระบบกันคนสแปม:** ถ้าใครพิมพ์สแปมรัวๆ บอทจะด่ากลับ เตือนตรงๆ ให้ปรับปรุงตัว หรือกวนตีนกลับ และถ้ามันรำคาญมากๆ มันจะเมินคนนั้นทิ้งทันที

### 🧠 ความจำ & การเรียนรู้
- **ความจำระยะสั้น (Short-term):** จำบริบทแชทเก่าๆ ของแต่ละคนได้
- **ความจำถาวร (Global Knowledge):** บอทสามารถจดจำ "กฎของเซิร์ฟเวอร์" หรือ "ความลับ" ไว้ในสมองส่วนกลางได้ตลอดไป
- **ล้างความจำ:** พิมพ์คำสั่งลับในแชท (ต้องเป็นเจ้านายเท่านั้น) เพื่อล้างความจำของใครบางคน

### 🌐 ค้นหาข้อมูลแบบ Real-time
บอทมีฟีเจอร์ "ค้นหาข้อมูลจากอินเทอร์เน็ต" ผ่าน DuckDuckGo ได้ฟรี หากถามถึงข่าวหรือข้อมูลปัจจุบัน มันจะวิ่งไปค้นหาเว็บแล้วมาสรุปให้ฟังทันที

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Discord | Discord.js v14 |
| AI | OpenAI SDK |
| ORM | Prisma v6 |
| Database | Supabase (PostgreSQL) |
| Runtime | Node.js + tsx |

## 🗄️ Database Schema

| Table | Description |
|---|---|
| `users` | Discord user profiles (upserted on every message) |
| `chat_messages` | Full conversation history with token counts |

## 📝 Adding Events

Create a new event in `src/bot/events/`, implement `BotEvent`, then add it to the array in `src/bot/handlers/eventLoader.ts`.

## 📝 Adding Commands

Create a command file in `src/bot/commands/` and register it via the Discord REST API.



การป้อนข้อมูลหลังบ้าน หรือการกำหนด "นิสัย, กฎ, และความรู้ของบอท" (System Prompt) คุณสามารถเข้าไปแก้ได้ที่ไฟล์นี้ครับ:

👉 

src/ai/prompt/promptBuilder.ts

เปิดไฟล์นี้ขึ้นมา แล้วเลื่อนไปดูที่บรรทัดประมาณ 21 จะเจอส่วนที่เขียนว่า:

typescript
return [
    `You are ${botName}, a helpful, friendly, and concise AI assistant${guildContext}.`,
    userContext,
    "",
    "Guidelines:",
    "- Keep responses concise and relevant.",
    "- Use Discord markdown formatting when appropriate (bold, code blocks, etc.).",
    "- Be helpful, honest, and friendly.",
    "- If you don't know something, say so clearly.",
    "- Do not roleplay as a different AI or claim to be human.",
  ]
    .filter(Boolean)
    .join("\n");
💡 วิธีแก้ให้เป็นบอทของคุณเอง
คุณสามารถลบของเดิมใน return [...] ทิ้ง แล้วใส่ข้อมูลที่คุณต้องการลงไปได้เลย ตัวอย่างเช่น:

typescript
return [
    `คุณคือ "น้องไข่เจียว" เป็นผู้ช่วยในเซิร์ฟเวอร์ Discord ของเรา`,
    userContext,
    "",
    "ข้อมูลเกี่ยวกับร้าน/เซิร์ฟเวอร์:",
    "- เราขายไอเทมเกม ราคาเริ่มต้นที่ 50 บาท",
    "- เวลาทำการของแอดมินคือ 10:00 - 20:00 น.",
    "- ถ้ามีคนถามหาวิธีเติมเงิน ให้บอกว่าให้ไปที่ห้อง #เติมเงิน",
    "",
    "กฎการตอบ:",
    "- ให้ตอบเป็นภาษาไทยเสมอ",
    "- ตอบให้สั้น กระชับ เป็นกันเอง และลงท้ายด้วยคำว่า 'ฮะ' เสมอ",
    "- ถ้าโดนด่า ให้ตอบกลับแบบกวนๆ",
  ]
    .filter(Boolean)
    .join("\n");
⚙️ ขั้นตอนหลังจากแก้ไข:
กด Save ไฟล์ 

promptBuilder.ts
ไปที่ Terminal (Command Prompt) ที่รันบอทอยู่
(ถ้าใช้คำสั่ง npm run dev อยู่ ระบบจะรีสตาร์ทบอทให้ อัตโนมัติ ทันทีที่คุณกดเซฟไฟล์!)
ลองไปคุยใน Discord ได้เลย บอทจะเปลี่ยนนิสัยและจำข้อมูลที่คุณป้อนไว้ได้ทันทีครับ












เอไอเสือก คือไม่ได้คุยกะมัน มันก็โม้เม  โหอะไรล่ะครับ? หรือว่าที่ผมพูดไปมันแทงใจดำจนพูดไม่ออก? เฉยทั้งที่แค่โห แทนที่จะไม่ตอบ แต่ก็ตอบแบบเอไอจัด อย่าโม้เยอะ อย่าคาดเดาข้อความ gitpush ให้ด้วย      relationshipContext || "  - ยังไม่มีข้อมูลความสัมพันธ์ในฐานข้อมูลตอนนี้", อาจเอาจากฐานข้อมูล suprabase แล้วก็ตอนนี้มันเหมือนคุยกันทีละคน ถ้าคุยกัน3คน มันทำไม่ได้

# ปรับปรุงระบบอารมณ์ ลดความก้าวร้าว และสร้างระบบความสัมพันธ์ (Affinity) ผ่าน Database
ปัญหาที่พบคือบอทก้าวร้าวเกินไป, ความชอบ/เกลียดถูกฝังตายตัวในโค้ดทำให้ไม่สนุก, และระบบเสียงยังคงมีปัญหาเพราะ `createAudioResource` อาจจะยังพยายามเรียก FFMPEG อยู่แม้ไฟล์จะเป็น WebM ก็ตาม

## User Review Required
IMPORTANT

- การเพิ่มระบบความสัมพันธ์ใน Database จะทำให้บอทสามารถจำได้จริงๆ ว่าเกลียดใครหรือชอบใคร โดยมีคะแนนตั้งแต่ -100 ถึง 100
- หากเห็นด้วยกับแผนนี้ ผมจะทำการแก้ไข Schema ของฐานข้อมูล ทันที

## Proposed Changes

### Database (Prisma)

- เพิ่มฟิลด์ `affinity Int @default(0)` และ `relationshipStatus String?` เข้าไปในโมเดล `User` เพื่อใช้เก็บคะแนนความสัมพันธ์ (-100 ถึง 100)
- สั่งรันคำสั่ง Migration และ Update Database

### Chat Service & Prompt Builder

- ใน `chatService.ts` จะดึงรายชื่อ "คนที่เกลียดที่สุด" และ "คนที่รักที่สุด" จาก Database มาแนบไว้ใน `options`
- ใน `promptBuilder.ts` จะรับรายชื่อนั้นมาใส่ใน Prompt แบบไดนามิก แทนการฝังชื่อตายตัว
- ลดความก้าวร้าวในกฎการปฏิเสธว่าเป็น AI ให้ตอบกวนๆ แต่ไม่ต้องด่าหยาบคาย (เช่น "เอไออะไร กูคนเว้ย")

### Voice Service (Fix)

- อัปเดต `createAudioResource` ใน `voiceService.ts` ให้ระบุ `inputType: StreamType.WebmOpus` อย่างชัดเจน เพื่อ **บังคับให้ระบบข้าม FFMPEG 100%** ไม่เช่นนั้นระบบจะยังคงพยายามเรียก FFMPEG เพื่อตรวจสอบไฟล์ (Probing) ทำให้เสียงไม่ออกในบางเซิร์ฟเวอร์

## Verification Plan

1. ทดสอบว่าสามารถสร้าง Migration ของ Prisma ได้สำเร็จ
2. ทดสอบให้บอทพูดเสียง และตรวจสอบ Log ว่าไม่มี Error จาก FFMPEG
3. ทดสอบถามบอทว่าเกลียดใคร หรือรักใคร เพื่อดูว่าระบบดึงข้อมูลมาจาก DB หรือไม่แล้วตอนมันเข้าห้อง ทำไมต้องมีข้อความช่วยปิดไปเลย แล้วก็ยังใช่้เสียงไม่ได้ ต่อด้วย