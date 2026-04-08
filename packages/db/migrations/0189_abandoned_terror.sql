ALTER TABLE "workflow" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_folder" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;