-- ⭐ ÇOKLU HESAP — ANALİZ KATMANI (§9.1, Tur 7). Toplama Faz 2'de kurulmuştu; bu göç
-- toplananı ANALİZ EDİLEBİLİR hâle getiriyor.
--
-- ⚠️ §9.1.1 değişmezi: buradaki hiçbir kolon OTOMATİK CEZA üretmez. Çıktı skorlu bir rapor,
-- kararı insan verir. Her teknik izin masum açıklaması var (aynı evdeki kardeşler, okul/ofis
-- ağı, mobil operatör NAT'ı, paylaşılan tablet) ve yanlış pozitifin bedeli haksız ban.

-- ── 1. `player_devices` mobil alanları ──────────────────────────────────────
-- Bugüne kadar yalnız `platform` yazılıyordu, oysa başlıklar (`X-OS-Version`, `X-Device-Model`,
-- `X-App-Version`, `X-Timezone`, `X-Locale`) `device-context.ts`te ZATEN ayrıştırılıyor ve
-- `sessions` tablosuna yazılıyordu. `sessions` 90 günde budanıyor; `player_devices` kalıcı
-- sayaç tablosu olduğu için asıl korelasyon değeri burada durmalı.
--
-- ⚠️ Flutter geldiğinde ŞEMA DEĞİŞMEYECEK: mobil uygulamanın getireceği bilgi (cihaz modeli,
-- uygulama sürümü, saat dilimi) tam olarak bu kolonlara oturuyor.
ALTER TABLE player_devices ADD COLUMN IF NOT EXISTS os_version   text;
ALTER TABLE player_devices ADD COLUMN IF NOT EXISTS device_model text;
ALTER TABLE player_devices ADD COLUMN IF NOT EXISTS app_version  text;
ALTER TABLE player_devices ADD COLUMN IF NOT EXISTS timezone     text;
ALTER TABLE player_devices ADD COLUMN IF NOT EXISTS locale       text;

COMMENT ON COLUMN player_devices.os_version   IS 'Mobil: işletim sistemi sürümü (webde boş).';
COMMENT ON COLUMN player_devices.device_model IS 'Mobil: cihaz modeli — webde User-Agent''ın karşılığı.';
COMMENT ON COLUMN player_devices.app_version  IS 'Mobil uygulama sürümü; eski sürüm kalıntısı aramak için.';
COMMENT ON COLUMN player_devices.timezone     IS 'İstemcinin bildirdiği saat dilimi. Zayıf sinyal — VPN ile değişir.';
COMMENT ON COLUMN player_devices.locale       IS 'İstemcinin bildirdiği dil. Zayıf sinyal.';

-- ── 2. Ters yönde IP araması ────────────────────────────────────────────────
-- ⚠️ Mevcut indeksler analizin İKİ sorgusundan yalnız birini karşılıyordu:
--   `player_ips_pk`       (player_id, ip)  → "bu oyuncunun IP'leri"       ✅
--   `player_ips_by_block` (ip_block_24)    → "bu öbeği kim kullandı"      ✅
--   ama "bu TAM IP'yi kim kullandı" için önek uymuyor → seq scan.
-- Tam IP eşleşmesi /24'ten çok daha güçlü bir sinyal olduğu için sorgusu da olmalı.
CREATE INDEX IF NOT EXISTS player_ips_by_ip ON player_ips (ip);

-- ── 3. Sinyalin tekilliği ───────────────────────────────────────────────────
-- ⭐ Tarama tekrar tekrar koşacak (haftalık görev, Tur 8). Aynı çiftin aynı sinyali her
-- koşuda yeni satır açsaydı panel aynı çifti onlarca kez gösterir ve yöneticinin verdiği
-- «masum» kararı bir sonraki taramada kaybolurdu.
--
-- ⚠️ Çift **sıralı** tutulur (subject < related): (A,B) ile (B,A) aynı ilişkidir ve iki satır
-- olarak durursa skor iki kez sayılır. Sıralamayı şema zorlayamaz (CHECK yazılabilirdi ama
-- `subject_player_id` NULL olabilen bir kolon), bu yüzden kural `link.service.ts`te ve
-- aşağıdaki kısmi indekste yaşıyor.
CREATE UNIQUE INDEX IF NOT EXISTS abuse_signals_unique_open
    ON abuse_signals (kind, subject_player_id, related_player_id)
 WHERE resolved_at IS NULL AND subject_player_id IS NOT NULL AND related_player_id IS NOT NULL;

-- Panelin ana sorgusu "açık sinyaller, skoru yüksekten düşüğe".
CREATE INDEX IF NOT EXISTS abuse_signals_score ON abuse_signals (score DESC)
 WHERE resolved_at IS NULL;

-- Yöneticinin kim olduğu ve ne zaman karar verdiği: `audit_log`ta da duruyor ama satırın
-- kendisinde olması "bu çifte daha önce bakılmış mı" sorusunu tek sorguya indiriyor.
ALTER TABLE abuse_signals ADD COLUMN IF NOT EXISTS resolved_by bigint REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE abuse_signals ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN abuse_signals.resolution  IS 'innocent | watch | warned | banned — İNSAN kararı; sistem asla yazmaz.';
COMMENT ON COLUMN abuse_signals.resolved_by IS 'Kararı veren yönetici (players.id). Ceza kaydı ayrıca audit_log''ta.';
