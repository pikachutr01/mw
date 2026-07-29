-- ⭐ SUR ONARIM İLERLEMESİ (2026-07-29)
-- Onarım sürerken gelen saldırıyı sur, o ana kadar onarılmış yüzdeyle karşılamalı. Bunun için
-- bitiş anı yetmiyor, BAŞLANGIÇ anı da gerekiyor (`wallCurrentIntegrity` ikisi arasında doğrusal
-- ilerliyor). Eskiden sur onarımda hep savaş-sonrası değerle savaşıyordu.
ALTER TABLE "cities" ADD COLUMN "wall_repair_from" timestamp with time zone;--> statement-breakpoint
-- Sürmekte olan onarımların başlangıcı bilinmiyor; "şimdi" saymak sur'u olduğundan güçlü
-- göstermez — o onarımlar yalnız ilerlemesiz başlar. Yeni savaşlarda alan doğru dolar.
UPDATE "cities" SET "wall_repair_from" = now() WHERE "wall_repair_until" IS NOT NULL;
