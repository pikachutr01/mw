-- ⭐ DESTEK / İLETİŞİM SİSTEMİ (kullanıcı, 2026-08-14)
--
-- Oyunun bugüne kadarki TEK destek kanalı `destek@mobilwar.com` idi (Cloudflare Email Routing →
-- gerçek kutu; gelen posta sunucumuz yok). Yani yardım isteme yolu oyunun DIŞINDAYDI ve iz
-- bırakmıyordu: ne geçmiş, ne durum, ne yönetici kuyruğu.
--
-- ⚠️ **ÜÇ TABLO, TEK KUYRUK.** Anonim ve kayıtlı talep AYNI tabloda duruyor (`account_id`
-- nullable). İki ayrı tablo, admin ekranını · sayaçları · mail akışını · durum makinesini
-- ikişer kez yazdırırdı; tek fark bir nullable FK.
--
-- ⚠️ **`ON DELETE CASCADE` BİLEREK YOK** (`accounts` ve `players` tarafında) — `chat_reports`
-- (0031) ile aynı gerekçe: destek kaydı kaynağından UZUN yaşamalı. Kimlik alanları
-- (`email`, `display_name`, `world_id`) bu yüzden DENORMALİZE. Zaten hesap silme bir UPDATE
-- (anonimleştirme), DELETE değil — FK hiç tetiklenmez; PII temizliğini
-- `account-delete.service.ts` açıkça yapıyor.

CREATE TABLE IF NOT EXISTS "support_tickets" (
    "id"            bigserial PRIMARY KEY,
    "world_id"      smallint REFERENCES "worlds"("id"),
    "account_id"    bigint REFERENCES "accounts"("id"),
    "player_id"     bigint,
    "email"         text NOT NULL,
    "display_name"  text NOT NULL,
    "subject"       text NOT NULL,
    "category"      text NOT NULL,
    "status"        text NOT NULL DEFAULT 'open',
    "last_sender"   text NOT NULL DEFAULT 'user',
    "admin_notified_at" timestamptz,
    "public_token_hash" text,
    "public_token_expires_at" timestamptz,
    "created_ip"    text,
    "created_at"    timestamptz NOT NULL DEFAULT now(),
    "updated_at"    timestamptz NOT NULL DEFAULT now(),
    "closed_at"     timestamptz,
    "closed_by"     bigint,
    CONSTRAINT "support_tickets_status_chk"
      CHECK ("status" IN ('open', 'closed')),
    CONSTRAINT "support_tickets_sender_chk"
      CHECK ("last_sender" IN ('user', 'admin')),
    CONSTRAINT "support_tickets_category_chk"
      CHECK ("category" IN ('bug', 'account', 'suggestion', 'report', 'other'))
);--> statement-breakpoint

-- ⭐ Yöneticinin TEK sorgusu: "bizde bekleyen kaç talep var". Sekme rozeti bunu okuyor.
-- ⚠️ Kısmî: 10.000 talebin çoğu kapalı ya da yanıtlanmış olacak (`messages_unread` deseni).
CREATE INDEX IF NOT EXISTS "support_tickets_pending"
    ON "support_tickets" USING btree ("updated_at")
    WHERE "status" = 'open' AND "last_sender" = 'user';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_tickets_account"
    ON "support_tickets" USING btree ("account_id", "id");--> statement-breakpoint

-- ⭐ Anonim kullanıcının kendi talebine dönüş yolu. YALNIZ hash saklanıyor (`sessions`
-- `refresh_hash` ve `email_tokens` deseni): veritabanı sızsa bile bağlantılar kullanılamaz.
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_token"
    ON "support_tickets" USING btree ("public_token_hash")
    WHERE "public_token_hash" IS NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "support_tickets"."account_id" IS
  'NULL = anonim talep (giriş yapmamış kullanıcı). FK''de CASCADE YOK: destek kaydı hesabın ömründen uzun yaşamalı (chat_reports deseni).';--> statement-breakpoint
COMMENT ON COLUMN "support_tickets"."email" IS
  'Yanıtın gideceği adres. DAİMA dolu — kayıtlı kullanıcıda hesaptan kopyalanır, doğrulanmamışsa kullanıcı değiştirebilir. Denormalize: hesap silinse de yanıt geçmişi anlamını korur.';--> statement-breakpoint
COMMENT ON COLUMN "support_tickets"."last_sender" IS
  'Son mesajı kim yazdı. TÜREV DEĞİL, KOLON: admin rozeti (support_tickets_pending) bunun kısmî indeksinden okunuyor; durum makinesine ''answered'' eklemek aynı gerçeği iki yere yazmak olurdu.';--> statement-breakpoint
COMMENT ON COLUMN "support_tickets"."admin_notified_at" IS
  'Yöneticiye "yeni talep" maili YALNIZ İLK açılışta gider. Tek-seferlik garanti koşullu UPDATE ... WHERE admin_notified_at IS NULL RETURNING ile alınır (ops-monitor deseni): hakkı ÖNCE al, maili SONRA yaz — ters sıra çift posta üretir.';--> statement-breakpoint

-- ⚠️ Ek satırı MESAJDAN ÖNCE yazılıyor (yükleme iki adımlı: önce dosya, sonra mesaj), bu yüzden
-- `ticket_id` nullable. Boş kalanlar 24 saat sonra yetim süpürücüsünün tanımı.
CREATE TABLE IF NOT EXISTS "support_attachments" (
    "id"          bigserial PRIMARY KEY,
    "ticket_id"   bigint REFERENCES "support_tickets"("id") ON DELETE CASCADE,
    "storage_key" text NOT NULL UNIQUE,
    "mime"        text NOT NULL,
    "bytes"       integer NOT NULL,
    "width"       integer NOT NULL,
    "height"      integer NOT NULL,
    "uploaded_by_account_id" bigint,
    "uploaded_ip" text,
    "created_at"  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "support_attachments_mime_chk"
      CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp'))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_attachments_orphan"
    ON "support_attachments" USING btree ("created_at")
    WHERE "ticket_id" IS NULL;--> statement-breakpoint

COMMENT ON COLUMN "support_attachments"."storage_key" IS
  'Diskteki göreli yol: 2026/08/a3/<32 hex>.<uzt>. Mutlak yol YALNIZ bundan türetilir ve birleştirmeden önce katı bir regex''ten geçer — yol kaçışının tek kapısı orası (admin.db.controller tabloyu elle düzenlemeye izin veriyor).';--> statement-breakpoint
COMMENT ON COLUMN "support_attachments"."mime" IS
  'SNIFF EDİLMİŞ tür (magic byte), istemcinin content-type''ı DEĞİL. Servis ederken Content-Type buradan yazılır. SVG bilerek yasak: betik çalıştırır.';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "support_messages" (
    "id"            bigserial PRIMARY KEY,
    "ticket_id"     bigint NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE,
    "sender"        text NOT NULL,
    "author_account_id" bigint,
    "body"          text NOT NULL,
    "attachment_id" bigint REFERENCES "support_attachments"("id") ON DELETE SET NULL,
    "created_at"    timestamptz NOT NULL DEFAULT now(),
    "read_at"       timestamptz,
    CONSTRAINT "support_messages_sender_chk"
      CHECK ("sender" IN ('user', 'admin'))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "support_messages_ticket"
    ON "support_messages" USING btree ("ticket_id", "id");--> statement-breakpoint

-- Oyuncunun okunmamış rozeti. `messages_unread` ile birebir aynı desen.
CREATE INDEX IF NOT EXISTS "support_messages_unread"
    ON "support_messages" USING btree ("ticket_id")
    WHERE "read_at" IS NULL AND "sender" = 'admin';--> statement-breakpoint

COMMENT ON TABLE "support_messages" IS
  'Destek yazışmasının tek mesajı. CASCADE burada İSTENİYOR (support_tickets''in aksine): mesajın talepten bağımsız anlamı yok, saklama birimi talebin kendisi.';--> statement-breakpoint
COMMENT ON COLUMN "support_messages"."sender" IS
  'ROL, kimlik değil. Oyuncuya gösterilen ad yönetici tarafında DAİMA «Yönetim» — personel kimliği sızmasın; gerçek yazar yalnız author_account_id''de, denetim için.';--> statement-breakpoint
COMMENT ON COLUMN "support_messages"."attachment_id" IS
  '0..1 ek. "Bir mesaja bir resim" kuralını uygulama değil ŞEMA koruyor.';
