-- ⭐ AYARLAR (admin Faz 1) — panelden düzenlenen sabitlerin kalıcı hâli.
--
-- ⚠️ `world_id = 0` özel: "tüm dünyalar için varsayılan". Gerçek bir dünya satırı değil, bu
-- yüzden `worlds`a yabancı anahtar YOK. Katman sırası: şema varsayılanı → env → dünya 0 →
-- o dünya. Yeni bir dünya açıldığında hiçbir şema değişmez.
CREATE TABLE IF NOT EXISTS settings (
  world_id   smallint     NOT NULL DEFAULT 0,
  key        text         NOT NULL,
  value      jsonb        NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  updated_by bigint,
  PRIMARY KEY (world_id, key)
);

-- ⭐ EKLEME-YALNIZ GEÇMİŞ. İki işi var:
--   1. "bu değeri kim ne zaman değiştirdi" (denge tartışmasının kanıtı)
--   2. `battles.settings_revision_id` ile geçmiş savaşların hangi ayarla çözüldüğü
-- ⚠️ Bu tablodan SİLME YOK; `audit_log` ile aynı sözleşme.
CREATE TABLE IF NOT EXISTS settings_revisions (
  id         bigserial    PRIMARY KEY,
  world_id   smallint     NOT NULL,
  -- Etkin ayarların TAMAMININ anlık görüntüsü (yalnız değişen değil): bir revizyona bakan
  -- kişi "o an her şey neydi" sorusunu ikinci bir sorgu yapmadan cevaplayabilmeli.
  snapshot   jsonb        NOT NULL,
  -- `applySettings().hash` — içerik parmak izi (FNV-1a 32 bit).
  hash       text         NOT NULL,
  -- Bu revizyonda DEĞİŞEN anahtarlar; panelin "fark" görünümü bunu okur.
  changed    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  actor_id   bigint,
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settings_revisions_world ON settings_revisions (world_id, id DESC);
