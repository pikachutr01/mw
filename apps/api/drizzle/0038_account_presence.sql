-- ⭐ TEK CİHAZ KURALI (kullanıcı, 2026-08-03) — bir hesap aynı anda YALNIZ TEK yerde açık.
--
-- Kapsam kullanıcının şartı: tarayıcı · ikinci SEKME · PWA · ileride Flutter uygulaması.
-- İkinci yer tam ekran uyarı görür ve isterse oyunu oraya **devralır** (kullanıcı kararı:
-- kesin engelleme yerine devralma, çünkü tarayıcısı çöken oyuncu kendi hesabından kilitli
-- kalmamalı).
--
-- ⚠️ NEDEN `sessions` YETMEDİ. Aynı tarayıcının iki sekmesi aynı `localStorage`ı, dolayısıyla
-- AYNI oturum satırını paylaşır — `sessions` sekmeleri ayırt EDEMEZ. Bu yüzden yeni bir kimlik
-- gerekiyor: istemci `sessionStorage`ta bir `instance_id` tutuyor (yeni sekme = yeni kimlik,
-- sayfa yenileme = aynı kimlik) ve `X-Client-Instance` başlığıyla gönderiyor.
--
-- ⚠️ NEDEN SÜREÇ BELLEĞİ DEĞİL DB. `RealtimeGateway`in `online` haritası yalnız KENDİ sürecinin
-- soketlerini biliyor (gateway'in kendi yorumu bunu yazıyor). Bugün tek süreç var (`ROLE=all`),
-- ama kilidi belleğe koymak "ikinci bir API süreci açıldığı gün kural sessizce delinir" demekti
-- — ve o gün geldiğinde kimse bu tabloyu hatırlamayacaktı.
--
-- ⚠️ HESAP BAŞINA, oyuncu başına DEĞİL. `players` dünya başına, `accounts` global. Kullanıcının
-- kuralı "bir hesabın aynı anda tek cihazda açık olması" — iki dünyaya aynı anda girmek de
-- bunun kapsamında.
--
-- ⚠️ SAHİPLİK ZAMAN AŞIMIYLA DÜŞER (`session.claimGraceSeconds`, 90 sn). Tarayıcısı çöken
-- oyuncu `seen_at` eskiyince kendiliğinden geri girebilir; devralma düğmesine basmak zorunda
-- kalmaz. Soket kopması zaten saniyeler içinde `released_at` yazıyor; bu süre asıl olarak
-- soketsiz (yalnız yoklama yapan) istemciler ve ani kapanmalar için var.

CREATE TABLE IF NOT EXISTS account_presence (
  account_id   bigint      PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  instance_id  text        NOT NULL,
  session_id   uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  world_id     smallint,
  platform     text,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  seen_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  account_presence          IS 'Tek cihaz kuralı: hesabın şu an hangi istemci örneğinde açık olduğu.';
COMMENT ON COLUMN account_presence.instance_id IS 'İstemcide sessionStorage''ta üretilen UUID — SEKME düzeyinde tekil. Kimlik doğrulamada ASLA kullanılmaz.';
COMMENT ON COLUMN account_presence.session_id  IS 'Sahipliği alan oturum. Oturum silinince sahiplik de gider (CASCADE).';
COMMENT ON COLUMN account_presence.seen_at     IS 'Sahibin son ses verdiği an — GERÇEK saat. Zaman aşımı buradan ölçülür.';

-- «Şu an kim sahip» sorgusu `AuthGuard`ta HER istekte koşuyor; birincil anahtar yetiyor.
-- Bu indeks yönetim tarafı için: "şu an kaç hesap bağlı / hangi platformdan".
CREATE INDEX IF NOT EXISTS account_presence_seen ON account_presence (seen_at DESC);
