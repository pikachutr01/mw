-- ⭐ OYUNCU CEZASI — süreli ban + şehirlerin savaşa açık/kapalı olması.
--
-- `players.banned_at` zaten vardı ve girişi engelliyordu, ama iki eksiği vardı:
--   1. **Süresi yoktu** — bir kez yazıldı mı sonsuza kadar yasaklıydı, "3 gün ceza" verilemiyordu.
--   2. Cezalı oyuncunun ŞEHİRLERİNE ne olacağı tanımsızdı.
--
-- İkinci soru asıl olan. Oyuncu giremiyor, yani şehirlerini savunamıyor:
--   • `open`   — şehirleri **saldırıya açık** kalır. Kalıcı yasakta doğru olan bu: hesap
--                geri gelmeyecek, şehirleri dünyanın kaynağı olur.
--   • `closed` — şehirleri **korunur**. Süreli cezada doğru olan bu: oyuncu döndüğünde
--                imparatorluğunu bulur. Casusluk yine serbest (dünya kör kalmasın),
--                ama nakliye/destek de kapalı — kimse cezalıya kaynak veya ordu park edemesin.
ALTER TABLE players
  -- NULL = SÜRESİZ. ⚠️ Süresiz ceza daima `open` olur (aşağıdaki CHECK).
  ADD COLUMN IF NOT EXISTS ban_until  timestamptz,
  ADD COLUMN IF NOT EXISTS ban_mode   text,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS banned_by  bigint;

-- ⚠️ Kural veri tabanında da duruyor, yalnız uygulamada değil: "süresiz ceza saldırıya
-- açıktır" bir ürün kararı ve elle SQL ile bile delinmemeli.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_ban_mode_ck;
ALTER TABLE players ADD CONSTRAINT players_ban_mode_ck CHECK (
  ban_mode IS NULL
  OR (ban_mode = 'open')
  OR (ban_mode = 'closed' AND ban_until IS NOT NULL)
);

-- Geçmişte yazılmış (süresiz) yasakların modu: açık.
UPDATE players SET ban_mode = 'open' WHERE banned_at IS NOT NULL AND ban_mode IS NULL;

-- Sefer hedefi kontrolü her saldırı/nakliye/casusluk denemesinde bu satırı okuyor.
CREATE INDEX IF NOT EXISTS players_banned ON players (id)
  WHERE banned_at IS NOT NULL;
