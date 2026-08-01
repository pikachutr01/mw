-- ⭐ DÖNGÜ CANLILIĞI (§admin Faz 8) — scheduler ve outbox dispatcher'ın nabzı.
--
-- ⚠️ **NEDEN AYRI BİR TABLO, NEDEN TÜRETME DEĞİL?**
-- İlk tasarım canlılığı gözlemlenebilir durumdan türetmekti: "vadesi geçmiş görev var mı",
-- "en eski teslim edilmemiş outbox satırı kaç saniyelik". Bu ölçüler ARIZAYI görür ama
-- SAĞLIĞI göremez: kuyruklar boşken ikisi de sıfırdır ve sıfır iki farklı şeyi anlatır —
--   • döngü çalışıyor, yapacak iş yok            → sağlıklı
--   • döngü üç saat önce öldü, yeni iş de gelmedi → ölü
-- İkisini ayırmanın tek yolu döngünün kendi imzasıdır. Bir bakım panelinin en kötü hâli
-- "her şey yolunda" derken sessizce durmuş olmaktır.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  -- scheduler | dispatcher. Aynı süreçte ikisi birden koşar ama AYRI satır tutarlar:
  -- biri takılıp diğeri koşabilir (dispatcher bir e-posta sink'inde bloke olabilir).
  kind       text NOT NULL,
  -- `worker-<pid>` — ROLE=worker ayrı sürece taşındığında iki satır görünür, tek satır değil.
  worker_id  text NOT NULL,
  world_id   smallint,
  pid        integer,
  role       text,
  -- Süreç ne zaman kalktı: `at - started_at` = kesintisiz çalışma süresi. Beklenmedik yeniden
  -- başlamalar (crash-loop) yalnız bu alanla görülür; `at` tazedir ama uptime sıfırlanmıştır.
  started_at timestamptz NOT NULL DEFAULT now(),
  at         timestamptz NOT NULL DEFAULT now(),
  ticks      bigint      NOT NULL DEFAULT 0,
  -- Son turun özeti (claimed/done/lagMs · dispatched/failed/skipped). Panelde "ne yapıyor".
  detail     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (kind, worker_id)
);

-- ⚠️ Nabız yazımı görev transaction'ının DIŞINDA ve **kısıtlanmış** (varsayılan 5 sn):
-- 1 sn'lik poll aralığı saniyede bir UPDATE demekti ve bir izleme kaydının izlediği
-- sistemden daha fazla yazma üretmesi kabul edilemez.
