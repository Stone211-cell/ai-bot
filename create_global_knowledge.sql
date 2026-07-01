CREATE TABLE "global_knowledge" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_knowledge_pkey" PRIMARY KEY ("id")
);
