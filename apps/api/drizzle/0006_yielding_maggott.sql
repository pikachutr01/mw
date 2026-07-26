CREATE TABLE "battles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"mission_id" bigint,
	"attacker_player_id" bigint,
	"defender_player_id" bigint,
	"attacker_city_id" bigint,
	"defender_city_id" bigint,
	"at" timestamp with time zone NOT NULL,
	"winner" text NOT NULL,
	"night" boolean DEFAULT false NOT NULL,
	"rng_seed" bigint NOT NULL,
	"engine_version" text NOT NULL,
	"catalog_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heroes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"player_id" bigint NOT NULL,
	"city_id" bigint,
	"name" text NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"f_atk" integer DEFAULT 0 NOT NULL,
	"f_def" integer DEFAULT 0 NOT NULL,
	"m_atk" integer DEFAULT 0 NOT NULL,
	"m_def" integer DEFAULT 0 NOT NULL,
	"dead_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"player_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"side" text,
	"battle_id" bigint,
	"mission_id" bigint,
	"subject" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_heroes" (
	"mission_id" bigint NOT NULL,
	"hero_id" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_heroes" ADD CONSTRAINT "mission_heroes_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_heroes" ADD CONSTRAINT "mission_heroes_hero_id_heroes_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "battles_mission" ON "battles" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "battles_defender" ON "battles" USING btree ("defender_player_id","at");--> statement-breakpoint
CREATE INDEX "battles_attacker" ON "battles" USING btree ("attacker_player_id","at");--> statement-breakpoint
CREATE INDEX "heroes_player" ON "heroes" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "heroes_city" ON "heroes" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "messages_player" ON "messages" USING btree ("player_id","id");--> statement-breakpoint
CREATE INDEX "messages_unread" ON "messages" USING btree ("player_id") WHERE "messages"."read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mission_heroes_pk" ON "mission_heroes" USING btree ("mission_id","hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_heroes_hero" ON "mission_heroes" USING btree ("hero_id");