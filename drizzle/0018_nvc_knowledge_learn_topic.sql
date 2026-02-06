-- Add learn topic linkage to nvc_knowledge for teach path recommendations
ALTER TABLE "nvc_knowledge" ADD COLUMN IF NOT EXISTS "learn_topic_id" uuid REFERENCES "learn_topics"("id") ON DELETE SET NULL;
ALTER TABLE "nvc_knowledge" ADD COLUMN IF NOT EXISTS "learn_topic_version_id" uuid REFERENCES "learn_topic_versions"("id") ON DELETE SET NULL;
