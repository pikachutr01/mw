CREATE TABLE "abuse_scan_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"signals_found" integer DEFAULT 0 NOT NULL,
	"players_flagged" integer DEFAULT 0 NOT NULL,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "abuse_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint,
	"kind" text NOT NULL,
	"subject_player_id" bigint,
	"related_player_id" bigint,
	"score" integer NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"window_from" timestamp with time zone,
	"window_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "player_devices" (
	"player_id" bigint NOT NULL,
	"device_id" text NOT NULL,
	"platform" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_ips" (
	"player_id" bigint NOT NULL,
	"ip" text NOT NULL,
	"ip_block_24" text,
	"asn" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"refresh_hash" text NOT NULL,
	"ip" text,
	"ua" text,
	"device_id" text,
	"platform" text,
	"os_version" text,
	"device_model" text,
	"app_version" text,
	"timezone" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "player_devices" ADD CONSTRAINT "player_devices_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ips" ADD CONSTRAINT "player_ips_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_scan_runs_window" ON "abuse_scan_runs" USING btree ("world_id","window_to");--> statement-breakpoint
CREATE INDEX "abuse_signals_pair" ON "abuse_signals" USING btree ("subject_player_id","related_player_id");--> statement-breakpoint
CREATE INDEX "abuse_signals_open" ON "abuse_signals" USING btree ("created_at") WHERE "abuse_signals"."resolved_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "player_devices_pk" ON "player_devices" USING btree ("player_id","device_id");--> statement-breakpoint
CREATE INDEX "player_devices_by_device" ON "player_devices" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_ips_pk" ON "player_ips" USING btree ("player_id","ip");--> statement-breakpoint
CREATE INDEX "player_ips_by_block" ON "player_ips" USING btree ("ip_block_24");--> statement-breakpoint
CREATE INDEX "sessions_account" ON "sessions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_device" ON "sessions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sessions_ip" ON "sessions" USING btree ("ip");