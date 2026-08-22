-- ⭐⭐ ÖZEL MESAJ İSTEĞİ (kullanıcı, 2026-08-22)
--
-- *"Bir oyuncu başka bir oyuncuya ilk mesaj gönderdiğinde veya mesaj geçmişini sildikten
-- sonra ilk mesaj gönderdiğinde sohbet penceresini açınca karşı oyuncunun gönderdiği mesajı
-- anında görmesin. Pencerede «bu oyuncu sana mesaj göndermek istiyor, onaylıyor musun»
-- şeklinde bir soru çıksın. Onaylarsa görür, Sil derse mesaj silinir, Engelle tıklarsa da
-- diğer oyuncuyu engeller."*
--
-- ─ ⚠️ KURAL ONAYINDAN (0052) FARKLI BİR ŞEY ──────────────────────────────────────────────
-- 0052 GÖNDERENİ kapıya alıyor: kuralları onaylamadan yazamazsın. Bu ise ALICIYI koruyor:
-- tanımadığın birinin mesajı sana zorla okutulmuyor. İkisi ayrı kolonlarda çünkü ayrı
-- sorulara cevap veriyorlar ve biri diğerinin yerine geçemez.
--
-- ─ ⚠️ NEDEN `chat_participants` ──────────────────────────────────────────────────────────
-- Durum kanal × oyuncu ikilisine ait: aynı kanalda A kabul etmiş, B etmemiş olabilir.
-- `dm_key` yeterli olmazdı çünkü onay YÖNLÜ.
--
-- ─ ⚠️ NEDEN `timestamptz`, `boolean` değil ───────────────────────────────────────────────
-- `read_at` · `favorited_at` ile aynı aile: "kabul edildi mi" kadar "ne zaman" da kayıt
-- değeri taşıyor ve NULL zaten "kabul edilmedi" demek.

ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS dm_accepted_at timestamptz;

COMMENT ON COLUMN chat_participants.dm_accepted_at IS
  'Bu oyuncunun bu yazışmayı KABUL ettiği an. NULL = gelen mesajlar istek olarak bekliyor. '
  'Geçmişi silmek NULL''a çeker: silen oyuncuya yeniden sorulur.';

-- ⚠️⚠️ MEVCUT YAZIŞMALAR KABUL EDİLMİŞ SAYILIYOR. Aksi hâlde göç uygulandığı anda süregelen
-- her sohbet birden "bu oyuncu sana mesaj göndermek istiyor" ekranına dönerdi — yıllardır
-- yazışan iki oyuncu için saçma ve güveni sarsıcı olurdu. Kural yalnız BUNDAN SONRAKİ yeni
-- yazışmalarda işliyor.
UPDATE chat_participants SET dm_accepted_at = now() WHERE dm_accepted_at IS NULL;
