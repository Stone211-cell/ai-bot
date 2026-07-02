// prisma.config.ts — Prisma CLI configuration
import "dotenv/config";
import type { PrismaConfig } from "prisma";

export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
} satisfies PrismaConfig;

