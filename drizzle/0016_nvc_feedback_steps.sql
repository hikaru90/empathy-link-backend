ALTER TABLE "user_feedback" ALTER COLUMN "title" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_feedback" ALTER COLUMN "message" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN IF NOT EXISTS "observation" text;
--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN IF NOT EXISTS "feelings" text;
--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN IF NOT EXISTS "needs" text;
--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN IF NOT EXISTS "request" text;
