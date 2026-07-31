-- ⭐ ADMIN ROLÜ + ADIM YÜKSELTME (Faz 0)
--
-- `role` HESAP düzeyinde, oyuncu düzeyinde değil: yetki dünyalardan bağımsızdır (bir admin
-- her dünyayı yönetir). Oyuncu rolleri (ittifak lideri vb.) zaten `players.alliance_role`da.
--
-- ⚠️ Rol TOKEN'A GÖMÜLMEZ, `AdminGuard` her istekte buradan okur. 15 dakikalık access token'a
-- gömülseydi rol geri alındığında 15 dakika boyunca geçerli kalırdı.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';

-- ⚠️ CHECK yerine uygulama doğrulaması TERCİH EDİLMEDİ: rol kümesi küçük ve sabit; yanlış bir
-- değerin veritabanına girmesi sessiz yetki hatası demek olurdu.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
  CHECK (role IN ('player', 'moderator', 'admin'));

-- Yalnız yetkili hesaplar indekslenir: 10.000 oyuncunun 9.999'u 'player', kısmi indeks
-- tam indeksin binde biri kadar yer kaplar.
CREATE INDEX IF NOT EXISTS accounts_staff ON accounts (role) WHERE role <> 'player';

-- ⭐ ADIM YÜKSELTME — yıkıcı admin işlemleri (silme, sabit kaydetme, ham düzenleme) için
-- parola yeniden sorulur ve bu ana kadar geçerli sayılır. OTURUMDA tutulur, token'da değil:
-- token durumsuz, yükseltmenin geri alınabilir olması şart.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS elevated_until timestamptz;
