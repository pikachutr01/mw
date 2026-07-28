CREATE TABLE "ranking_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" smallint NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankings" (
	"world_id" smallint NOT NULL,
	"kind" text NOT NULL,
	"subject_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"prev_rank" integer,
	"score" bigint DEFAULT 0 NOT NULL,
	"taken_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "score_base" numeric(24, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_runs_world_taken" ON "ranking_runs" USING btree ("world_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rankings_pk" ON "rankings" USING btree ("world_id","kind","subject_id");--> statement-breakpoint
CREATE INDEX "rankings_order" ON "rankings" USING btree ("world_id","kind","rank");