ALTER TABLE "cities" ADD COLUMN "wall_integrity" numeric(6, 4) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "wall_repair_until" timestamp with time zone;