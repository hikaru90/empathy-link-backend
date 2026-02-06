-- Add learn_topic_slug and pocketbase_version_id for PocketBase sync
ALTER TABLE "nvc_knowledge" ADD COLUMN IF NOT EXISTS "learn_topic_slug" text;
ALTER TABLE "nvc_knowledge" ADD COLUMN IF NOT EXISTS "pocketbase_version_id" text;
