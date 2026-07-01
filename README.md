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
