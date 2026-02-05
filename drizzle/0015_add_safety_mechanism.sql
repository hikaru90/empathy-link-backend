CREATE TABLE "crisis_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"region" text,
	"name" text NOT NULL,
	"description" text,
	"phone" text,
	"url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_detection_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_safety_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"appeal_requested_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "safety_detection_events" ADD CONSTRAINT "safety_detection_events_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_safety_flags" ADD CONSTRAINT "user_safety_flags_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crisis_resources_language_idx" ON "crisis_resources" USING btree ("language" text_ops);--> statement-breakpoint
CREATE INDEX "safety_detection_events_user_idx" ON "safety_detection_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "safety_detection_events_detected_idx" ON "safety_detection_events" USING btree ("detected_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "user_safety_flags_user_idx" ON "user_safety_flags" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_safety_flags_level_idx" ON "user_safety_flags" USING btree ("level" int4_ops);