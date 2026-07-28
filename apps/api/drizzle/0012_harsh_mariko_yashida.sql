CREATE TABLE "cave_units" (
	"city_id" bigint NOT NULL,
	"type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "cave_repair_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cave_units" ADD CONSTRAINT "cave_units_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cave_units_pk" ON "cave_units" USING btree ("city_id","type");