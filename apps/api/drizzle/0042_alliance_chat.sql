-- ⭐ İTTİFAK SOHBETİ (§13.12 + §13.15b) — `chat_channels.kind = 'alliance'` nihayet kullanılıyor.
--
-- Sohbet şeması doğduğu günden beri üç kanal türü için tasarlanmıştı (`global | alliance | dm`)
-- ve `chat_channels.alliance_id` kolonu vardı ama HİÇ yazılmamıştı. Bu göç o boşluğu dolduruyor.
--
-- ⚠️ **KATILIMCI SATIRI YOK** (bilinçli): üyelik `players.alliance_id`'de yaşıyor ve onu YAZAN
-- dört ayrı kod yolu var (`applyMembership`, `decide()`'ın kendi UPDATE'i, `disbandInner`,
-- `detachForPurge`). `chat_participants`e ittifak satırı yazmak o dördüne BEŞİNCİ bir senkron
-- borcu eklerdi — `alliance.service.ts` başlığı bu tuzağın daha önce ısırdığını yazıyor.
-- Erişim sorgu anında `players.alliance_id = chat_channels.alliance_id` ile türetilir.
-- Okunmamış rozeti olmadığı için (kullanıcı kararı) `last_read_message_id`e de ihtiyaç yok.

-- ── 1. Kanal tekilliği ───────────────────────────────────────────────────────

-- ⚠️ Temizlik ÖNCE: `alliance_id` bugüne kadar hiç yazılmadı (hep NULL), ama FK eklemeden önce
-- öksüz satır kalmadığını garanti etmek maliyetsiz.
DELETE FROM chat_channels c
 WHERE c.alliance_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM alliances a WHERE a.id = c.alliance_id);
--> statement-breakpoint

-- ⭐ Bir ittifağın TEK sohbet kanalı olur. `chat_channels_world_dm` ile aynı görev; KISMÎ,
-- çünkü DM satırlarında `alliance_id` NULL ve onlar bu kısıttan muaf olmalı.
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_world_alliance"
    ON "chat_channels" USING btree ("world_id","alliance_id")
    WHERE "chat_channels"."alliance_id" IS NOT NULL;--> statement-breakpoint

-- ⭐⭐ CASCADE = «İTTİFAK DAĞITILIRSA MESAJLAR KALICI SİLİNİR» ŞARTININ TAMAMI.
--
-- Zincir: `alliances` DELETE → `chat_channels` DELETE → `chat_messages` DELETE
-- (son halka `chat_messages_channel_id_chat_channels_id_fk` üzerinde ZATEN cascade,
--  bkz. `0000_closed_molecule_man.sql`).
--
-- ⚠️ Servis katmanında ELLE silmeye GEREK YOK ve elle silmek TEHLİKELİ olurdu: unutulabilen
-- bir adım, dağıtılmış ittifağın sohbetini sunucuda bırakırdı. Kural veritabanında duruyor.
ALTER TABLE "chat_channels"
  ADD CONSTRAINT "chat_channels_alliance_id_alliances_id_fk"
  FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ── 2. Mention'lar mesajın üstünde ───────────────────────────────────────────

-- ⭐ ÇÖZÜLMÜŞ HÂLİ saklanır: [{"id":1234,"at":12,"len":14}] — `at` gövde içindeki başlangıç,
-- `len` `@` DÂHİL uzunluk. Böylece istemci HİÇ parse etmez, yalnız diler.
--
-- ⚠️ Neden ham `@ad` yetmez: kullanıcı adında BOŞLUK serbest (`name-rules.ts`), yani
-- "@Eru Ilúvatar merhaba" metninde adın nerede bittiği metinden çözülemez. Sunucu çözer,
-- indeks yazar, iki taraf aynı şeyi görür.
-- ⚠️ Neden yalnız `[playerId]` yetmez: ad DEĞİŞİRSE eski mesajdaki metin eski adı gösterir ve
-- id'den çözülen yeni adla eşleşmez → kalın yazılacak aralık bulunamazdı.
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "mentions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "chat_messages"."mentions" IS
  'Çözülmüş mention aralıkları: [{id,at,len}]. DM kanallarında daima boş. İstemci parse etmez, diler.';--> statement-breakpoint

-- ── 3. İttifağa katılma anı ──────────────────────────────────────────────────

-- ⭐ «İttifağa katılalı 2 saat olmayan yazamaz» kuralı bunsuz ÖLÇÜLEMEZ: `players.created_at`
-- DÜNYAYA katılma anıdır, ittifağa değil. Eski bir oyuncu yeni bir ittifağa girip anında
-- bağırabilirdi.
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "alliance_joined_at" timestamp with time zone;--> statement-breakpoint

COMMENT ON COLUMN "players"."alliance_joined_at" IS
  'İttifağa katılma anı (ittifaksızken NULL). İttifak sohbetindeki acemi kısıtının ölçütü.';--> statement-breakpoint

-- ⚠️ MEVCUT ÜYELER CEZALANDIRILMAZ: bugün bir ittifakta olan herkes zaten uzun süredir orada.
-- Geriye dönük bir tarih uydurmak yerine «çok eski» yazıyoruz; kısıt sorgusu fark etmiyor ama
-- NULL bırakıp sorguda özel-durum yazmaktan temiz. (Servis NULL'ı fail-closed sayıyor.)
UPDATE "players" SET "alliance_joined_at" = now() - interval '1 year'
 WHERE "alliance_id" IS NOT NULL AND "alliance_joined_at" IS NULL;--> statement-breakpoint

-- ── 4. Susturma (§13.15b yetki matrisi) ──────────────────────────────────────

-- ⭐ `chat_bans` deseninin İTTİFAK ÖLÇEĞİNDEKİ ikizi.
--
-- ⚠️ `chat_participants.muted_until` KULLANILMADI, iki sebeple:
--   1. İttifak kanalında katılımcı satırı yok (yukarıdaki karar).
--   2. Orada NULL = «susturulmamış» demek olurdu → **KALICI susturma temsil edilemezdi.**
--      Burada satırın VARLIĞI susturmadır, `until IS NULL` ise «kalıcı» — `chat_bans` ile
--      birebir aynı anlam, belirsizlik yok.
--
-- ⚠️ Kaldırma = DELETE DEĞİL, `revoked_at` işaretlemesi. Moderasyon geçmişi kalıcı olmalı
-- (`chat_bans`'ın «süresi geçmiş satır SİLİNMEZ» kuralıyla aynı gerekçe): «lider beni haksız
-- yere susturdu» tartışmasının tek nesnel kaydı bu satır.
CREATE TABLE IF NOT EXISTS "alliance_chat_mutes" (
  "id"          bigserial PRIMARY KEY NOT NULL,
  "world_id"    smallint NOT NULL,
  "alliance_id" bigint NOT NULL,
  "player_id"   bigint NOT NULL,
  "until"       timestamp with time zone,
  "reason"      text,
  "created_by"  bigint NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at"  timestamp with time zone,
  "revoked_by"  bigint
);--> statement-breakpoint

-- ⚠️ İttifak dağıtılınca susturmalar da gider — ceza o topluluğa aitti, topluluk yok.
ALTER TABLE "alliance_chat_mutes"
  ADD CONSTRAINT "alliance_chat_mutes_alliance_id_alliances_id_fk"
  FOREIGN KEY ("alliance_id") REFERENCES "public"."alliances"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "alliance_chat_mutes"
  ADD CONSTRAINT "alliance_chat_mutes_player_id_players_id_fk"
  FOREIGN KEY ("player_id") REFERENCES "public"."players"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ⚠️ Aynı oyuncuya ikinci bir AKTİF susturma satırı olamaz. Servis «önce iptal et, sonra yaz»
-- yapıyor; bu indeks o sözleşmenin veritabanı tarafındaki güvencesi.
-- ⚠️ Koşul `revoked_at IS NULL` — SÜRESİ GEÇMİŞ ama iptal edilmemiş satır da kısıtın İÇİNDE.
-- Bu yüzden servis, yeniden susturmadan önce süresi geçmiş satırı da iptale çekmek ZORUNDA
-- (yoksa ikinci susturma unique ihlaliyle patlar).
CREATE UNIQUE INDEX IF NOT EXISTS "alliance_chat_mutes_one_active"
    ON "alliance_chat_mutes" USING btree ("alliance_id","player_id")
    WHERE "alliance_chat_mutes"."revoked_at" IS NULL;--> statement-breakpoint

COMMENT ON TABLE "alliance_chat_mutes" IS
  'İttifak sohbeti susturmaları. Satırın varlığı = susturma; until IS NULL = kalıcı; kaldırma revoked_at ile (satır SİLİNMEZ, denetim izi kalır).';
