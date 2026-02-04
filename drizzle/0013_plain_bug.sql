ALTER TABLE "tracked_needs" ADD COLUMN IF NOT EXISTS "strategies" text;--> statement-breakpoint
ALTER TABLE "tracked_needs" ADD COLUMN IF NOT EXISTS "doneStrategies" text;