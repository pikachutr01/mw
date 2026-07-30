CREATE TABLE "alliance_invites" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"alliance_id" bigint NOT NULL,
	"player_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"created_by" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" bigint
);
--> statement-breakpoint
CREATE TABLE "alliances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"name" text NOT NULL,
	"leader_id" bigint NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "alliance_role" smallint;--> statement-breakpoint
ALTER TABLE "alliance_invites" ADD CONSTRAINT "alliance_invites_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliance_invites" ADD CONSTRAINT "alliance_invites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliances" ADD CONSTRAINT "alliances_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alliances" ADD CONSTRAINT "alliances_leader_id_players_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alliance_invites_pending" ON "alliance_invites" USING btree ("alliance_id","player_id","kind") WHERE "alliance_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "alliance_invites_player" ON "alliance_invites" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alliances_world_name" ON "alliances" USING btree ("world_id",lower("name"));--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_alliance_id_alliances_id_fk" FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "players_alliance" ON "players" USING btree ("world_id","alliance_id");