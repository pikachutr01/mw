CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"ui_theme" text DEFAULT 'system' NOT NULL,
	"ui_locale" text DEFAULT 'tr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"failed_logins" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"city_id" bigint NOT NULL,
	"type" text NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_bans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"player_id" bigint NOT NULL,
	"scope" text NOT NULL,
	"until" timestamp with time zone,
	"reason" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_channels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"kind" text NOT NULL,
	"alliance_id" bigint,
	"dm_key" text,
	"slow_mode_s" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel_id" bigint NOT NULL,
	"world_id" smallint NOT NULL,
	"sender_id" bigint,
	"body" text NOT NULL,
	"client_msg_id" uuid,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" bigint
);
--> statement-breakpoint
CREATE TABLE "chat_participants" (
	"channel_id" bigint NOT NULL,
	"player_id" bigint NOT NULL,
	"last_read_message_id" bigint DEFAULT 0 NOT NULL,
	"muted_until" timestamp with time zone,
	"notify" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"player_id" bigint NOT NULL,
	"name" text NOT NULL,
	"k" integer NOT NULL,
	"d" integer NOT NULL,
	"s" integer NOT NULL,
	"is_capital" boolean DEFAULT false NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"food" bigint DEFAULT 0 NOT NULL,
	"resources_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"account_id" bigint NOT NULL,
	"username" text NOT NULL,
	"score" bigint DEFAULT 0 NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"protected_until" timestamp with time zone,
	"vacation_until" timestamp with time zone,
	"alliance_id" bigint,
	"banned_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"clock_offset_ms" bigint DEFAULT 0 NOT NULL,
	"speed_multiplier" integer DEFAULT 1 NOT NULL,
	"catalog_hash" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_bans" ADD CONSTRAINT "chat_bans_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_pk" ON "buildings" USING btree ("city_id","type");--> statement-breakpoint
CREATE INDEX "chat_bans_player" ON "chat_bans" USING btree ("player_id","until");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_world_dm" ON "chat_channels" USING btree ("world_id","dm_key");--> statement-breakpoint
CREATE INDEX "chat_channels_world_kind" ON "chat_channels" USING btree ("world_id","kind");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_id_desc" ON "chat_messages" USING btree ("channel_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_client_msg" ON "chat_messages" USING btree ("channel_id","client_msg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_participants_pk" ON "chat_participants" USING btree ("channel_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cities_world_coords" ON "cities" USING btree ("world_id","k","d","s");--> statement-breakpoint
CREATE INDEX "cities_player" ON "cities" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_world_username" ON "players" USING btree ("world_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "players_world_account" ON "players" USING btree ("world_id","account_id");--> statement-breakpoint
CREATE INDEX "players_world_score" ON "players" USING btree ("world_id","score");