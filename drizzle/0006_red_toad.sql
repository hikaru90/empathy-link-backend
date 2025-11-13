ALTER TABLE "analyses" ADD COLUMN "request_resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "request_archived" boolean DEFAULT false NOT NULL;