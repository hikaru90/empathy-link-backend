CREATE TABLE "nvc_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_id" uuid,
	"language" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"category" text NOT NULL,
	"subcategory" text,
	"source" text,
	"tags" text[],
	"priority" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "nvc_knowledge_embedding_idx" ON "nvc_knowledge" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "nvc_knowledge_category_idx" ON "nvc_knowledge" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "nvc_knowledge_language_idx" ON "nvc_knowledge" USING btree ("language" text_ops);--> statement-breakpoint
CREATE INDEX "nvc_knowledge_knowledge_id_idx" ON "nvc_knowledge" USING btree ("knowledge_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "nvc_knowledge_is_active_idx" ON "nvc_knowledge" USING btree ("is_active" bool_ops);