CREATE TABLE IF NOT EXISTS "user_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_user_idx" ON "user_feedback" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_type_idx" ON "user_feedback" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_created_idx" ON "user_feedback" USING btree ("created");
