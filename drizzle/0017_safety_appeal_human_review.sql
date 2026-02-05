-- Add human review fields for safety appeals
ALTER TABLE "user_safety_flags" ADD COLUMN IF NOT EXISTS "appeal_status" text;
--> statement-breakpoint
ALTER TABLE "user_safety_flags" ADD COLUMN IF NOT EXISTS "appeal_reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "user_safety_flags" ADD COLUMN IF NOT EXISTS "appeal_reviewed_by" text;
