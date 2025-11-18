CREATE TABLE "learn_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text,
	"description_de" text,
	"description_en" text,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learn_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "learn_topic_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"category_id" uuid,
	"version_label" text,
	"title_de" text NOT NULL,
	"title_en" text,
	"description_de" text,
	"description_en" text,
	"language" text DEFAULT 'de' NOT NULL,
	"image" text,
	"content" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_by" text,
	"notes" text,
	"metadata" jsonb,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learn_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"difficulty" text,
	"level" text,
	"estimated_minutes" integer,
	"summary_de" text,
	"summary_en" text,
	"cover_image" text,
	"current_version_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"tags" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learn_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "learn_topic_versions" ADD CONSTRAINT "learn_topic_versions_topic_id_learn_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learn_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_topic_versions" ADD CONSTRAINT "learn_topic_versions_category_id_learn_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."learn_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_topics" ADD CONSTRAINT "learn_topics_category_id_learn_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."learn_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learn_categories_order_idx" ON "learn_categories" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "learn_topic_versions_topic_idx" ON "learn_topic_versions" USING btree ("topic_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "learn_topic_versions_category_idx" ON "learn_topic_versions" USING btree ("category_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "learn_topics_category_idx" ON "learn_topics" USING btree ("category_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "learn_topics_order_idx" ON "learn_topics" USING btree ("sort_order" int4_ops);