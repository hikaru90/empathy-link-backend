ALTER TABLE "tracked_needs" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "tracked_needs_deleted_idx" ON "tracked_needs" USING btree ("deleted" bool_ops);