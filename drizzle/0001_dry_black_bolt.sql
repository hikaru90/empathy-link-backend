CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text,
	"title" text NOT NULL,
	"observation" text,
	"feelings" text,
	"needs" text,
	"request" text,
	"sentiment_polarity" real,
	"intensity_ratio" real,
	"emotional_balance" real,
	"trigger_count" integer,
	"resolution_count" integer,
	"escalation_rate" real,
	"empathy_rate" real,
	"message_length" real,
	"readability_score" real,
	"emotional_shift" text,
	"i_statement_muscle" real,
	"clarity_of_ask" text,
	"empathy_attempt" boolean,
	"feeling_vocabulary" integer,
	"daily_win" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_evals" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"evaluation" text NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"helpfulness" integer,
	"understanding" boolean,
	"new_insights" boolean,
	"would_recommend" boolean,
	"best_aspects" text,
	"improvements" text,
	"additional_comments" text,
	"automatic_analysis" text,
	"conversation_quality" integer,
	"nvc_compliance" integer,
	"orchestrator_effectiveness" integer,
	"path_switches" integer,
	"total_messages" integer,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module" text DEFAULT 'selfempathy' NOT NULL,
	"history" text,
	"feelings" text,
	"needs" text,
	"memory_processed" boolean DEFAULT false,
	"analyzed" boolean DEFAULT false,
	"analysis_id" text,
	"path_state" text,
	"feedback_received" boolean DEFAULT false,
	"feedback_received_at" timestamp,
	"feedback_id" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "errors" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text,
	"trace" text,
	"user_id" text,
	"name" text,
	"stack" text,
	"url" text,
	"pathname" text,
	"search_params" text,
	"user_agent" text,
	"language" text,
	"platform" text,
	"source" text,
	"type" text,
	"severity" text,
	"error_string" text,
	"error_constructor" text,
	"viewport_width" integer,
	"viewport_height" integer,
	"timezone_offset" integer,
	"cookie_enabled" boolean,
	"online" boolean,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text,
	"expected_behavior" text,
	"actual_behavior" text,
	"reproducable_steps" text,
	"screenshots" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feelings" (
	"id" text PRIMARY KEY NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text NOT NULL,
	"category" text,
	"positive" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gardens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"current_weather" text DEFAULT 'sunny',
	"grid_data" text,
	"last_weather_update" timestamp,
	"total_plants" integer DEFAULT 0,
	"garden_level" integer DEFAULT 1,
	"is_public" boolean DEFAULT false,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'flower',
	"terraform_type" text,
	"seed_cost" integer DEFAULT 0,
	"description" text,
	"rarity" text,
	"is_active" boolean DEFAULT true,
	"sprite" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learn_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"topic_version_id" text NOT NULL,
	"current_page" integer DEFAULT 0,
	"responses" text,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"feedback" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"confidence" text NOT NULL,
	"type" text NOT NULL,
	"priority" real DEFAULT 1 NOT NULL,
	"key" text,
	"value" text NOT NULL,
	"embedding" vector(768),
	"chat_id" text,
	"relevance_score" real DEFAULT 1 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_extraction_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"from_user_id" text,
	"type" text DEFAULT 'status' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"priority" integer DEFAULT 1,
	"reminder_data" text,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text NOT NULL,
	"category" text,
	"sort" integer DEFAULT 0,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_visibility" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ai_answer_length" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tone_of_voice" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nvc_knowledge" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_evals" ADD CONSTRAINT "chat_evals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errors" ADD CONSTRAINT "errors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gardens" ADD CONSTRAINT "gardens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_sessions" ADD CONSTRAINT "learn_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_extraction_queue" ADD CONSTRAINT "memory_extraction_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_user_idx" ON "analyses" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "analyses_chat_idx" ON "analyses" USING btree ("chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "chat_evals_chat_idx" ON "chat_evals" USING btree ("chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "chat_evals_user_idx" ON "chat_evals" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "chat_feedback_chat_idx" ON "chat_feedback" USING btree ("chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "chat_feedback_user_idx" ON "chat_feedback" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "chats_user_idx" ON "chats" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "chats_module_idx" ON "chats" USING btree ("module" text_ops);--> statement-breakpoint
CREATE INDEX "errors_user_idx" ON "errors" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "errors_severity_idx" ON "errors" USING btree ("severity" text_ops);--> statement-breakpoint
CREATE INDEX "errors_created_idx" ON "errors" USING btree ("created" timestamp_ops);--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created" timestamp_ops);--> statement-breakpoint
CREATE INDEX "feelings_category_idx" ON "feelings" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "feelings_positive_idx" ON "feelings" USING btree ("positive" bool_ops);--> statement-breakpoint
CREATE INDEX "feelings_sort_idx" ON "feelings" USING btree ("sort" int4_ops);--> statement-breakpoint
CREATE INDEX "gardens_user_idx" ON "gardens" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "gardens_public_idx" ON "gardens" USING btree ("is_public" bool_ops);--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "items_active_idx" ON "items" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "items_rarity_idx" ON "items" USING btree ("rarity" text_ops);--> statement-breakpoint
CREATE INDEX "learn_sessions_user_idx" ON "learn_sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "learn_sessions_topic_idx" ON "learn_sessions" USING btree ("topic_id" text_ops);--> statement-breakpoint
CREATE INDEX "learn_sessions_completed_idx" ON "learn_sessions" USING btree ("completed" bool_ops);--> statement-breakpoint
CREATE INDEX "embedding_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "expiry_idx" ON "memories" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "user_relevance_idx" ON "memories" USING btree ("user_id" text_ops,"relevance_score" text_ops);--> statement-breakpoint
CREATE INDEX "user_type_idx" ON "memories" USING btree ("user_id" text_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "memory_extraction_queue_user_idx" ON "memory_extraction_queue" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "memory_extraction_queue_status_idx" ON "memory_extraction_queue" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "messages_user_idx" ON "messages" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "messages_type_idx" ON "messages" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "messages_read_idx" ON "messages" USING btree ("read" bool_ops);--> statement-breakpoint
CREATE INDEX "messages_scheduled_idx" ON "messages" USING btree ("scheduled_for" timestamp_ops);--> statement-breakpoint
CREATE INDEX "needs_category_idx" ON "needs" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "needs_sort_idx" ON "needs" USING btree ("sort" int4_ops);