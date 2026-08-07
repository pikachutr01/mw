-- ⭐⭐ FAZ 3 — GÖZLEMLENEBİLİRLİK: "ne oldu" sorusunun GERİYE DÖNÜK cevabı.
--
-- Faz 1 arızayı önleyen emniyetleri, Faz 2 zaman çizgisini tekleştirdi. Bu göç üçüncü boşluğu
-- kapatıyor: **06.08.2026 olayında elimizde hiçbir geçmiş yoktu.** Kuyruk 9,5 saat tıkandı ve
-- tanı ancak `missions` tablosundaki satırların `execute_at`/`finished_at` farkından, olay
-- bittikten sonra, elle çıkarılabildi. `lagMs` hesaplanıyordu ama **üzerine yazılan** tek bir
-- nabız satırında 5 saniye yaşıyordu; olayın tepe noktası hiçbir yere kaydedilmemişti.
--
-- Dört yapı:
--   1. `scheduler_samples` — kuyruk sağlığının ZAMAN SERİSİ (dakikada bir örnek).
--   2. `missions` + 4 kolon — her görevin kuyrukta bekleme ve çalışma süresi ayrı ayrı.
--   3. `mission_errors`  — hata GEÇMİŞİ (`missions.last_error` üzerine yazılıyor, ilk hata kayıp).
--   4. `ops_events`      — eşik aşımlarının açılıp kapanan kaydı + alarm gönderim izi.
--
-- ⚠️ Hepsi **gerçek zamanda** (`now()`), oyun saatinde değil. Bunlar oyun olayı değil ALTYAPI
-- ölçümü: bakımda saat donsa bile "worker 3 dakikadır nabız atmıyor" gerçek bir arızadır.
-- Bu yüzden dördünün de zaman kolonları `time-registry.ts` → `NON_TIMELINE_COLUMNS`'ta.

-- ── 1. KUYRUK ÖRNEKLERİ ──────────────────────────────────────────────────────
--
-- ⭐ `skipped_locked` bu tablonun VAR OLMA SEBEBİ: 06.08'de `claimed = 0` görülüyordu ve bu
-- "iş yoktu" ile "iş vardı ama `SKIP LOCKED` atladı"yı ayırt edemiyordu. `due - claimed`
-- farkı o ayrımı veriyor ve ancak zaman içinde bakılırsa anlam kazanıyor: tek turda sıfırdan
-- büyük olması normal bir yarıştır, on tur üst üste büyük olması arızadır.
--
-- ⚠️ Boyut hesabı: dakikada 1 satır × dünya sayısı = günde ~1.440 satır, satır ~120 bayt →
-- **yılda ~60 MB**. 40 GB diskte kabul edilebilir; yine de `CLEANUP_JOBS`a bir görev eklendi
-- (`ops-jobs.ts` → `scheduler_samples`), varsayılan saklama 30 gün.
CREATE TABLE IF NOT EXISTS "scheduler_samples" (
    "id"                   bigserial PRIMARY KEY NOT NULL,
    "world_id"             smallint NOT NULL,
    "at"                   timestamptz DEFAULT now() NOT NULL,
    "worker_id"            text,
    -- Kuyruğun o andaki hâli (`mission.repository.ts` → `dueStats`)
    "lag_ms"               bigint  DEFAULT 0 NOT NULL,
    "due_count"            integer DEFAULT 0 NOT NULL,
    "claimed"              integer DEFAULT 0 NOT NULL,
    "skipped_locked"       integer DEFAULT 0 NOT NULL,
    "stuck"                integer DEFAULT 0 NOT NULL,
    -- Durum sayıları (`countByStatus`)
    "scheduled"            integer DEFAULT 0 NOT NULL,
    "running"              integer DEFAULT 0 NOT NULL,
    "failed"               integer DEFAULT 0 NOT NULL,
    "reaped"               integer DEFAULT 0 NOT NULL,
    "dead"                 integer DEFAULT 0 NOT NULL,
    -- ⭐ En eski kilidin yaşı: `reapStale` eşiğine ne kadar yaklaşıldığını gösterir.
    "oldest_locked_age_ms" bigint,
    -- Bağlantı havuzu — 06.08 olayının KÖK NEDENİ buradaydı (terk edilmiş transaction).
    "pool_idle_in_tx"      integer,
    "oldest_tx_s"          integer,
    -- Outbox sağlığı: ölü mektup sayısı ve en eski bekleyen satırın yaşı.
    "outbox_pending"       integer,
    "outbox_dead"          integer,
    -- Bakımda alınan örnek: kuyruk ilerlemiyor ama bu ARIZA DEĞİL. Grafikte ayırt edilebilsin.
    "paused"               boolean DEFAULT false NOT NULL
);
--> statement-breakpoint

-- Panel "son 24 saat" çiziyor → dünya + zaman, azalan.
CREATE INDEX IF NOT EXISTS "scheduler_samples_world_at"
    ON "scheduler_samples" USING btree ("world_id","at" DESC);
--> statement-breakpoint

-- ── 2. GÖREVİN ZAMAN KÜNYESİ ─────────────────────────────────────────────────
--
-- ⚠️⚠️ Bugüne kadar gecikme `finished_at - execute_at` ile çıkarılmaya çalışılıyordu ve bu
-- **matematiksel olarak yanlıştı**: `execute_at` oyun saatinde, `finished_at` gerçek zamanda.
-- Faz 2 (0043) o farkı kapattı; artık ikisi aynı çizgide. Ama tek bir fark hâlâ iki ayrı şeyi
-- karıştırıyor: **kuyrukta bekleme** (arıza göstergesi) ile **handler süresi** (performans
-- göstergesi). Yavaş bir savaş çözümü ile tıkanmış bir kuyruk aynı sayıyı üretiyordu.
--
--   lag_ms      = claimed_at − execute_at   → KUYRUKTA bekledi (scheduler geç aldı)
--   duration_ms = finished_at − claimed_at  → HANDLER çalıştı  (iş gerçekten uzun sürdü)
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "claimed_at"  timestamptz;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "lag_ms"      bigint;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint

-- ⭐ `locked_by` bitişte NULL'lanıyordu → "bu görevi hangi worker işledi" sorusu, tam da çok
-- süreçli bir dağıtımda cevaplanamaz hâle geliyordu. `completed_by` kalıcı; `locked_by` canlı
-- kilit alanı olarak kalıyor (`reapStale` onu okuyor).
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "completed_by" text;--> statement-breakpoint

COMMENT ON COLUMN "missions"."lag_ms" IS
    'Kuyrukta bekleme: claimed_at - execute_at (ms). Arıza göstergesi.';
--> statement-breakpoint
COMMENT ON COLUMN "missions"."duration_ms" IS
    'Handler süresi: finished_at - claimed_at (ms). Performans göstergesi.';
--> statement-breakpoint

-- ── 3. HATA GEÇMİŞİ ──────────────────────────────────────────────────────────
--
-- ⚠️ `missions.last_error` her denemede ÜZERİNE yazılıyor. Beş kez denenip ölen bir görevde
-- elimizde yalnız SONUNCU hata kalıyor — oysa tanı için gereken genelde İLKİdir (sonrakiler
-- çoğu zaman birincinin yan etkisi). Bu tablo ekleme-yalnız: hiçbir kod satırı UPDATE etmiyor.
--
-- ⚠️ `ON DELETE CASCADE`: görev temizliğe girerse hatası da gitsin (öksüz satır kalmasın).
CREATE TABLE IF NOT EXISTS "mission_errors" (
    "id"         bigserial PRIMARY KEY NOT NULL,
    "mission_id" bigint NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
    "world_id"   smallint NOT NULL,
    "at"         timestamptz DEFAULT now() NOT NULL,
    -- Kaçıncı deneme patladı (1 tabanlı — `missions.attempts` alım anında artıyor).
    "attempt"    smallint DEFAULT 0 NOT NULL,
    "mission_type" text,
    "error"      text NOT NULL,
    -- retry | dead — bu hata sonrasında görevin akıbeti.
    "outcome"    text NOT NULL,
    "worker_id"  text
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mission_errors_mission" ON "mission_errors" USING btree ("mission_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mission_errors_world_at" ON "mission_errors" USING btree ("world_id","at" DESC);--> statement-breakpoint

-- ── 4. OPERASYON OLAYLARI ────────────────────────────────────────────────────
--
-- ⭐⭐ **AÇILIP KAPANAN olay, tekrarlanan alarm DEĞİL.** Eşik aşıldığında bir satır açılır
-- (`opened_at`), normale dönünce kapanır (`resolved_at`). Aradaki her tur yalnız `peak`/`samples`
-- alanlarını günceller.
--
-- ⚠️ Alternatif tasarım (her turda bir satır + e-posta) denenmedi çünkü sonucu belli: saniyede
-- bir koşan bir döngüde 9,5 saatlik bir arıza **34.000 satır ve 34.000 e-posta** üretirdi. Alarm
-- sisteminin kendisi arızadan daha büyük bir olay olurdu ve gerçek uyarı gürültüde kaybolurdu.
--
-- ⚠️ Tekillik UYGULAMA KATMANINDA DEĞİL, indekste: `ops_events_open` kısmî unique indeksi
-- "(dünya, tür) başına en fazla bir AÇIK olay" kuralını yapısal kılıyor. İki worker aynı anda
-- eşiği görürse ikincisinin INSERT'ü çakışır ve `ON CONFLICT DO NOTHING` ile sessizce düşer —
-- çift alarm imkânsız. (`time_shifts_world_pause` ile aynı felsefe.)
CREATE TABLE IF NOT EXISTS "ops_events" (
    "id"          bigserial PRIMARY KEY NOT NULL,
    "world_id"    smallint,
    -- queue_lag | queue_stuck | mission_dead | outbox_dead | worker_stale | idle_in_tx | ...
    "kind"        text NOT NULL,
    -- warn | crit
    "severity"    text DEFAULT 'warn' NOT NULL,
    "opened_at"   timestamptz DEFAULT now() NOT NULL,
    "resolved_at" timestamptz,
    -- Eşiği aşan ölçüm: açılış değeri, gördüğümüz en kötü değer, eşiğin kendisi.
    "value"       double precision,
    "peak"        double precision,
    "threshold"   double precision,
    -- Olay açıkken kaç kez ölçüldü — "bir kerelik sıçrama" ile "kalıcı arıza" ayrımı.
    "samples"     integer DEFAULT 1 NOT NULL,
    "detail"      jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- Alarm gönderim izi. NULL = hiç gönderilmedi (eşik `warn`di ya da outbox tıkalıydı).
    "notified_at" timestamptz,
    "outbox_id"   bigint
);
--> statement-breakpoint

-- ⭐ Bir (dünya, tür) için aynı anda YALNIZ BİR açık olay. Alarmın tekrarlamamasının garantisi.
-- ⚠️ `world_id` NULL olabiliyor (dünyadan bağımsız olaylar: `outbox_dead` küresel bir kuyruk).
-- `COALESCE` ile −1'e indirgeniyor, yoksa NULL'lar birbiriyle çakışmaz ve kural delinirdi.
CREATE UNIQUE INDEX IF NOT EXISTS "ops_events_open"
    ON "ops_events" USING btree ((COALESCE("world_id", -1)), "kind")
    WHERE "resolved_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ops_events_world_at"
    ON "ops_events" USING btree ("world_id","opened_at" DESC);
--> statement-breakpoint

-- ── 5. DENETİM KAYDI İNDEKSLERİ ──────────────────────────────────────────────
--
-- ⚠️ `audit_log`ta bugüne kadar yalnız `(player_id, at)` ve `(entity, entity_id, at)` vardı.
-- Panelin en çok sorduğu iki soru ise indekssizdi ve **tam tablo taraması** yapıyordu:
--   "son 1 saatte bu dünyada ne oldu"  → (world_id, at DESC)
--   "bu işlem türü ne zaman koştu"     → (action, at DESC)
-- Tablo ekleme-yalnız ve hiç temizlenmiyor (bilerek — denetim kaydı silinemez), yani tarama
-- maliyeti zamanla YALNIZCA artıyor. İki indeks kalıcı bir borcu kapatıyor.
CREATE INDEX IF NOT EXISTS "audit_world_at" ON "audit_log" USING btree ("world_id","at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_action_at" ON "audit_log" USING btree ("action","at" DESC);
