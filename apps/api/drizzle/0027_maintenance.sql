-- ⭐ BAKIM MODU (admin Faz 2) — donma altyapısı zaten vardı, EKSİK OLAN "neden" idi.
--
-- `worlds.state` + `paused_at` + `clock_offset_ms` 0001'den beri duruyor ve oyun saatini
-- donduruyor. Ama oyuncuya gösterilecek bir metin yoktu: perde açılınca ekranda yalnız
-- "bakım" yazsaydı oyuncu ne kadar süreceğini bilemezdi ve destek kutusu dolardı.
ALTER TABLE worlds
  -- Oyuncuya AYNEN gösterilir. NULL ise istemci genel bir metin yazar (perde yine açılır —
  -- metnin yokluğu bakımı gizlememeli).
  ADD COLUMN IF NOT EXISTS maintenance_notice text,
  -- ⚠️ GERÇEK ZAMAN, oyun saati değil: bakımda oyun saati DONUYOR, tahmini bitişi oyun
  -- saatinde tutsaydık geri sayım hiç ilerlemezdi.
  ADD COLUMN IF NOT EXISTS maintenance_eta timestamptz,
  -- Kim başlattı (audit_log'a ek olarak; perde açıkken tek sorguda görünsün).
  ADD COLUMN IF NOT EXISTS maintenance_by bigint;
