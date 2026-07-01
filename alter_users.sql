ALTER TABLE "users" ADD COLUMN "summary" TEXT;
ALTER TABLE "users" ADD COLUMN "msg_count_since_summary" INTEGER NOT NULL DEFAULT 0;
