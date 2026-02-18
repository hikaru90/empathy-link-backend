CREATE TABLE "token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"chat_id" text,
	"application" text DEFAULT 'web' NOT NULL,
	"context" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost" real DEFAULT 0 NOT NULL,
	"metadata" text,
	"created" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" DROP CONSTRAINT "email_templates_current_version_id_email_template_versions_id_fk";
--> statement-breakpoint
CREATE INDEX "token_usage_user_idx" ON "token_usage" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "token_usage_chat_idx" ON "token_usage" USING btree ("chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "token_usage_app_idx" ON "token_usage" USING btree ("application" text_ops);--> statement-breakpoint
CREATE INDEX "token_usage_created_idx" ON "token_usage" USING btree ("created" timestamp_ops);