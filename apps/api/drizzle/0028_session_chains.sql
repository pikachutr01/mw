-- ⭐ OTURUM ZİNCİRİ (admin Faz 3) — cihaz listesinin ön koşulu.
--
-- ⚠️ SORUN: `refresh()` eski satırı `revoked_at` ile kapatıp YENİ satır açıyor. Güvenlik için
-- doğru (tek kullanımlık refresh → çalıntı token bir kez işler, sonra gerçek kullanıcının
-- oturumu düşer ve hırsızlık fark edilir) ama **cihaz listesi için kırık**: oyuncunun telefonu
-- her 15 dakikada bir listede YENİ bir satır gibi görünür, "bu cihazı çıkar" dediği satır ise
-- zaten ölüdür.
--
-- ⭐ ÇÖZÜM: `chain_id` ilk girişte üretilir, her yenilemede TAŞINIR. Liste zincir başına tek
-- satır gösterir; "çıkış" tüm zinciri iptal eder. Hırsızlık tespiti aynen korunur — dönmeli
-- refresh mantığına hiç dokunulmadı, yalnız satırlara ortak bir kimlik eklendi.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chain_id uuid;

-- ⚠️ Geçmiş satırlar: her biri KENDİ zincirinin başı sayılır (`chain_id = id`). Alternatif
-- (device_id'ye göre gruplamak) daha "akıllı" görünürdü ama yanlış olurdu: aynı cihazda arka
-- arkaya iki kez giriş yapılmış olabilir ve bunlar gerçekten ayrı oturumlardır.
UPDATE sessions SET chain_id = id WHERE chain_id IS NULL;

ALTER TABLE sessions ALTER COLUMN chain_id SET NOT NULL;

-- Liste sorgusu: hesabın zincirleri, en son görülene göre.
CREATE INDEX IF NOT EXISTS sessions_chain ON sessions (account_id, chain_id);
