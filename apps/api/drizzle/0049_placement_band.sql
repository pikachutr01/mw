-- ⭐⭐ YERLEŞİM: KUŞAK (BANT) CEPHESİ (kullanıcı, 2026-08-16)
--
-- Yeni oyuncular uzak diyarlara düşüyordu. Ölçüldü (gerçek `PlacementService`, canlı veri,
-- 300 sanal kayıt): **%88,7'si diyar 9+**. Diyar 1, 3 ve 7 hiç seçilmiyordu.
--
-- Sebep 2026-08-08 onarımının fazla düzeltmesiydi: cephe her zaman açık tutuluyordu
-- (`emptyReserve` 12 boş diyar garantisi) ve komşuluk hedefi 1'di, yani 3-4 oyunculu bir
-- diyar pratikte yasaklanıyordu. Üstelik kendini besliyordu: cephe = «dolu diyar + rezerv»
-- olduğu için geçmişte oluşan saçılma cepheyi genişletiyor, geniş cephe daha çok saçılma
-- üretiyordu.
--
-- ⭐ YENİ KURAL: cephe **nüfusa değil DOYGUNLUĞA** göre ilerler. Dünya 5 diyarlık bantlara
-- bölünür; yeni başkentler o an açık olan bandın içine RASTGELE dağıtılır, bant doyunca bir
-- sonraki bant açılır.
--
-- ⚠️⚠️ **BU SÜTUN «GERİ DÖNÜLMEZ» KURALININ TEK GARANTİSİ.** Açık bant veriden türetilseydi
-- (ilk uygun diyarı olan bant), bant 1'deki bir şehir silinince cephe geri açılırdı. İki
-- zararı olurdu: (1) kuşak ayrımı bozulur — yeni oyuncu, çoktan güçlenmiş 1. kuşağın arasına
-- düşer; (2) hesap silip prim slot boşaltma açığı doğar. Bu yüzden ulaşılan en yüksek bant
-- KALICI olarak burada tutuluyor ve yalnız ileri gider (`GREATEST`).
--
-- ⚠️ Varsayılan 1: mevcut dünyalar 1. banttan başlar ve `PlacementService` ilk çağrıda
-- gerçek doygunluğa göre ilerletir. Geriye dönük veri düzeltmesi GEREKMİYOR.

ALTER TABLE "worlds"
  ADD COLUMN IF NOT EXISTS "placement_band" smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN "worlds"."placement_band" IS
  'Yerleşimde ulaşılmış en yüksek kuşak (bant). Yalnız ileri gider — şehir silinse bile geri dönülmez.';
