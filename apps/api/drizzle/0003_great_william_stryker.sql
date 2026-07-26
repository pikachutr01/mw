ALTER TABLE "cities" ALTER COLUMN "gold" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "gold" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "food" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "food" SET DEFAULT '0';