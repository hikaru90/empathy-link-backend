CREATE TABLE "user_feedback" (
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
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_feedback_user_idx" ON "user_feedback" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_feedback_type_idx" ON "user_feedback" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "user_feedback_created_idx" ON "user_feedback" USING btree ("created" timestamp_ops);