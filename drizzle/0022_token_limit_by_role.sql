CREATE TABLE "token_limit_by_role" (
	"role" text PRIMARY KEY NOT NULL,
	"daily_limit" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "token_limit_by_role" ("role", "daily_limit") VALUES ('user', 100000), ('admin', 400000) ON CONFLICT ("role") DO NOTHING;
