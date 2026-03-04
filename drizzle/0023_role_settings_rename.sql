ALTER TABLE "token_limit_by_role" RENAME TO "role_settings";
--> statement-breakpoint
ALTER TABLE "role_settings" RENAME COLUMN "daily_limit" TO "daily_token_limit";
