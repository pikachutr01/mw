-- ⭐ GENEL SOHBET (§13.12) — `chat_channels.kind = 'global'` nihayet kullanılıyor.
--
-- Sohbet şeması doğduğu günden beri üç kanal türü için tasarlanmıştı (`global | alliance | dm`);
-- 0042 ittifak dalını doldurdu, bu göç sonuncusunu dolduruyor. Yeni TABLO yok: mesajlar
-- `chat_messages`e, engellemeler `player_blocks`a, susturmalar `chat_bans`e (`scope = 'global'`)
-- düşüyor — üçü de hazır ve üçü de başka özelliklerle paylaşılıyor.
--
-- ⚠️ **KATILIMCI SATIRI YOK** (§13.12.2, ittifak kanalıyla aynı karar): üyelik "bu dünyada
-- oyuncu olmak"tan ibaret, yazılacak bir üyelik satırı yok. Okunmamış rozeti de YOK
-- (kullanıcı kararı: sohbete istendiğinde bağlanılıyor), dolayısıyla `last_read_message_id`e
-- ihtiyaç doğmuyor.

-- ── Kanal tekilliği ──────────────────────────────────────────────────────────

-- ⭐ Bir dünyanın TEK genel kanalı olur. `chat_channels_world_alliance` ile aynı görev; KISMÎ,
-- çünkü DM ve ittifak satırlarında `kind` farklı ve onlar bu kısıttan muaf olmalı.
--
-- ⚠️ Servis `INSERT … ON CONFLICT (world_id) WHERE kind = 'global'` yazmak ZORUNDA: kısmî bir
-- indekse `WHERE`siz `ON CONFLICT` verilirse Postgres hangi kısıtın kastedildiğini çözemez ve
-- *"there is no unique or exclusion constraint matching"* hatası verir (aynı tuzak 0042'de de
-- yazılı — iki kez ısırmasın).
--
-- ⚠️ `chat_channels_world_dm` (`world_id, dm_key`) bu satırları engellemiyor: genel kanalda
-- `dm_key` NULL ve Postgres tekil indekslerde NULL'ları birbirinden FARKLI sayar.
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_world_global"
    ON "chat_channels" USING btree ("world_id")
    WHERE "chat_channels"."kind" = 'global';--> statement-breakpoint

COMMENT ON INDEX "chat_channels_world_global" IS
  'Dünya başına tek genel sohbet kanalı. Kanal tembel yaratılır; ON CONFLICT bu kısmî indeksi WHERE kind = ''global'' ile göstermek zorunda.';
