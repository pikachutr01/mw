-- ⭐ SIRALAMA MUAFİYETİ (kullanıcı, 2026-08-03) — yönetici/servis hesaplarını listeden gizle.
--
-- Kullanıcının isteği: *"benim yönetici hesabımı sıralamadan muaf tutup göstermek
-- istemeyebilirim… bir kullanıcıyı muaf olarak seçince ittifak sıralamasındaki toplam puandan
-- da muaf olup olmayacağını da sorsun. Bu ikisinden de muaf olsa bile kahramanı varsa o
-- listede gözüksün."*
--
-- ⚠️ **İKİ AYRI BAYRAK, bilerek.** Tek bayrak yapmak "listede görünmesin ama ittifakının
-- puanına katkısı sayılsın" durumunu imkânsız kılardı — ittifakında oynayan bir yönetici için
-- doğru davranış tam olarak budur. İkisi bağımsız:
--   • `ranking_excluded`        → OYUNCU sıralamasında satırı hiç yazılmaz
--   • `alliance_score_excluded` → İTTİFAK toplamına puanı eklenmez
--
-- ⚠️ **KAHRAMAN sıralaması ikisinden de ETKİLENMEZ** (kullanıcı şartı). Kahraman listesi
-- `heroes` tablosundan geliyor ve sahibinin bayrağına hiç bakmıyor; `ranking.service.ts`
-- içindeki kahraman dalı bu göçten sonra da olduğu gibi kalmalı.
--
-- ⚠️ Bu bayraklar `banned_at`ten AYRI bir kavram: yasaklı oyuncu cezalıdır ve zaten her yerden
-- düşer; muaf oyuncu ise oyunu normal oynar, yalnız vitrinde durmaz.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS ranking_excluded        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alliance_score_excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN players.ranking_excluded        IS 'true ⇒ oyuncu sıralamasında hiç görünmez (kahraman sıralaması etkilenmez).';
COMMENT ON COLUMN players.alliance_score_excluded IS 'true ⇒ puanı ittifakın toplamına eklenmez.';

-- Muaf oyuncu azınlıkta kalacağı için kısmi indeks: sıralama koşumundaki DELETE bunu okuyor.
CREATE INDEX IF NOT EXISTS players_ranking_excluded ON players (world_id, id)
  WHERE ranking_excluded;
