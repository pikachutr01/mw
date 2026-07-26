CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint,
	"player_id" bigint,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" bigint,
	"before" jsonb,
	"after" jsonb,
	"trace_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_units" (
	"mission_id" bigint NOT NULL,
	"unit_type" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"owner_player_id" bigint,
	"origin_city_id" bigint,
	"target_city_id" bigint,
	"target_k" integer,
	"target_d" integer,
	"target_s" integer,
	"execute_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"idempotency_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mission_units" ADD CONSTRAINT "mission_units_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_player" ON "audit_log" USING btree ("player_id","at");--> statement-breakpoint
CREATE INDEX "audit_entity" ON "audit_log" USING btree ("entity","entity_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_units_pk" ON "mission_units" USING btree ("mission_id","unit_type");--> statement-breakpoint
CREATE INDEX "missions_due" ON "missions" USING btree ("execute_at","id") WHERE "missions"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "missions_stale" ON "missions" USING btree ("locked_at") WHERE "missions"."status" = 'running';--> statement-breakpoint
CREATE INDEX "missions_target_city" ON "missions" USING btree ("target_city_id","execute_at");--> statement-breakpoint
CREATE INDEX "missions_owner" ON "missions" USING btree ("owner_player_id","execute_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_idempotency" ON "missions" USING btree ("world_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_pending" ON "outbox" USING btree ("id") WHERE "outbox"."dispatched_at" IS NULL;