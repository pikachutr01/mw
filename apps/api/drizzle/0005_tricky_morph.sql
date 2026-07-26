CREATE TABLE "player_blocks" (
	"world_id" smallint NOT NULL,
	"player_id" bigint NOT NULL,
	"blocked_player_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_blocks" ADD CONSTRAINT "player_blocks_blocked_player_id_players_id_fk" FOREIGN KEY ("blocked_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_blocks_pk" ON "player_blocks" USING btree ("player_id","blocked_player_id");--> statement-breakpoint
CREATE INDEX "player_blocks_target" ON "player_blocks" USING btree ("blocked_player_id");