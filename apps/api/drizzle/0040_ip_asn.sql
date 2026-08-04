-- ⭐ IP → ASN / ÜLKE (§9.1.2, kullanıcı isteği 2026-08-04: *"ücretsiz geo location
-- hizmetlerini araştırabilirsin"*).
--
-- ⚠️ NEDEN YEREL VERİTABANI, İSTEK BAŞINA API DEĞİL. Asıl gerekçe fiyat değil GİZLİLİK:
-- istek başına çağrılan bir geolocation servisi, HER OYUNCUNUN IP'sini üçüncü bir tarafa
-- gönderirdi. §9.1.5 "oyunculara birbirinin IP'sini göstermeyeceğiz" diyor; onu bir satıcıya
-- akıtmak aynı sözün daha büyük ihlali olurdu. Yerel tablo ile IP sunucudan hiç çıkmıyor.
-- İkincil kazanç: sıfır gecikme, sıfır kota, çevrimdışı çalışma.
--
-- ⚠️ KAYNAK SEÇİMİ — https://iptoasn.com, **Public Domain (PDDL v1.0)**, saatlik güncelleniyor,
-- hesap/anahtar istemiyor, düz TSV veriyor ve ÜLKEYİ DE taşıyor.
-- Elenenler ve gerekçeleri:
--   • MaxMind GeoLite2 → hesap + lisans anahtarı + her ortam için imzalı EULA.
--   • IPinfo          → 2025'te ücretsiz katman 1.000 istek/gün + kredi kartına indi.
--   • ip-api.com      → ücretsiz katman TİCARİ KULLANIMA KAPALI (premium planlanıyor).
--   • DB-IP Lite      → CC-BY atıf yükümlülüğü + yalnız aylık güncelleme.
--   • O-X-L geoip-asn → iyi (BSD-3, günlük) ama MMDB okuyucu bağımlılığı + indirme kotası.
-- iptoasn düz TSV olduğu için YENİ BİR NPM BAĞIMLILIĞI GEREKMİYOR — .mmdb okuyucu yok.

-- ⚠️ `inet` DEĞİL `numeric`: iptoasn aralıkları CIDR sınırlarına oturmuyor (açık aralık
-- veriyor). `inet`e çevirip `<<=` ile aramak veriyi olduğu gibi taşımamak olurdu.
-- ⚠️ IPv6 128 bit → `bigint` bile taşar, `numeric(39,0)` şart.
-- ⚠️ `asn` NEDEN `bigint`: AS numaraları **32 bit İŞARETSİZ** (RFC 6793), Postgres `integer`
-- ise işaretli 32 bit — tavanı 2.147.483.647. Gerçek veri kümesinde bunun üstünde numaralar
-- var (ör. AS4230120000, özel kullanım aralığı 4200000000-4294967294). `integer` yazılmıştı ve
-- gerçek dosya yüklenirken *"value 4230120000 is out of range for type integer"* ile patladı;
-- sentetik test verisinde küçük ASN'ler olduğu için görünmemişti.
CREATE TABLE IF NOT EXISTS ip_asn_ranges (
  family      smallint      NOT NULL,
  range_start numeric(39,0) NOT NULL,
  range_end   numeric(39,0) NOT NULL,
  asn         bigint        NOT NULL,
  country     text,
  description text
);

COMMENT ON TABLE  ip_asn_ranges             IS 'iptoasn.com anlık görüntüsü (Public Domain). Yalnız okunur referans veri.';
COMMENT ON COLUMN ip_asn_ranges.family      IS '4 | 6 — iki aile ayrı aranıyor, aralıklar çakışmasın.';
COMMENT ON COLUMN ip_asn_ranges.asn         IS '0 = kayıtsız/duyurulmamış aralık; iptoasn bunları da listeliyor.';
COMMENT ON COLUMN ip_asn_ranges.description IS 'AS adı (ör. "TURKCELL-AS"). Operatör/veri merkezi ayrımının tek ipucu.';

-- ⚠️ Arama deseni: `range_start <= x ORDER BY range_start DESC LIMIT 1`, sonra `range_end`
-- kontrolü. Bu indeks tam o sorgu için: (family, range_start) üzerinde AZALAN tarama, tek
-- satır okuyup duruyor. `range_end`i de indekse koymak gereksiz — aday zaten tek satır.
CREATE INDEX IF NOT EXISTS ip_asn_ranges_lookup ON ip_asn_ranges (family, range_start DESC);

-- Tazelik takibi: "bu veri ne kadar eski" sorusu panelde görünüyor. Tek satırlık tablo.
CREATE TABLE IF NOT EXISTS ip_asn_meta (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source       text        NOT NULL,
  rows         integer     NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- ── Oyuncu IP'sine künye ────────────────────────────────────────────────────
-- ⚠️ `asn` kolonu 0002'den beri VARDI ve **hiç doldurulmuyordu**. Artık doluyor; yanına
-- insan tarafından okunabilir ad ve ülke geliyor.
ALTER TABLE player_ips ADD COLUMN IF NOT EXISTS asn_name text;
ALTER TABLE player_ips ADD COLUMN IF NOT EXISTS country  text;

COMMENT ON COLUMN player_ips.asn      IS 'AS numarası (metin). Boş = aralık tablosunda bulunamadı ya da tablo henüz yüklenmedi.';
COMMENT ON COLUMN player_ips.asn_name IS 'AS adı — "mobil operatör NAT''ı mı" sorusunun TAHMİN değil KANIT hâli.';
COMMENT ON COLUMN player_ips.country  IS 'ISO 3166-1 alpha-2. Öncelik Cloudflare CF-IPCountry, yoksa iptoasn ülke sütunu.';
