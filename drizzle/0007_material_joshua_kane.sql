CREATE TABLE "need_fill_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_need_id" uuid NOT NULL,
	"fill_level" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "need_fill_levels_tracked_need_date_unique" UNIQUE("tracked_need_id","date")
);
--> statement-breakpoint
CREATE TABLE "tracked_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"need_id" text NOT NULL,
	"need_name" text NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_needs_user_need_unique" UNIQUE("user_id","need_id")
);
--> statement-breakpoint
ALTER TABLE "need_fill_levels" ADD CONSTRAINT "need_fill_levels_tracked_need_id_tracked_needs_id_fk" FOREIGN KEY ("tracked_need_id") REFERENCES "public"."tracked_needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_needs" ADD CONSTRAINT "tracked_needs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_needs" ADD CONSTRAINT "tracked_needs_need_id_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."needs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "need_fill_levels_tracked_need_idx" ON "need_fill_levels" USING btree ("tracked_need_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "need_fill_levels_date_idx" ON "need_fill_levels" USING btree ("date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "tracked_needs_user_idx" ON "tracked_needs" USING btree ("user_id" text_ops);