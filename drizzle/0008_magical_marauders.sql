CREATE TABLE "blind_spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"analysis" text NOT NULL,
	"patterns" text,
	"situations" text,
	"advice" text,
	"last_chat_created_date" timestamp NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blind_spots" ADD CONSTRAINT "blind_spots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blind_spots_user_idx" ON "blind_spots" USING btree ("user_id" text_ops);