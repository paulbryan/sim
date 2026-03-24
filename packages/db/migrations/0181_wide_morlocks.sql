CREATE TYPE "public"."agent_platform" AS ENUM('slack');--> statement-breakpoint
CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"is_deployed" boolean DEFAULT false NOT NULL,
	"deployed_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"platform" "agent_platform" NOT NULL,
	"external_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"platform" "agent_platform" NOT NULL,
	"credential_id" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployment" ADD CONSTRAINT "agent_deployment_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployment" ADD CONSTRAINT "agent_deployment_credential_id_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_workspace_id_idx" ON "agent" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_created_by_idx" ON "agent" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_workspace_name_unique" ON "agent" USING btree ("workspace_id","name") WHERE "agent"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_conversation_agent_id_idx" ON "agent_conversation" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_conversation_unique" ON "agent_conversation" USING btree ("agent_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "agent_deployment_agent_id_idx" ON "agent_deployment" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_deployment_platform_idx" ON "agent_deployment" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "agent_deployment_credential_id_idx" ON "agent_deployment" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_deployment_agent_platform_unique" ON "agent_deployment" USING btree ("agent_id","platform");