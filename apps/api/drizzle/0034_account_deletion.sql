-- ⭐ HESAP SİLME (kullanıcı, 2026-08-01) — mağaza şartı ve oyuncunun hakkı.
--
-- Model: oyuncu **anonimleşir**, hesap **sterilize edilir**, başkent **dünyada kalır**.
-- Silmek yerine anonimleştirmenin sebebi: başkent gerçek bir şehir; satırı yok etmek savaş
-- geçmişinde, sıralamada ve komşuların raporlarında delik açardı. Kişisel veri (e-posta,
-- parola, oturum, push aboneliği) ise gerçekten siliniyor.

-- ── 1) hükümdarN sayacı ─────────────────────────────────────────────────────
-- ⚠️ DÜNYA BAŞINA: kullanıcı adı tekilliği `(world_id, username)` üzerinde, yani her dünya
-- kendi 1'inden başlayabilir ve sayılar küçük kalır. Sayaç `SELECT … FOR UPDATE` ile
-- kilitlenerek artırılır → iki eşzamanlı silme aynı adı üretemez.
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS deleted_player_seq integer NOT NULL DEFAULT 0;

-- ── 2) silinmiş oyuncu işareti ──────────────────────────────────────────────
-- ⚠️ Satır KALIYOR (başkentin sahibi olarak) ama artık oynanamaz: `accounts` sterilize
-- edildiği için giriş imkânsız. Bu kolon "bu bir oyuncu değil, bir kalıntı" demenin tek yolu;
-- olmadan panel ve moderasyon anonim satırları normal oyuncu sanırdı.
ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS players_deleted ON players (world_id) WHERE deleted_at IS NOT NULL;
