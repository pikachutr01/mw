ALTER TABLE "queues" ADD COLUMN "done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN "per_unit_seconds" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN "position" smallint DEFAULT 1 NOT NULL;