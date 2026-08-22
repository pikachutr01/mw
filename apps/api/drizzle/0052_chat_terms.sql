-- ⭐⭐ SOHBET KURALLARININ ONAYI (kullanıcı, 2026-08-21: *"DM ve ittifak sohbetinde ilk
-- mesajdan önce kural onayı"*)
--
-- ─ ⚠️⚠️ NEDEN İKİ AYRI YERDE TUTULUYOR ────────────────────────────────────────────────
-- Onayın KAPSAMI ikisinde farklı ve bu bir tasarım kararı:
--
--   • ÖZEL MESAJ → `chat_participants` satırında, yani **her yazışma için ayrı**.
--     Kullanıcının şartı buydu. DM zaten katılımcı satırı olan tek kanal türü
--     (ittifak ve genel kanalda satır hiç yaratılmıyor, göç 0042/0046 kararı).
--
--   • İTTİFAK SOHBETİ → `players` satırında, yani **oyun başına BİR KEZ**.
--     Gerekçe: kurallar oyuncunun DAVRANIŞINA dair, ittifaka özel değil. İttifak
--     değiştirmek kuralları değiştirmiyor; her katılımda yeniden sormak onayı bir
--     "tamam" tuşuna çevirirdi.
--
-- ─ ⚠️ NEDEN `boolean` DEĞİL SÜRÜM ────────────────────────────────────────────────────
-- Metin değişirse onay yeniden alınmalı ve bunu bilmenin tek yolu neyin onaylandığını
-- saklamak. `smallint` sürüm, kodda tek kaynaktan geliyor (`chat.terms.ts`).
-- `0` = hiç onaylanmadı. Sunucu `sürüm >= güncel` diye bakıyor, eşitlik DEĞİL: ileride
-- sürüm düşürülürse (geri alma) kimse yeniden sorgulanmasın.
--
-- ─ ⚠️ NEDEN AYRICA `..._accepted_at` ────────────────────────────────────────────────
-- Onay hukuki bir kabul; "hangi sürüm" kadar "ne zaman" da kayıt değeri taşıyor. Sürüm
-- tek başına şikâyet incelemesinde yetmiyor.
--
-- ⚠️ Geçmişi silen oyuncunun onayı KORUNUR ve yeniden sorulmaz: geçmiş silme yalnız
-- `cleared_before_message_id`i kaydırıyor, katılımcı satırı duruyor. Her silmede yeniden
-- sormak oyuncuyu "okumadan onayla"maya alıştırır ve kaydın değerini düşürürdü.

ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS terms_version smallint NOT NULL DEFAULT 0;
ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

COMMENT ON COLUMN chat_participants.terms_version IS
  'Bu yazışmada onaylanan sohbet kuralı sürümü. 0 = onaylanmadı. Kaynak: chat.terms.ts';
COMMENT ON COLUMN chat_participants.terms_accepted_at IS
  'Onayın alındığı an. Sürümle birlikte tutuluyor: şikâyet incelemesinde ikisi de gerekiyor.';

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS chat_terms_version smallint NOT NULL DEFAULT 0;
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS chat_terms_accepted_at timestamptz;

COMMENT ON COLUMN players.chat_terms_version IS
  'İttifak sohbeti için onaylanan kural sürümü, OYUN BAŞINA. 0 = onaylanmadı.';
COMMENT ON COLUMN players.chat_terms_accepted_at IS
  'İttifak sohbeti kural onayının alındığı an.';

-- ⚠️ İndeks YOK ve bilerek: iki kolon da yalnız **tek satır** okunurken sorgulanıyor
-- (gönderen kendi katılımcı satırı / kendi oyuncu satırı) ve ikisine de birincil anahtarla
-- gidiliyor. Tarama yapan bir sorgu yok.
