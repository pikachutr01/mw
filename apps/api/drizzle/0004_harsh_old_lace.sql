CREATE TABLE "defenses" (
	"city_id" bigint NOT NULL,
	"type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"city_id" bigint NOT NULL,
	"player_id" bigint NOT NULL,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"target_level" smallint,
	"count" integer,
	"started_at" timestamp with time zone NOT NULL,
	"finish_at" timestamp with time zone NOT NULL,
	"spent_gold" numeric(20, 6) DEFAULT '0' NOT NULL,
	"spent_food" numeric(20, 6) DEFAULT '0' NOT NULL,
	"mission_id" bigint,
	"canceled_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "techs" (
	"player_id" bigint NOT NULL,
	"type" text NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"city_id" bigint NOT NULL,
	"type" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "defenses" ADD CONSTRAINT "defenses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "techs" ADD CONSTRAINT "techs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "defenses_pk" ON "defenses" USING btree ("city_id","type");--> statement-breakpoint
CREATE INDEX "queues_city_open" ON "queues" USING btree ("city_id","finish_at") WHERE "queues"."completed_at" IS NULL AND "queues"."canceled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "queues_player" ON "queues" USING btree ("player_id","finish_at");--> statement-breakpoint
CREATE UNIQUE INDEX "techs_pk" ON "techs" USING btree ("player_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "units_pk" ON "units" USING btree ("city_id","type");