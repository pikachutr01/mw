-- ⭐⭐ PUAN ARTIK TAMAMLANINCA YAZILIYOR (kullanıcı, 2026-08-16)
--
-- Bir oyuncu bildirdi: *"yükseltmelerle alınması gereken puan tamamlanmadan önce veriliyor."*
-- Doğruydu. `queue.service.spend()` kaynağı düşerken puanı da AYNI ANDA yazıyordu, yani
-- 1000 asker sipariş eden oyuncu 1000 askerin puanını anında alıyordu.
--
-- Canlıda ölçüldü (score_base ile holdingsValue karşılaştırması):
--   barbossa  görünen 54, tamamlanmışın karşılığı 48   (fark 5.184 = açık kuyruk)
--   BARON     görünen 15, tamamlanmışın karşılığı 12   (fark 2.880 = açık kuyruk)
-- Fark, açık kuyruğun bedeline kuruşu kuruşuna eşitti.
--
-- ⚠️ Etkisi yalnız sıralama değil: puan **10 kat saldırı kuralında** ve **ganimet fark
-- çarpanında** da kullanılıyor. Sipariş vererek puanını şişiren oyuncu aynı anda kendini
-- saldırıdan koruyor ve ganimet hesabını değiştiriyordu.
--
-- ⭐ YENİ KURAL:
--   • Yapı ve teknik: puan TAMAMLANINCA yazılır.
--   • Toplu asker/savunma: puan üretilen BİRİM BAŞINA yazılır (kullanıcı: "üretimi bittiği
--     kadar askerin sıralama hesaplanırken hesaba katılması gerekir").
--   • İptal: puan VERİLMEZ. Kullanıcı kararı: son anda iptal edip iptal cezası yüzünden
--     kaynağın neredeyse tamamını kaybetse bile puan yazılmaz.
--
-- ⚠️⚠️ **BU SÜTUN OLMADAN MEVCUT SİPARİŞLER ÇİFTE PUAN ALIR.** Dağıtım anında açık olan
-- satırlar puanlarını sipariş anında ALMIŞTI; yeni kod tamamlanınca bir kez daha yazardı.
-- Bu yüzden sütun "bu satır şimdiye kadar ne kadar puan yazdırdı" anlamına geliyor ve
-- geçmiş satırlar için ödenen tutarın tamamıyla dolduruluyor:
--   • tamamlanınca yazılacak puan = ödenen − score_credited  → eski satırlarda 0
--   • iptalde geri alınacak puan  = score_credited − üretilmiş olanın karşılığı
--
-- ⚠️ İptal edilmiş ve tamamlanmış satırlar da dolduruluyor: ikisi de artık işlem görmüyor,
-- ama sütunun anlamı "yazdırdığı puan" olduğu için geçmişte yazdırdıkları doğru kalmalı.
-- Tek istisna iptal edilenlerin iade edilmiş kısmı; onu geri hesaplamak mümkün değil ve
-- gerekmiyor, çünkü o satırlar bir daha hiçbir koda girmiyor.

ALTER TABLE "queues"
  ADD COLUMN IF NOT EXISTS "score_credited" numeric(24,6) NOT NULL DEFAULT 0;

-- Geçmiş satırlar: puanları sipariş anında ödenen tutarın TAMAMI kadar yazılmıştı.
UPDATE "queues"
   SET "score_credited" = "spent_gold" + "spent_food"
 WHERE "score_credited" = 0;

COMMENT ON COLUMN "queues"."score_credited" IS
  'Bu kuyruk satırının score_base''e şimdiye kadar yazdırdığı toplam. Tamamlanma ve iptal bunun üzerinden fark hesaplar.';
