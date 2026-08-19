-- ⭐⭐ RAPOR FAVORİLERİ (kullanıcı, 2026-08-19)
--
-- İstek iki parçalı: posta kutusunun Raporlar bölümüne **tür süzgeci**, ve açılan bir raporu
-- **favorilere alma**. Süzgecin türe göre olan kısmı yeni sütun istemiyor (`kind` zaten var);
-- favori için bir işaret gerekiyor.
--
-- ─ ⚠️ NEDEN AYRI TABLO DEĞİL ────────────────────────────────────────────────────────────
-- `messages` zaten **alıcı başına bir satır**: aynı savaşın saldıran ve savunan kopyaları
-- ayrı satırlar ve her satırın `player_id`si var. Yani "kim favoriledi" sorusu satırın
-- kendisinde cevaplanıyor; ayrı bir `message_favorites(player_id, message_id)` tablosu aynı
-- bilgiyi ikinci kez tutup her listede bir JOIN daha isterdi.
--
-- ─ ⚠️ NEDEN `boolean` DEĞİL `timestamptz` ──────────────────────────────────────────────
-- `read_at` ile aynı kalıp. Damga, bayrağın taşımadığı bir bilgiyi bedavaya taşıyor: ne zaman
-- favorilendi. İleride "favorilerimi eklenme sırasına göre sırala" istenirse göç gerekmiyor.
-- Kolon adı da o yüzden `favorited_at`, `is_favorite` değil.
--
-- ⚠️ Varsayılan NULL: mevcut satırların hepsi favorisiz doğuyor, veri dolduran bir göç yok.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS favorited_at timestamptz;

-- ⚠️ KISMÎ indeks: favori satırlar tüm posta kutusunun çok küçük bir kısmı olacak ve süzgeç
-- yalnız onları arıyor. Tam indeks, hiç favorilemeyen oyuncular için de yazma maliyeti
-- üretirdi. `messages_unread` indeksi aynı desende (`WHERE read_at IS NULL`).
CREATE INDEX IF NOT EXISTS messages_favorites
  ON messages (player_id, id DESC)
  WHERE favorited_at IS NOT NULL;
