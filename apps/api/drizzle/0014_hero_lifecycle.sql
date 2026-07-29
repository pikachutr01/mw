-- ⭐ KAHRAMAN YAŞAM DÖNGÜSÜ (2026-07-29)
-- `dead_until` (kendiliğinden dolan kurtarma sayacı) yerini ÜCRETLİ + İPTAL EDİLEBİLİR
-- diriltmeye bırakıyor. Durum sözlüğü istemcinin kendi metinlerinden:
-- Şehirde / Görevde / Ölü / Diriltiliyor / Yok Edildi (`g.java`: "Dirilt", "Diriltmeyi Durdur").
-- Kolon 0015'te düşürülüyor; aradaki UPDATE eski veriyi taşır.
ALTER TABLE "heroes" ADD COLUMN "status" text DEFAULT 'alive' NOT NULL;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "revive_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "heroes" ADD COLUMN "destroyed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "heroes_status" ON "heroes" USING btree ("status");--> statement-breakpoint
-- Devam eden eski kurtarma sayaçları "diriltiliyor" sayılır (ücret geriye dönük alınmaz).
UPDATE "heroes" SET "status" = 'reviving', "revive_until" = "dead_until"
 WHERE "dead_until" IS NOT NULL;
