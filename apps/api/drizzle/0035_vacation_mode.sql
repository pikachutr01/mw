-- ⭐ TATİL MODU (kullanıcı, 2026-08-02) — oyunun kalan en büyük eksik özelliği.
--
-- Doküman (`teknik_ve_yapi_dokumantasyonu.md:646`, `:941`): en az 48 saat kalınır; içindeyken
-- oyuncuya saldırılamaz **ama üretim, ilerletme ve tüm kaynak üretimi de durur**; girmek için
-- hiçbir şehirde üretim/ilerletme ve gelen-giden ordu olmamalıdır.
--
-- Kullanıcı kararları (belgeyi aşan): çıkıştan sonra yeniden girmek için **3 gün** bekleme ·
-- tatilde kalma üst sınırı **30 gün**, sonra otomatik çıkış · şimdilik **herkese açık**
-- (ileride premium'a alınabilir, kod dikişi `vacation.premiumOnly` ayarında hazır).

-- ── 1) Yeni kolonlar ────────────────────────────────────────────────────────
-- `vacation_until` ZATEN VARDI ama anlamı değişiyor: artık "korumanın bittiği an" değil,
-- **planlanmış otomatik çıkış anı** (`vacation_since + maxDays`).
ALTER TABLE players ADD COLUMN IF NOT EXISTS vacation_since    timestamptz;
ALTER TABLE players ADD COLUMN IF NOT EXISTS vacation_ended_at timestamptz;

COMMENT ON COLUMN players.vacation_until    IS 'Planlanmış otomatik çıkış anı. NULL ⇔ tatilde DEĞİL.';
COMMENT ON COLUMN players.vacation_since    IS 'Tatile giriş anı (oyun saati). 48 saat kuralı buradan.';
COMMENT ON COLUMN players.vacation_ended_at IS 'Son çıkış anı. 3 günlük yeniden giriş beklemesi buradan.';

-- ── 2) ⭐ KANONİK YÜKLEM: `vacation_until IS NOT NULL` ──────────────────────
-- Eskiden "tatilde mi" sorusu `vacation_until > now()` ile yanıtlanıyordu. Bu kolon artık
-- **bayrak** olarak okunuyor ve sebebi ARIZA GÜVENLİĞİ:
--
--   Zaman karşılaştırması kalsaydı, otomatik çıkış görevini işleyecek worker 30. günde çökmüş
--   olsa oyuncu kendiliğinden "tatilde değil" sayılırdı. Ama `cities.resources_at` hâlâ GİRİŞ
--   anında duruyor olurdu → ilk okumada **30 günlük kaynak tek seferde bankalanırdı.**
--   `IS NOT NULL` ile geç kalan worker tatili yalnız birkaç saniye uzatır; kaynak sıçraması
--   yapısal olarak imkânsız kalır (çıpayı yalnız `endVacation()` ilerletiyor).
--
-- Eski anlamdan yeni anlama geçiş: süresi DOLMUŞ satırlar temizlenmeli, yoksa yeni yüklem
-- onları "hâlâ tatilde" sayardı.
UPDATE players SET vacation_until = NULL
 WHERE vacation_until IS NOT NULL AND vacation_until <= now();

-- Süresi dolmamış satırlara giriş anı uydurulur (geçmişi bilmiyoruz; `now()` en güvenlisi:
-- 48 saatlik alt sınır bu andan sayılmaya başlar).
UPDATE players SET vacation_since = now()
 WHERE vacation_until IS NOT NULL AND vacation_since IS NULL;

-- ── 3) Çift tutarlılığı ─────────────────────────────────────────────────────
-- ⚠️ Bu CHECK üç mevcut testi kırıyordu (`player-ban`, `battle`, `admin-actions` — hepsi
-- `vacation_until`i tek başına yazıyordu); aynı değişiklikte düzeltildi. Kısıt olmadan
-- "tatilde ama ne zaman girdiği bilinmeyen" satır üretmek serbest kalırdı ve 48 saat kuralı
-- sessizce anlamsızlaşırdı.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_vacation_pair;
ALTER TABLE players ADD CONSTRAINT players_vacation_pair
  CHECK ((vacation_since IS NULL) = (vacation_until IS NULL));

-- Tatildekiler azınlık → kısmi indeks. Yönetim panelindeki liste ve otomatik çıkış taraması
-- bunu kullanır.
CREATE INDEX IF NOT EXISTS players_on_vacation
    ON players (world_id) WHERE vacation_until IS NOT NULL;
