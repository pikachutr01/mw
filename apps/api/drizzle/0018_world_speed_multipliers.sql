ALTER TABLE "worlds" ADD COLUMN "training_multiplier" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "construction_multiplier" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "worlds" SET "speed_multiplier" = 1, "resource_multiplier" = 1;