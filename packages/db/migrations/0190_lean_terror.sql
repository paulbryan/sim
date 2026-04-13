ALTER TABLE "copilot_async_tool_calls" ADD COLUMN "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD COLUMN "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "copilot_feedback" ADD COLUMN "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "copilot_run_checkpoints" ADD COLUMN "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "mothership_inbox_task" ADD COLUMN "redacted_at" timestamp;