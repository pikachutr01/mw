-- ⭐ KAYIT KÖTÜYE KULLANIMI (kullanıcı notları: *"temp mail gibi servislerden alınan garip
-- e postalar ile e posta doğrulama aşaması geçilebilir"* + *"bot hesap oluşturmayı tespit
-- edip engelleme"*).
--
-- ⚠️ İKİ FARKLI TEHDİT, İKİ FARKLI CEVAP:
--   • **Tek kullanımlık e-posta** → tespit + yönetici kararı (kullanıcının kendi cümlesi
--     "tespitini yapıp BANLAYABİLECEK bir admin bölümü" — yani karar insanın).
--   • **Bot hızı** → doğrudan engelleme; orada bekleyecek bir insan yok.

-- ── 1. Tek kullanımlık alan listesi ─────────────────────────────────────────
-- Kaynak: https://github.com/disposable-email-domains/disposable-email-domains — **CC0**
-- (kamu malı), ~8.200 alan, elle küratörlü.
--
-- ⚠️ 110.000+ alanlık toplu (aggregated) listeler BİLEREK seçilmedi. Bu oyunda yanlış
-- pozitifin bedeli asimetrik: engellenen gerçek bir oyuncu geri gelmez ve neden
-- giremediğini de öğrenemez. Toplu listeler ünlü ünlü gerçek sağlayıcıları da içerebiliyor.
-- Seçilen listede gmail/hotmail/outlook/yahoo/yandex/icloud/protonmail'in HİÇBİRİ yok
-- (2026-08-04'te doğrulandı) — kalabalık değil, doğruluk seçildi.
CREATE TABLE IF NOT EXISTS disposable_domains (
  domain text PRIMARY KEY
);

COMMENT ON TABLE disposable_domains IS
  'Tek kullanımlık e-posta alanları (CC0 liste anlık görüntüsü). Yalnız okunur referans veri.';

CREATE TABLE IF NOT EXISTS disposable_meta (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source       text        NOT NULL,
  rows         integer     NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Posta kutusu normalizasyonu ──────────────────────────────────────────
-- ⭐ ASIL AÇIK BURASI, tek kullanımlık servisler değil. `ahmet+1@gmail.com`,
-- `ahmet+2@gmail.com` ve `ah.met@gmail.com` **AYNI posta kutusudur**: üçü de doğrulama
-- postasını alır, üçü de doğrulanır ve bugünkü `accounts_email_unique` üçünü de farklı hesap
-- sayar. Yani "e-posta doğrulaması çoklu hesabı zorlaştırır" varsayımı, hiçbir tek kullanımlık
-- servise ihtiyaç duymadan delinebiliyordu.
--
-- ⚠️ Kolon BENZERSİZ DEĞİL — bilerek. Aynı posta kutusundan ikinci hesap açmak tek başına
-- suç değil (aile, iş hesabı) ve engellemek mevcut oyuncuları da kırardı. Kolonun işi
-- yakalamak değil GÖRÜNÜR KILMAK; kararı yönetici veriyor (§9.1.1 ile aynı ilke).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS signup_ip text;

COMMENT ON COLUMN accounts.email_normalized IS
  'Nokta ve +etiket temizlenmiş posta kutusu kimliği. BENZERSİZ DEĞİL: aynı kutudan ikinci hesap suç değil, yalnız görünür olmalı.';
COMMENT ON COLUMN accounts.signup_ip IS
  'Kayıt anındaki IP. `player_ips`ten ayrı: orası oyuncu (dünya) düzeyinde, bu hesabın DOĞDUĞU an.';

CREATE INDEX IF NOT EXISTS accounts_email_normalized ON accounts (email_normalized)
 WHERE email_normalized IS NOT NULL;
-- Kayıt yığılması sorgusu: "şu /24'ten son N dakikada kaç hesap açıldı".
CREATE INDEX IF NOT EXISTS accounts_signup ON accounts (created_at DESC)
 WHERE signup_ip IS NOT NULL;
