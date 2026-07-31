CREATE TABLE "chat_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"channel_id" bigint NOT NULL,
	"message_id" bigint,
	"reporter_id" bigint NOT NULL,
	"reported_player_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"body_snapshot" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" bigint,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "chat_participants" ADD COLUMN "cleared_before_message_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_players_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_reports_open" ON "chat_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "chat_reports_target" ON "chat_reports" USING btree ("reported_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reports_once" ON "chat_reports" USING btree ("reporter_id","message_id") WHERE "chat_reports"."message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_participants_player" ON "chat_participants" USING btree ("player_id");