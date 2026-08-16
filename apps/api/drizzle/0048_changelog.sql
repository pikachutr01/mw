-- ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ (kullanıcı, 2026-08-16)
--
-- Kullanıcı: *"api tarafında oyunu etkileyen değişiklik yapıldığında bunu kodlara not almak
-- yerine daha kalıcı bir yere not edelim. Hatta oyuncular da görsün."*
--
-- Oyunun dengesi bugüne kadar YALNIZ commit mesajlarında ve kod yorumlarında anlatılıyordu.
-- İkisi de geliştirici içindir; oyuncu, ganimet oranının değiştiğini ancak yağmalayınca
-- fark ediyor ve destek talebi açıyordu.
--
-- ⚠️⚠️ **NEDEN VERİTABANI, DEPO DEĞİL.** İlk tasarım depoda bir dosyaydı: not kodla aynı
-- commit'te gider, unutulması imkânsız. Ama dengeyi etkileyen değişikliklerin bir kısmı
-- **yönetim panelinden** yapılıyor (`settings` tablosu · `loot.plunderRate` gibi) ve deploy
-- gerektirmiyor, depoya hiç dokunmuyor. Dosya tabanlı bir günlük o sınıfı yapısal olarak
-- göremezdi. Kural: **günlüğün kapsamı, değişikliğin kapsamından dar olamaz.**
--
-- ⚠️ `published_at` NULL = TASLAK. Ayrı bir `is_published` boolean'ı YOK: aynı gerçeği iki
-- kolona yazmak, ikisinin ayrışacağı gün demektir (`support_tickets.last_sender` notunun
-- tersi yönde aynı ders). "Yayında mı" sorusunun tek cevabı `published_at <= now()`.
--
-- ⚠️ `world_id` NULL = TÜM DÜNYALAR. Motor sabitleri dünya başına ayarlanabildiği için
-- (`settings.world_id`) günlük de dünyaya inebilmeli; ama bugüne kadarki her değişiklik
-- tüm dünyaları ilgilendiriyordu, o yüzden varsayılan NULL.

CREATE TABLE IF NOT EXISTS "changelog_entries" (
    "id"            bigserial PRIMARY KEY,
    -- NULL = tüm dünyalar
    "world_id"      smallint REFERENCES "worlds"("id"),
    "title"         text NOT NULL,
    "body"          text NOT NULL,
    -- balance | feature | fix
    "category"      text NOT NULL DEFAULT 'balance',
    -- NULL = taslak, henüz oyuncuya görünmüyor
    "published_at"  timestamptz,
    -- Yazan yönetici; NULL = sistem/tohum kaydı
    "created_by"    bigint,
    "created_at"    timestamptz NOT NULL DEFAULT now(),
    "updated_at"    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "changelog_category_chk"
      CHECK ("category" IN ('balance', 'feature', 'fix')),
    -- ⚠️ Boş başlık/gövde oyuncuya boş bir kart gösterirdi; kapıyı veriye yapıştır.
    CONSTRAINT "changelog_title_chk" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "changelog_body_chk"  CHECK (length(btrim("body")) > 0)
);

-- ⭐ Genel ucun TEK sorgusu: yayınlanmışlar, yeniden eskiye. Kısmî indeks taslakları hiç
--   taşımıyor — liste her oyuncuya açık ve sık çekiliyor.
CREATE INDEX IF NOT EXISTS "changelog_published"
    ON "changelog_entries" ("published_at" DESC, "id" DESC)
    WHERE "published_at" IS NOT NULL;
