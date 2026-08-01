-- ⭐ KAHRAMANIN YOK OLMASI KALKTI (kullanıcı kararı, 2026-08-01).
--
-- Eski kural: kahramanla giden ordunun TAMAMI ölürse kahraman `destroyed` yazılıyor,
-- tapınakta 1 saat "Yok Edildi" görünüyor ve sonra **kaydı tamamen siliniyordu**
-- (`hero.controller.ts` → `sweepDestroyed`). Oyuncunun kalıcı olarak bir varlığı
-- kaybettiği tek yer burasıydı.
--
-- Yeni kural: kahraman ölür ama silinmez. Taşıyacak birlik kalmasa bile **kendi hızıyla**
-- (`HERO_SPEED`) yalnız başına eve döner, şehre varınca Tapınak'tan diriltilir.
--
-- ── 1) Mevcut "yok edilmiş" kayıtları kurtar ────────────────────────────────
-- ⚠️ Bu satırların `city_id`'si zaten üs şehirdi (eski kod bilerek NULL'lamıyordu ki
-- tapınakta görünsünler), yani `dead` olur olmaz **diriltilebilir** hâle geliyorlar —
-- yeni kuralın istediği tam olarak bu. `revive_until` zaten NULL.
UPDATE heroes SET status = 'dead' WHERE status = 'destroyed';

-- ── 2) Kolonu düşür ─────────────────────────────────────────────────────────
-- Tek yazarı silinen dal, tek okuyucusu silinen süpürmeydi. Bırakmak, ileride birinin
-- "burada bir yok olma mekaniği var" sanmasına yol açacak ölü bir alan olurdu.
ALTER TABLE heroes DROP COLUMN IF EXISTS destroyed_at;
