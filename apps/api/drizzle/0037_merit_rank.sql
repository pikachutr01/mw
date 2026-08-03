-- ⭐ ASKERÎ ÜNVANLAR (kullanıcı, 2026-08-03) — Subay · Komutan · Başkomutan · Mareşal.
--
-- Bir savaşta öldürülen ordunun **kaynak bedeli** (altın + yemek, /1000) eşiği geçerse taraf
-- süreli bir ünvan kazanır. Formülün ve eşiklerin gerekçesi `packages/catalog/src/merit.ts`te.
-- Hem saldıran hem savunan alır; **savaşı kaybeden de alır** (kullanıcı şartı).
--
-- ⚠️ **SÜRE DOLUNCA TEMİZLEYEN GÖREV YOK — bilerek.** Ünvan okuma anında
-- `merit_expires_at > gameNow` ile süzülüyor. Oyuncu başına bir `merit_expire` görevi yazmak
-- (`vacation_end` deseni) kuyruğa oyuncu sayısı kadar satır eklerdi ve tek kazancı "ünvanın
-- sona erdi" bildirimi olurdu. §3'ün "üretim tembeldir, tick YOK" kararıyla aynı yön.
-- ⚠️ Bunun bedeli: süresi geçmiş satırlar tabloda kalır. Zararsız — okuyan her yer süzüyor.
--
-- ⚠️ Zaman damgaları **OYUN saatinde** (`worlds.clock_offset_ms`), gerçek saatte değil:
-- bakımda duran bir dünyada ünvan süresi de durmalı, yoksa 3 saatlik bakım oyuncunun
-- rozetinden 3 saat çalardı.
--
-- ⚠️ Görünürlük kuralı ŞEMADA DEĞİL SORGUDA: ünvan yalnız ittifak listesinde ve oyuncunun
-- kendisine gösterilir. Dünya/Sıralama/Arama ekranlarına sızarsa stratejik bir açık doğar —
-- düşman "yakın zamanda büyük savaş verdi, ordusu zayıf" bilgisini bedavaya okur.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS merit_tier       smallint,
  ADD COLUMN IF NOT EXISTS merit_score      bigint,
  ADD COLUMN IF NOT EXISTS merit_battle_id  bigint,
  ADD COLUMN IF NOT EXISTS merit_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS merit_expires_at timestamptz;

COMMENT ON COLUMN players.merit_tier       IS 'Askerî ünvan: 1 Subay · 2 Komutan · 3 Başkomutan · 4 Mareşal. NULL = ünvansız.';
COMMENT ON COLUMN players.merit_score      IS 'Ünvanı kazandıran savaşın kıyım puanı (kaynak/1000).';
COMMENT ON COLUMN players.merit_battle_id  IS 'Kanıt: ünvanı hangi savaş kazandırdı (battles.id).';
COMMENT ON COLUMN players.merit_granted_at IS 'Ünvanın verildiği an — OYUN saati.';
COMMENT ON COLUMN players.merit_expires_at IS 'Ünvanın düşeceği an — OYUN saati. Okuyan her sorgu bunu süzer.';

-- Ünvanlı oyuncu her zaman azınlıkta: kısmi indeks. İttifak listesi bu sütunlarla JOIN'liyor.
CREATE INDEX IF NOT EXISTS players_merit ON players (world_id, merit_tier)
  WHERE merit_expires_at IS NOT NULL;
