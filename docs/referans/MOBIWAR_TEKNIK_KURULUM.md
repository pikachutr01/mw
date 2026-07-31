# MOBIWAR — TEKNİK KURULUM: Veritabanı · Teknoloji Seti · Lokal → VPS

> **Tarih:** 2026-07-25 · Tamamlayıcı: `MOBIWAR_SISTEM_PLANI.md` (mimari kararlar, görev/zaman omurgası,
> harita modeli, yerleşim algoritması, dünya sabitleri).

---

# 1. VERİTABANI

## 1.1 Seçim: PostgreSQL 17 — gerekçe (MySQL değil, neden?)

| İhtiyaç | Postgres | MySQL 8 |
|---|---|---|
| Görev kuyruğu (`FOR UPDATE SKIP LOCKED`) | ✅ olgun, yaygın | ✅ 8.0+ var ama ekosistem zayıf |
| **Danışsal kilit** (`pg_advisory_xact_lock(city_id)`) | ✅ yerleşik, transaction-kapsamlı | ❌ `GET_LOCK` var ama transaction'a bağlı değil → savaş sıralamasında güvensiz |
| JSONB (savaş girdisi/raporu, config) + üzerinde indeks | ✅ GIN | ⚠️ JSON var, indeksleme hantal |
| Kısmi/ifade indeksi (`WHERE status='scheduled'`) | ✅ | ❌ yok |
| `CHECK`, `EXCLUDE`, enum, transactional DDL | ✅ | ⚠️ kısmi |
| PITR (WAL) + wal-g/pgBackRest | ✅ standart | ✅ ama araç zinciri daha dağınık |

Savaş sırasının doğruluğu **advisory lock**'a, görev kuyruğu **SKIP LOCKED + kısmi indekse** bağlı.
İkisi de Postgres'te birinci sınıf. **Karar: PostgreSQL 17.** Yan: **Redis 7** (presence, WS pub/sub,
rate limit, kısa-ömürlü cache). Redis'te **kalıcı oyun durumu tutulmaz** — kaybolursa oyun etkilenmez.

## 1.2 Şema (DDL taslağı — `drizzle-kit` migration'larına birebir çevrilir)

```sql
-- ═══ DÜNYA & OYUNCU ════════════════════════════════════════════════════════
CREATE TYPE world_state AS ENUM ('running','maintenance','frozen','archived');

CREATE TABLE worlds (
  id              smallserial PRIMARY KEY,
  code            text UNIQUE NOT NULL,              -- 'tr1'
  name            text NOT NULL,
  state           world_state NOT NULL DEFAULT 'running',
  clock_offset_ms bigint NOT NULL DEFAULT 0,         -- §2 oyun saati
  paused_at       timestamptz,
  config          jsonb NOT NULL,                    -- §13.7 dünya sabitleri
  catalog_hash    text NOT NULL,
  seed            bigint NOT NULL,                   -- yerleşim/rng tohumu
  started_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='maintenance') = (paused_at IS NOT NULL) OR state<>'maintenance')
);

CREATE TABLE accounts (                              -- dünyalardan BAĞIMSIZ kimlik
  id             bigserial PRIMARY KEY,
  email          citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  password_hash  text NOT NULL,                      -- argon2id
  created_at     timestamptz NOT NULL DEFAULT now(),
  locked_until   timestamptz, failed_logins smallint NOT NULL DEFAULT 0,
  ui_theme       text NOT NULL DEFAULT 'system'       -- 'system'|'light'|'dark' (SİSTEM PLANI §13.13.4)
    CHECK (ui_theme IN ('system','light','dark')),    -- cihazlar arası taşınsın diye hesapta
  ui_locale      text NOT NULL DEFAULT 'tr'           -- i18n (§13.14.2)
);

CREATE TABLE players (                               -- dünya BAŞINA oyuncu
  id            bigserial PRIMARY KEY,
  world_id      smallint NOT NULL REFERENCES worlds(id),
  account_id    bigint  NOT NULL REFERENCES accounts(id),
  username      text NOT NULL,                       -- değiştirilemez
  score         bigint NOT NULL DEFAULT 0,
  is_premium    boolean NOT NULL DEFAULT false,
  protected_until timestamptz,                       -- 72 sa başlangıç koruması
  vacation_until  timestamptz,
  alliance_id   bigint,
  banned_at     timestamptz, last_seen_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, username),
  UNIQUE (world_id, account_id)                      -- bir hesap, bir dünyada bir oyuncu
);
CREATE INDEX ON players (world_id, score DESC);

-- ═══ ŞEHİR & YAPI ══════════════════════════════════════════════════════════
CREATE TABLE cities (
  id          bigserial PRIMARY KEY,
  world_id    smallint NOT NULL REFERENCES worlds(id),
  player_id   bigint REFERENCES players(id),         -- NULL = boş yuva (rezerve/terk)
  name        text NOT NULL,
  k smallint NOT NULL, d smallint NOT NULL, s smallint NOT NULL,  -- kıta:diyar:şehir
  is_capital  boolean NOT NULL DEFAULT false,
  gold        numeric(20,4) NOT NULL DEFAULT 0,
  food        numeric(20,4) NOT NULL DEFAULT 0,
  resources_at timestamptz NOT NULL DEFAULT now(),   -- tembel birikim çıpası (§3)
  founded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, k, d, s),                        -- yuva tekliği = yerleşim yarışını çözer
  CHECK (k BETWEEN 1 AND 10 AND d BETWEEN 1 AND 500 AND s BETWEEN 1 AND 10)
);
CREATE INDEX ON cities (world_id, player_id);
CREATE INDEX ON cities (world_id, k, d) WHERE player_id IS NOT NULL;   -- diyar doluluk sorgusu

CREATE TABLE buildings (city_id bigint REFERENCES cities(id) ON DELETE CASCADE,
  type text NOT NULL, level smallint NOT NULL DEFAULT 0, PRIMARY KEY (city_id,type));
CREATE TABLE units      (city_id bigint REFERENCES cities(id) ON DELETE CASCADE,
  type text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY (city_id,type),
  CHECK (count >= 0));
CREATE TABLE cave_units (city_id bigint, type text, count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id,type));
CREATE TABLE defenses   (city_id bigint, type text, count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id,type));
CREATE TABLE walls      (city_id bigint PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 0, integrity numeric(6,4) NOT NULL DEFAULT 1,
  repair_finish_at timestamptz);
CREATE TABLE techs      (player_id bigint REFERENCES players(id) ON DELETE CASCADE,
  type text NOT NULL, level smallint NOT NULL DEFAULT 0, PRIMARY KEY (player_id,type));
CREATE TABLE heroes (
  id bigserial PRIMARY KEY, world_id smallint NOT NULL, player_id bigint NOT NULL,
  city_id bigint, name text NOT NULL, level smallint NOT NULL DEFAULT 0,
  xp bigint NOT NULL DEFAULT 0, durum numeric(6,2) NOT NULL DEFAULT 100,
  f_atk smallint DEFAULT 0, f_def smallint DEFAULT 0,
  m_atk smallint DEFAULT 0, m_def smallint DEFAULT 0,
  unspent_points smallint DEFAULT 0, dead_until timestamptz);

-- ═══ KUYRUKLAR & GÖREVLER ══════════════════════════════════════════════════
CREATE TABLE queues (                                -- bina/birim/teknik/dirilt
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  city_id bigint NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category text NOT NULL,                            -- 'building'|'unit'|'defense'|'tech'|'hero'
  item_type text NOT NULL, count integer NOT NULL DEFAULT 1, done integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL, finish_at timestamptz NOT NULL,
  spent_gold bigint NOT NULL, spent_food bigint NOT NULL);
CREATE INDEX ON queues (city_id, finish_at);

CREATE TYPE mission_status AS ENUM ('scheduled','running','done','failed','cancelled');
CREATE TABLE missions (
  id bigserial PRIMARY KEY,
  world_id smallint NOT NULL REFERENCES worlds(id),
  type text NOT NULL,                                -- attack|support|transport|spy|found|teleport|return|…
  status mission_status NOT NULL DEFAULT 'scheduled',
  owner_player_id bigint NOT NULL REFERENCES players(id),
  origin_city_id  bigint REFERENCES cities(id),
  target_city_id  bigint REFERENCES cities(id),
  target_k smallint, target_d smallint, target_s smallint,
  execute_at   timestamptz NOT NULL,                 -- OYUN SAATİNDE
  created_at   timestamptz NOT NULL DEFAULT now(),
  locked_by text, locked_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0, last_error text,
  idempotency_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}');
-- ⭐ kuyruğun kalbi: kısmi indeks → milyonlarca satırda bile due-sorgu O(log n)
CREATE INDEX missions_due ON missions (execute_at, id) WHERE status = 'scheduled';
CREATE INDEX ON missions (target_city_id, execute_at) WHERE status = 'scheduled';
CREATE INDEX ON missions (owner_player_id, status);

CREATE TABLE mission_units (mission_id bigint REFERENCES missions(id) ON DELETE CASCADE,
  unit_type text NOT NULL, count integer NOT NULL, PRIMARY KEY (mission_id,unit_type));
CREATE TABLE mission_heroes (mission_id bigint, hero_id bigint, PRIMARY KEY (mission_id,hero_id));

-- ═══ SAVAŞ & İLETİŞİM ══════════════════════════════════════════════════════
CREATE TABLE battles (
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  mission_id bigint UNIQUE REFERENCES missions(id),  -- ⭐ idempotency: çift savaş imkânsız
  attacker_id bigint, defender_id bigint, city_id bigint,
  engine_version text NOT NULL, catalog_hash text NOT NULL, rng_seed bigint NOT NULL,
  input  jsonb NOT NULL,                             -- ⭐ tam girdi → birebir yeniden oynatılabilir
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON battles (defender_id, created_at DESC);
CREATE INDEX ON battles (attacker_id, created_at DESC);

CREATE TABLE messages (                              -- YALNIZ rapor + sistem bildirimi (sohbet DEĞİL)
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  player_id bigint NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL,                                -- 'battle'|'spy'|'transport'|'system'
  from_player_id bigint, subject text NOT NULL, body jsonb NOT NULL,
  battle_id bigint REFERENCES battles(id),
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON messages (player_id, created_at DESC);
CREATE INDEX ON messages (player_id) WHERE read_at IS NULL;

-- ═══ SOHBET (SİSTEM PLANI §13.12) ══════════════════════════════════════════
-- Üç kanal tek çekirdek: 'global' (dünya geneli) · 'alliance' (yalnız üyeler) · 'dm' (iki oyuncu)
-- ⚠️ DÜNYA YALITIMI (§13.12.1b): her kanal world_id taşır; dm_key player.id'lerden üretilir
--    (account.id'den ASLA) → aynı hesabın iki dünyadaki oyuncusu birbirine mesaj atamaz.
CREATE TABLE chat_channels (
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('global','alliance','dm')),
  alliance_id bigint,                                -- FK, alliances migration'ında eklenir (Faz 4)
  dm_key text,                                       -- least(a,b)||':'||greatest(a,b)
  slow_mode_s smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX ON chat_channels (world_id)              WHERE kind = 'global';
CREATE UNIQUE INDEX ON chat_channels (world_id, alliance_id) WHERE kind = 'alliance';
CREATE UNIQUE INDEX ON chat_channels (world_id, dm_key)      WHERE kind = 'dm';

CREATE TABLE chat_participants (                     -- 'global'te satır yok (üyelik örtük)
  channel_id bigint REFERENCES chat_channels(id) ON DELETE CASCADE,
  player_id bigint REFERENCES players(id) ON DELETE CASCADE,
  last_read_message_id bigint NOT NULL DEFAULT 0,    -- okunmamış = COUNT(id > bu)
  muted_until timestamptz, notify boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, player_id));

CREATE TABLE chat_messages (
  id bigserial PRIMARY KEY,
  channel_id bigint NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  world_id smallint NOT NULL,
  sender_id bigint REFERENCES players(id) ON DELETE SET NULL,   -- NULL = sistem duyurusu
  body text NOT NULL CHECK (length(body) <= 500),               -- düz metin, HTML yok
  client_msg_id uuid,                                           -- idempotency (yeniden bağlanma)
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, deleted_by bigint);
CREATE INDEX ON chat_messages (channel_id, id DESC);            -- imleçli sayfalama + okunmamış
CREATE UNIQUE INDEX ON chat_messages (channel_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

CREATE TABLE chat_bans (
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  player_id bigint NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('global','all')),
  until timestamptz, reason text, created_by bigint,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON chat_bans (player_id, until);

CREATE TABLE chat_reports (
  id bigserial PRIMARY KEY, world_id smallint NOT NULL,
  message_id bigint NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id bigint NOT NULL, reason text,
  resolved_at timestamptz, resolved_by bigint,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE outbox (                                -- ⭐ transactional outbox (§1 akış)
  id bigserial PRIMARY KEY, topic text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz, attempts smallint NOT NULL DEFAULT 0, last_error text);
CREATE INDEX outbox_pending ON outbox (id) WHERE dispatched_at IS NULL;

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, world_id smallint, player_id bigint,
  action text NOT NULL, entity text, entity_id bigint,
  before jsonb, after jsonb, trace_id text, ip inet,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON audit_log (player_id, at DESC);
CREATE INDEX ON audit_log (entity, entity_id, at DESC);

-- ═══ SOSYAL & ALTYAPI ══════════════════════════════════════════════════════
CREATE TABLE alliances (id bigserial PRIMARY KEY, world_id smallint, name text,
  leader_id bigint, text_body text, created_at timestamptz DEFAULT now(),
  UNIQUE (world_id, name));
CREATE TABLE alliance_members (alliance_id bigint, player_id bigint PRIMARY KEY, role text);
CREATE TABLE push_subscriptions (id bigserial PRIMARY KEY, account_id bigint,
  platform text, endpoint text, keys jsonb, fcm_token text, created_at timestamptz DEFAULT now(),
  UNIQUE (account_id, endpoint));
CREATE TABLE sessions (id uuid PRIMARY KEY, account_id bigint, refresh_hash text,
  ip inet, ua text, device_hash text, expires_at timestamptz, revoked_at timestamptz);
CREATE TABLE rankings_snapshot (world_id smallint, taken_at timestamptz,
  player_id bigint, rank int, score bigint, PRIMARY KEY (world_id,taken_at,player_id));
```

### Şemadaki kritik kararlar
1. **`accounts` ≠ `players`.** Kimlik dünyalardan bağımsız; bir hesap birden çok dünyada oynar
   (doküman: *"bir kullanıcının birden fazla dünyada hesabı olabilir"*). Şifre/e-posta tek yerde.
2. **`cities` satırı = harita yuvası.** `UNIQUE(world_id,k,d,s)` yerleşim yarışını veritabanı
   seviyesinde çözer; iki oyuncu aynı koordinata şehir kuramaz (§13.6.5).
3. **Kaynaklar `numeric`, `resources_at` çıpası.** Tembel birikim kayıpsız; float yuvarlama hatası yok.
4. **`missions_due` kısmi indeksi** kuyruğun performans temeli: tamamlanmış milyonlarca görev indekste yer kaplamaz.
5. **`battles.input` + `rng_seed` + `engine_version`** → her savaş yeniden oynatılabilir (motor sürekli
   değişeceği için pazarlıksız).
6. **`outbox`** savaş transaction'ıyla aynı anda yazılır → "savaş oldu ama rapor gitmedi" imkânsız.
7. **Sayaç alanları (`score`) türetilebilir ama saklanır** — sıralama sorgusu her seferinde
   yeniden hesaplanamaz; `audit_log` ile denetlenir, gece işiyle mutabakat yapılır.

## 1.3 Veri saklama & büyüme
- `audit_log`, `messages`, `battles`, `chat_messages` en hızlı büyüyen tablolar → **aylık partition** (pg_partman veya
  elle `PARTITION BY RANGE (created_at)`); 6 aydan eski partition'lar sıkıştırılıp arşive taşınır.
- **Sohbet saklama süresi** ayrıca kısa: `world_config.chat.retentionDays` (genel 30 gün · ittifak
  180 gün · DM süresiz) → gece işi eski partition'ları doğrudan `DROP` eder, satır silmez.
- Katalog verisi (birim/yapı statları, üretim formülleri) **DB'de değil, kodda** (`packages/catalog`),
  hash'i `worlds.catalog_hash`'te. Böylece "hangi dengeyle oynandı" her savaşta kayıtlı.

---

# 2. TEKNOLOJİ SETİ

| Katman | Seçim | Neden |
|---|---|---|
| Dil | **TypeScript 5.9**, Node 22 LTS | motor + sunucu + web tek dil, tek doğruluk kaynağı |
| Monorepo | **pnpm workspaces + Turborepo** | hızlı, disk-dostu, iyi cache |
| Backend | **NestJS 11 + Fastify adaptörü** | modüler DI (test edilebilir), Fastify Express'ten belirgin hızlı |
| ORM | **Drizzle ORM + drizzle-kit** | SQL-first ve tipli; `SKIP LOCKED`, advisory lock, CTE'ye rahat iner. *(Prisma bu kalıplarda tıkanıyor → elendi.)* |
| Cache/PubSub | **Redis 7 + ioredis** | WS fan-out, presence, rate limit |
| WebSocket | **socket.io + @socket.io/redis-adapter** | yeniden bağlanma, oda, çoklu düğüm fan-out hazır |
| Doğrulama | **zod** (`packages/contracts`) | tek şema → sunucu doğrulaması + istemci tipleri + form doğrulaması |
| Auth | **argon2id** + **jose** (JWT) | access 15dk + rotating refresh (httpOnly cookie) |
| Log | **pino** + pino-http | yapılandırılmış JSON, düşük maliyet |
| Metrik | **prom-client** → Prometheus + Grafana | SLO: görev gecikmesi |
| Hata | **Sentry** | worker + api + web |
| Test | **Vitest** (+ Testcontainers) | motor testleri hızlı; entegrasyon testi gerçek Postgres'te |
| Web | **React 19 + Vite 7 + Tailwind v4 + Radix + TanStack Query + Zustand** | §10 |
| Mobil | **Flutter** (Faz 5) | aynı REST/WS API |
| E-posta | **Resend** (veya SMTP) | doğrulama + şifre sıfırlama |
| Push | **web-push (VAPID)** + **firebase-admin (FCM)** | web + mobil, tek `outbox` kaynağından |
| Konteyner | **Docker + Compose** | lokal = prod paritesi |
| Proxy/TLS | **Caddy 2** | otomatik Let's Encrypt, 5 satır config |
| CI | **GitHub Actions** → **GHCR** | imaj üretimi + test kapısı |
| Yedek | **wal-g** (WAL arşivi + base backup) → S3-uyumlu | PITR |

---

# 3. LOKAL GELİŞTİRME

## 3.1 Kurulum (tek komut hedefi)
```
mobiwar/
├─ compose.dev.yml        # postgres + redis + mailpit (yalnız ALTYAPI)
├─ compose.prod.yml       # + api + worker + web + caddy (tam yığın)
├─ .env.example
└─ apps/ packages/ infra/
```
**İlke: altyapı Docker'da, uygulama host'ta.** Vite HMR ve Nest watch host'ta çok daha hızlı;
Postgres/Redis sürüm tutarlılığı için Docker'da.

```bash
cp .env.example .env
docker compose -f compose.dev.yml up -d      # pg:5432, redis:6379, mailpit:8025
pnpm install
pnpm db:migrate && pnpm db:seed              # şema + 1 test dünyası + 3 oyuncu
pnpm dev                                     # turbo: api(3000) + worker + web(5173) paralel
```

`pnpm db:seed` **geliştirmenin belkemiği**: bir dünya, birkaç oyuncu, dolu barakalar, hazır ordular ve
**yakın varışlı sahte görevler** üretir → 3 saat beklemeden savaş akışı test edilir.

## 3.2 Zaman hızlandırma (geliştirici aracı)
`worlds.config.hiz.*` çarpanları + **`DEV_TIME_SCALE`**: dev ortamında oyun saati N× hızlı akar
(`game_now()` çarpanı). 1 saatlik sefer 36 saniyeye iner. Prod'da bu bayrak kapalıdır ve kod yolu
`NODE_ENV !== 'production'` ile korunur.

## 3.3 Test katmanları
1. **Birim** (vitest): motor, ekonomi formülleri, harita süresi, yerleşim skorlaması — DB'siz, hızlı.
2. **Entegrasyon** (Testcontainers): gerçek Postgres'te görev kuyruğu, advisory lock sırası,
   idempotency (aynı görevi 2 kez çalıştır → tek savaş).
3. **Kaos testi** (Faz 1 çıkış kriteri): worker'ı savaşın ortasında `SIGKILL` → yeniden başlat →
   görev kaybolmadan, çift çalışmadan tamamlanmalı.
4. **Regresyon:** mevcut 25+ savaş senaryosu (`scratchpad/`) → `packages/engine/test`.

---

# 4. LOKAL → VPS AKTARIMI

## 4.0 ⭐ KÜÇÜK SUNUCU PROFİLİ — mevcut VPS (31.210.36.185)

> **Sunucu 2026-07-26'da incelendi ve temizlendi** → tam rapor: `VPS_DURUM_RAPORU.md`.
> Üzerinde 2 canlı site var: `scrabblecozucu.com` (Node :3000) ve `klavyetest.xyz` (Node :3001),
> nginx + MySQL + php-fpm + PM2 ile. Ölçülen mevcut kullanım: **~790 MB RAM**, disk %33.
> **Docker/Redis/PostgreSQL kurulu DEĞİL.** Yük ortalaması 0.04 (CPU boşta).

### ⚠️ Sunucu gerçeğinin değiştirdiği üç karar
1. **Caddy KULLANILMAYACAK → mevcut nginx.** nginx zaten 80/443'ü tutuyor, certbot kurulu.
   Mobiwar için yeni bir site dosyası + `certbot --nginx` yeterli. İkinci web sunucusu = port
   çakışması + boşa RAM.
2. **Docker YERİNE native kurulum.** PostgreSQL apt/PGDG deposundan, uygulama **PM2** ile
   (sunucuda zaten PM2 + systemd düzeni çalışıyor). Docker daemon'ı ~80 MB ve yeni bir işletim
   yükü demekti. **CI, Docker imajı yerine derlenmiş artefakt (tarball) üretir** → rsync → `pm2 reload`.
   *Lokal geliştirmede Docker (postgres:17) kalır: önemli olan sürüm paritesi, çalıştırma biçimi değil.*
3. **Port 3002** Mobiwar API'sine ayrıldı (3000/3001 dolu).

### Kaynak yükseltme kararı: **4 GB + 3 çekirdek yeterli** (6 GB'a şimdi gerek yok)
```
Mevcut siteler + sistem   ~790 MB  (ölçüldü)
Mobiwar PostgreSQL        ~768 MB  (shared_buffers 256MB)
Mobiwar uygulaması        ~400 MB
──────────────────────────────────
Toplam                    ~1.96 GB → 4 GB'de ~2 GB sayfa önbelleği kalır
```
6 GB'ı, Postgres veritabanı birkaç GB'ı geçip önbellek yetmemeye başlayınca al.

Mimari değişmiyor, **konuşlandırma profili** değişiyor. Üç sadeleştirme yetiyor:

### (a) Tek süreç: `ROLE=all`
api ve worker **aynı kod tabanı, tek konteyner** olarak çalışır (`ROLE=api|worker|all` ortam
değişkeni). Büyüdüğünde `ROLE` değiştirip iki konteynere ayırmak **kod değişikliği gerektirmez**.
Savaş çözümü 1-50 ms sürdüğü için bu ölçekte olay döngüsünü bloke etmez.

### (b) Redis OPSİYONEL
Tek düğümde socket.io'nun Redis adaptörüne, dağıtık rate-limit'e ve presence store'a gerek yok.
Kod `CacheAdapter`/`PubSubAdapter` arayüzü kullanır: `REDIS_URL` yoksa **bellek-içi** uygulama
devreye girer. → ~100 MB ve bir hareketli parça daha az. Ölçeklenince `REDIS_URL` tanımlamak yeter.

### (c) Web = statik dosya
React derlemesi **mevcut nginx** tarafından servis edilir; **web için Node süreci yok** (0 MB runtime).
Diğer iki site de aynı düzende çalışıyor (`root /home/deploy/<app>/dist` + `/api/` proxy) — Mobiwar
onlarla birebir aynı kalıbı kullanır, yeni bir işletim biçimi öğrenmeye gerek kalmaz.

### Bellek bütçesi
| Bileşen | Sınır | Not |
|---|---:|---|
| İşletim sistemi | ~250 MB | Ubuntu 24.04 minimal |
| PostgreSQL 17 | 512 MB | `shared_buffers=256MB` |
| Uygulama (api+worker tek süreç) | 384 MB | `--max-old-space-size=256` |
| Caddy (proxy + statik web) | 64 MB | |
| **Toplam** | **~1,2 GB** | ~800 MB sayfa önbelleği/tampon kalır |
+ **2 GB swap** (vm.swappiness=10) ani sıçramalara karşı sigorta.

### Bu profilde YASAK olanlar
- ❌ **Sunucuda derleme yapmak.** `pnpm build` tek başına 1 GB+ yiyebilir → OOM. Derleme **yalnız
  GitHub Actions'ta** yapılır, VPS hazır artefaktı alır. (Bu yüzden CI artık opsiyonel değil.)
  *Not: 4 GB'a çıkıldığında sunucuda derleme teknik olarak mümkün olur ama yine de yapılmamalı —
  derleme sırasında canlı siteler RAM için yarışır.*
- ❌ Prometheus + Grafana'yı aynı kutuda çalıştırmak (~400 MB). Yerine: `/metrics` ucu açık kalır,
  dışarıdan **Uptime Kuma / Grafana Cloud ücretsiz katman** çeker. Erken safhada log + healthcheck yeter.
- ❌ Redis kalıcılığı (RDB fork'u 2 GB'de tehlikeli). Redis kullanılırsa: `save ""`, `appendonly no`,
  `maxmemory 96mb`, `allkeys-lru`.
- ❌ PgBouncer (şimdilik gereksiz): tek Node süreci, havuz `max=10` → 40 bağlantı sınırı bol gelir.

### Postgres ayarları (2 GB için)
```conf
shared_buffers = 256MB          effective_cache_size = 768MB
work_mem = 4MB                  maintenance_work_mem = 64MB
max_connections = 40            random_page_cost = 1.1
jit = off                       # küçük kutuda JIT CPU yakar, faydası yok
wal_compression = on            max_wal_size = 1GB   checkpoint_timeout = 15min
autovacuum_vacuum_scale_factor = 0.05   # missions/outbox yüksek devirli
```

### Gerçekçi kapasite
Bu kutu **kapalı beta ölçeği** içindir: ~500-1.000 kayıtlı oyuncu, **100-200 eşzamanlı çevrimiçi**,
dakikada binlerce görev — rahat kaldırır. Oyun asenkron olduğu için istek/oyuncu oranı çok düşük
(dakikada birkaç istek + WS kalp atışı). İlk sıkışacak yer **RAM'in Postgres önbelleğine yetmemesi**
olur (DB birkaç GB'ı geçtiğinde). O noktada §4.6 sırasıyla büyütülür — mimari hazır.

## 4.1 Sunucu hazırlığı (tek seferlik)
```
Ubuntu 24.04 LTS · non-root sudo kullanıcı · SSH anahtarı (parola girişi KAPALI)
ufw: 22, 80, 443 · fail2ban · unattended-upgrades
Docker Engine + compose plugin
Disk: / (sistem) + ayrı volume: /var/lib/postgresql (veri) + /backup (WAL/dump)
Swap: RAM'in yarısı (OOM koruması) · vm.overcommit_memory=2 (Redis uyarısı)
```
**Mevcut kutu: 2 vCPU / 2 GB → §4.0 profili geçerli.** Büyüdüğünde hedef: 4 vCPU / 8-16 GB NVMe;
o noktada `ROLE` ayrıştırması, Redis ve **PgBouncer** (transaction mode) devreye alınır.

## 4.2 Dağıtım hattı
```
git push → GitHub Actions:  lint → test → build → imaj (ghcr.io/…/api:sha, worker:sha, web:sha)
                                                  ↓
VPS:  docker compose pull  →  migration (tek seferlik konteyner)  →  rolling restart
```
**Sıra kritik (§2 bakım modu):**
1. `world.state='maintenance'` (gerekiyorsa) veya sadece worker'ı durdur.
2. `worker` durdurulur → **graceful drain**: yeni görev almaz, çalışanı bitirir, kilitleri bırakır.
3. `migrate` konteyneri çalışır (expand-contract: asla kırıcı tek adım).
4. `api` rolling restart (2 kopya, Caddy sağlık kontrolüyle sırayla).
5. `worker` başlatılır → birikmiş görevleri `execute_at` sırasıyla işler.
6. Bakımdan çıkış: `clock_offset += duraklama` → tüm geri sayımlar otomatik ötelenir.

Deploy tek komut: `make deploy` (veya Actions'tan SSH ile `deploy.sh`). Geri alma: önceki imaj
etiketine `docker compose up -d` — **migration geri alınmaz**, bu yüzden expand-contract zorunlu.

## 4.3 Gizli bilgiler (secrets)
- Lokal: `.env` (git'te değil). VPS: `/etc/mobiwar/.env` (chmod 600, root) → compose `env_file`.
- Üretim sırları asla repo'da/CI log'unda görünmez; Actions yalnız GHCR'a push için token kullanır.
- Rotasyon prosedürü yazılı: JWT imza anahtarı, DB parolası, VAPID, FCM.

## 4.4 Yedekleme & felaket kurtarma (pazarlıksız)
- **wal-g**: sürekli WAL arşivi + günlük base backup → S3-uyumlu (Hetzner Storage Box / Backblaze B2).
  Hedef: **RPO ≤ 5 dk, RTO ≤ 1 saat.**
- Ek: günlük `pg_dump` (mantıksal, sürüm bağımsız) → 7 gün yerel, 30 gün uzak.
- **Restore tatbikatı 3 ayda bir**, yazılı adımlarla; tatbikat yapılmamış yedek = yedek değildir.
- `audit_log` + `battles.input` sayesinde kısmi bozulmalarda **noktasal onarım** mümkün (tüm dünyayı
  geri almaya gerek kalmadan).

## 4.5 İzleme
- `/healthz` (api: DB+Redis ping), `/readyz`, worker `/metrics`.
- Grafana panosu: **görev gecikmesi p95** (ana SLO), outbox bekleyen, savaş süresi, WS bağlantısı,
  DB kilit bekleme, disk/CPU.
- Alarm → Telegram/e-posta: dead_letter>0, gecikme>30sn, disk>%80, backup başarısız.
- Uptime Kuma (ayrı ucuz makine) dışarıdan sağlık kontrolü — sunucu tamamen ölürse haber verir.

## 4.6 Ölçek yolu (gerekirse, sırayla)
1. Dikey büyütme (VPS planı) — en ucuz, en uzun gider.
2. `worker` kopyası artır (SKIP LOCKED zaten güvenli).
3. `api` kopyası artır + Redis adapter (zaten hazır).
4. Postgres okuma replikası (sıralama/harita sorguları).
5. Dünya bazlı ayrıştırma (`world_id` ilk günden var → shard'a hazır).

---

# 5. SIRADAKİ ADIM (Faz 0 kontrol listesi)
- [ ] Monorepo iskeleti (pnpm+turbo), `compose.dev.yml`, `.env.example`, CI
- [ ] `packages/engine`: v0.6 senkronu + **seed'li PRNG** + **savunma tabanı (§13.11.10)** +
      **ganimet sırası (§13.10.4)** + mevcut senaryo testleri
- [ ] `packages/catalog`: birim/yapı/teknik + §13.8 formülleri + hash · **`id`'ler İngilizce (§13.14)**
- [ ] `packages/contracts`: zod şemaları (auth, city, mission, world, **chat**)
- [ ] `packages/design-tokens`: `tokens.json` → `tokens.css` / `tokens.tw.css` / `tokens.dart`
      + kontrast testi (§13.13)
- [ ] `apps/api` + `apps/worker` iskeleti, `/healthz`, migration altyapısı
- [ ] Çıkış kriteri: `pnpm test` yeşil + `docker compose up` ile boş dünya ayağa kalkıyor +
      `pnpm tokens:check` temiz
