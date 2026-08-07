-- ⭐⭐ TEK ZAMAN ÇİZGİSİ (kullanıcı kararı, 2026-08-07) — `clock_offset_ms` emekliye ayrılıyor.
--
-- ESKİ MODEL: `gameNow = (paused_at ?? now()) − clock_offset_ms`. Dünyanın toplam duraklama
-- süresi bir sütunda birikiyordu ve TÜM vadeler (`execute_at`, `finish_at`, `resources_at`,
-- `revive_until`…) gerçek saatten o kadar geride, ayrı bir "oyun saati" ölçeğinde tutuluyordu.
--
-- Bu ikilik pahalıya mal oldu: yazma tarafı süreç saatini, okuma tarafı DB saatini kullanıyordu;
-- `GAME_NOW_SQL` beş yere kopyalanmış, biri bozuktu; iki saat ~10 yerde karıştırıldı ve ikisi
-- canlıda oyuncunun gördüğü hataya dönüştü (asker üretim sayacı kalıcı «sipariş tamamlandı»,
-- sur onarım oranı yanlış). Kapanmayan bir hata sınıfıydı: her yeni özellik tuzağı yeniden kuruyordu.
--
-- YENİ MODEL: `gameNow == now() == UTC`, istisnasız. Bakım artık saati geri bırakmıyor;
-- bakımdan çıkarken **bekleyen her vade duraklama süresi kadar ileri kaydırılıyor**
-- (`world/time-registry.ts` + `world/time-shift.ts`).
--
-- ⭐⭐ DEĞİŞMEZLİK KANITI — bu göç oyuncunun gördüğü HİÇBİR kalan süreyi değiştirmez:
--   Her canlı kural saklanmış bir `V` değerini `gameNow` ile kıyaslar. `K = clock_offset_ms`,
--   `R = gerçek şimdi`.
--     Göç öncesi:  gameNow = R − K   →  kuralın gördüğü büyüklük = V − (R − K)
--     Göç:         V' := V + K,  clock_offset_ms := 0
--     Göç sonrası: gameNow = R       →  V' − R = (V + K) − R = V − (R − K)
--   İki büyüklük ÖZDEŞ. ∎
--
-- ⚠️ Bu yüzden 2. adımdaki UPDATE'ler **koşulsuzdur** (yalnız NULL olmayanları atlar):
--    "süresi geçmişleri kaydırmayalım" gibi bir ayıklama kanıtı bozar ve geçmiş kayıtlarla
--    yeni kayıtları farklı ölçeklere düşürürdü.

-- ── 0) EMNİYET: KAYDIRACAK ŞEY VARSA dünya duraklı olmalı ───────────────────
-- Çalışan bir dünyada kaydırma yapmak scheduler'la yarışır: kaydırma yarısındayken alınan bir
-- görev kaydırma öncesi/sonrası karışımı üretir ve bu geri alınamaz. `migrate.mjs` hatayı görüp
-- çıkış kodu 1 verir, `surum-yayinla.sh` de dağıtımı durdurur.
--
-- ⚠️ Koşulda `clock_offset_ms <> 0` ŞART. Tehlike ancak GERÇEKTEN kaydıracak satır varken
--    doğuyor; offset 0 olan bir dünyada bu göç zaten hiçbir satıra dokunmuyor. Bu ayrım
--    olmadan test veritabanları (offset 0, dünya çalışıyor) ve yeni kurulumlar göçe hiç
--    giremezdi — yani emniyet, koruması gereken şeyi değil herkesi durdururdu.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM worlds
     WHERE paused_at IS NULL AND state <> 'archived' AND clock_offset_ms <> 0
  ) THEN
    RAISE EXCEPTION
      'Tek zaman cizgisi gocu yalniz BAKIM MODUNDA kosabilir. Once: POST /api/v1/admin/worlds/:id/pause';
  END IF;
END $$;
--> statement-breakpoint

-- ── 1) KAYDIRMA DEFTERİ ─────────────────────────────────────────────────────
-- Her kaydırmanın (göç ve her bakım) kalıcı kaydı. Geriye dönük tek soru buradan cevaplanıyor:
-- "şu tarihte hangi sütunlar, kaç satır, ne kadar kaydı?"
CREATE TABLE IF NOT EXISTS time_shifts (
  id            bigserial PRIMARY KEY,
  world_id      smallint     NOT NULL REFERENCES worlds(id),
  -- 'migration' = bu dosya · 'maintenance' = normal bakım çıkışı · 'manual' = elle telafi
  kind          text         NOT NULL,
  -- Duraklamanın başı. Göçte NULL (duraklama bu göçün konusu değil).
  paused_at     timestamptz,
  resumed_at    timestamptz  NOT NULL DEFAULT now(),
  -- Kaydırma miktarı (ms). Göçte eski `clock_offset_ms`.
  shift_ms      bigint       NOT NULL,
  -- Bariyer kanıtı: kaydırma anında kaç görev 'running' idi (0 olmalı) ve nasıl doğrulandı.
  drain_running integer,
  drain_proof   text,
  forced        boolean      NOT NULL DEFAULT false,
  actor_id      bigint,
  -- {"missions.execute_at": 12, "cities.resources_at": 47, ...}
  -- ⭐ Kayıt defteri kapsamının TEK nesnel kanıtı: bir tablonun sayısı aniden 0'a düşerse
  --    yüklem bozulmuş demektir. İki bakımı yan yana koyup bakmak yeter.
  rows_by_table jsonb        NOT NULL DEFAULT '{}'::jsonb,
  registry_hash text,
  outcome       text         NOT NULL DEFAULT 'applied'
);
--> statement-breakpoint

-- ⭐ Eşzamanlı iki `resume` çağrısının kaydırmayı İKİ KEZ uygulamasını **yapısal olarak**
-- engeller: ikinci INSERT tekillik kısıtına çarpar ve transaction düşer, hiçbir satır kaymaz.
-- (Uygulama katmanındaki `FOR UPDATE` tek başına yeterdi ama tek satırlık bir kısıt, çok
--  ifadeli bir kaydırmanın idempotansını koda değil VERİTABANINA yaslıyor.)
CREATE UNIQUE INDEX IF NOT EXISTS time_shifts_world_pause
  ON time_shifts (world_id, paused_at) WHERE paused_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS time_shifts_world_at ON time_shifts (world_id, resumed_at DESC);
--> statement-breakpoint

-- ── 1b) TATİL GÖREVİNİN KİMLİĞİ ZAMANDAN AYRILIYOR ──────────────────────────
-- `vacation_end` handler'ı "bu görev BU tatile mi ait?" sorusunu `payload.since` ile
-- `players.vacation_since`i ISO dize olarak karşılaştırarak cevaplıyordu. Kaydırma
-- `vacation_since`i taşır ama JSONB'nin içindekini taşımaz → karşılaştırma tutmaz, handler
-- SESSİZCE no-op'a düşer ve oyuncunun otomatik tatil çıkışı HİÇ OLMAZ.
--
-- ⚠️ JSONB'yi de kaydırmak mümkündü; tercih edilmedi çünkü `information_schema` bekçisi JSONB
--    içine bakamaz — yani o kırılganlık bir daha hiçbir testin göremeyeceği bir yerde yaşardı.
ALTER TABLE players ADD COLUMN IF NOT EXISTS vacation_mission_id bigint;
--> statement-breakpoint

COMMENT ON COLUMN players.vacation_mission_id IS
  'Bu tatili bitirecek vacation_end görevinin kimliği. Zamandan bağımsız — kaydırmaya duyarsız.';
--> statement-breakpoint

-- Hâlihazırda tatilde olan oyuncular için kimliği doldur (eski satırlar `payload.since`
-- yoluna düşerdi; bu, göçten sonra hepsinin yeni yola geçmesini sağlıyor).
UPDATE players p
   SET vacation_mission_id = m.id
  FROM missions m
 WHERE p.vacation_until IS NOT NULL
   AND p.vacation_mission_id IS NULL
   AND m.type = 'vacation_end'
   AND m.status = 'scheduled'
   AND (m.payload->>'playerId')::bigint = p.id;
--> statement-breakpoint

-- ── 2) VADELERİ GERÇEK ZAMANA TAŞI ──────────────────────────────────────────
-- ⚠️ Sabit KODA YAZILMAZ, `worlds.clock_offset_ms` okunur: canlıdaki değer (196.563 ms) araya
--    bir bakım girerse değişir. `clock_offset_ms <> 0` koşulu testleri ve yeni dünyaları
--    (offset zaten 0) boşuna WAL üretmekten korur ve göçü idempotent yapar.
-- ⚠️ Sıralama `time-registry.ts` ile birebir aynı — biri değişirse diğeri de değişmeli.

-- ⚠️ SAĞ TARAFTAKİ SÜTUNLAR NİTELENMELİ (`q.started_at`, `w.clock_offset_ms`).
--    `worlds` tablosunda DA `started_at` var; `FROM worlds` ile birleşen bir UPDATE'te çıplak
--    `started_at` yazmak «column reference is ambiguous» hatası verir (ilk denemede yandı).
UPDATE missions m
   SET execute_at = m.execute_at + (w.clock_offset_ms * interval '1 millisecond')
  FROM worlds w
 WHERE w.id = m.world_id AND w.clock_offset_ms <> 0;
--> statement-breakpoint

UPDATE queues q
   SET finish_at  = q.finish_at  + (w.clock_offset_ms * interval '1 millisecond'),
       started_at = q.started_at + (w.clock_offset_ms * interval '1 millisecond')
  FROM worlds w
 WHERE w.id = q.world_id AND w.clock_offset_ms <> 0;
--> statement-breakpoint

UPDATE cities c
   SET resources_at      = c.resources_at      + (w.clock_offset_ms * interval '1 millisecond'),
       teleport_ready_at = c.teleport_ready_at + (w.clock_offset_ms * interval '1 millisecond'),
       cave_repair_until = c.cave_repair_until + (w.clock_offset_ms * interval '1 millisecond'),
       wall_repair_until = c.wall_repair_until + (w.clock_offset_ms * interval '1 millisecond'),
       wall_repair_from  = c.wall_repair_from  + (w.clock_offset_ms * interval '1 millisecond')
  FROM worlds w
 WHERE w.id = c.world_id AND w.clock_offset_ms <> 0;
--> statement-breakpoint

-- ⚠️ `vacation_since` ile `vacation_until` AYNI ifadede: `players_vacation_pair` CHECK'i
--    (0035_vacation_mode.sql) ikisinin NULL'luk durumunun eşit olmasını zorluyor. Ayrı
--    ifadelere bölmek kısıtı ihlal etmezdi ama gereksiz bir risk açardı.
UPDATE players p
   SET protected_until   = p.protected_until   + (w.clock_offset_ms * interval '1 millisecond'),
       vacation_until    = p.vacation_until    + (w.clock_offset_ms * interval '1 millisecond'),
       vacation_since    = p.vacation_since    + (w.clock_offset_ms * interval '1 millisecond'),
       vacation_ended_at = p.vacation_ended_at + (w.clock_offset_ms * interval '1 millisecond'),
       merit_granted_at  = p.merit_granted_at  + (w.clock_offset_ms * interval '1 millisecond'),
       merit_expires_at  = p.merit_expires_at  + (w.clock_offset_ms * interval '1 millisecond')
  FROM worlds w
 WHERE w.id = p.world_id AND w.clock_offset_ms <> 0;
--> statement-breakpoint

UPDATE heroes h
   SET revive_until = h.revive_until + (w.clock_offset_ms * interval '1 millisecond')
  FROM worlds w
 WHERE w.id = h.world_id AND w.clock_offset_ms <> 0;
--> statement-breakpoint

-- ── 3) DÖNÜŞÜMÜN RESMÎ KAYDI ────────────────────────────────────────────────
-- ⭐ Bu satır, geçmiş kayıtların ölçeğini çözmenin TEK anahtarı: `battles.at`, `messages.at`,
--    `ranking_runs.taken_at` bu andan ÖNCE oyun saatinde, SONRA gerçek zamanda. Geçmişi analiz
--    eden sorgu `at < resumed_at ? at + shift_ms : at` yazabilir.
-- ⚠️ Geçmiş damgalar BİLEREK kaydırılmıyor: `shift_ms` bugünkü TOPLAM, oysa geçmişteki her
--    kayıt kendi anındaki (daha küçük) offset ile yazıldı — hepsine bugünkü toplamı eklemek
--    onları gerçeğinden daha da uzağa taşırdı.
INSERT INTO time_shifts (world_id, kind, paused_at, shift_ms, drain_proof, rows_by_table, outcome)
SELECT id, 'migration', NULL, clock_offset_ms, 'migration',
       jsonb_build_object('note', 'tek zaman cizgisine gecis — 0043_single_timeline'),
       CASE WHEN clock_offset_ms = 0 THEN 'noop' ELSE 'applied' END
  FROM worlds;
--> statement-breakpoint

-- ── 4) OFFSET SIFIRLANIR (kolon DÜŞÜRÜLMEZ) ─────────────────────────────────
-- ⚠️ EXPAND-CONTRACT: `surum-yayinla.sh` sırası *göç → symlink → reload*, yani bu göç koşarken
--    ESKİ KOD hâlâ çalışıyor ve `SELECT clock_offset_ms` yapıyor. Kolonu şimdi düşürseydik
--    symlink değişene kadarki saniyelerde her istek patlardı. Ayrıca sağlık kontrolü düşüp kod
--    geri alınırsa eski kod `gameNow = now() − 0` ile **doğru** çalışmaya devam eder.
--    `DROP COLUMN` ayrı bir sürümde (0044).
UPDATE worlds SET clock_offset_ms = 0 WHERE clock_offset_ms <> 0;
--> statement-breakpoint

-- ── 5) BELGELEME ────────────────────────────────────────────────────────────
COMMENT ON COLUMN worlds.clock_offset_ms IS
  'EMEKLİ (0043). Tek zaman çizgisinde daima 0; bakım artık vadeleri kaydırıyor. 0044te düşecek.';
--> statement-breakpoint
COMMENT ON COLUMN missions.execute_at IS
  'Görevin vadesi — GERÇEK zaman (UTC). Handler bunu "şimdi" kabul eder (ctx.at).';
--> statement-breakpoint
COMMENT ON COLUMN battles.at IS
  'Savaşın anı. 0043 göçünden ÖNCEKİ kayıtlar OYUN saatindedir (gerçek an = at + time_shifts.shift_ms); sonrakiler gerçek zamandadır.';
--> statement-breakpoint
COMMENT ON COLUMN ranking_runs.taken_at IS
  'Anlık görüntü anı. 0043 öncesi OYUN saati, sonrası gerçek zaman — bkz. time_shifts kind=migration.';
