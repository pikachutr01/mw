# MOBIWAR — KURULUM REHBERİ (Lokal Windows + VPS Ubuntu)

> Repo: `https://github.com/pikachutr01/mw.git` · VPS: **31.210.36.185** (2 vCPU / 2 GB, üzerinde
> 2 canlı site var) — durum raporu: `VPS_DURUM_RAPORU.md`, profil: `MOBIWAR_TEKNIK_KURULUM.md` §4.0.
>
> **Temel ilke — lokal ve sunucu farklı çalıştırma biçimi kullanır, bu bilinçlidir:**
> - **Lokalde:** PostgreSQL/Redis **Docker'da** → sürüm pariteli, tek komutla sıfırlanabilir, kirletmez.
> - **Sunucuda:** PostgreSQL **native (apt)**, uygulama **PM2** ile → sunucuda zaten nginx+PM2 düzeni
>   çalışıyor, Docker daemon'ı (~80 MB) 2 GB'lik kutuda israf olurdu.
>
> Önemli olan **sürüm paritesi** (her iki tarafta PostgreSQL 17), çalıştırma biçimi değil.
> Uygulama sadece Node + ortam değişkeni olduğu için taşınmada fark yaratmaz.

---

# BÖLÜM A — LOKAL ORTAM (Windows 11)

## A.0 Neden WSL2?
Proje Linux'ta çalışacak; WSL2 lokalde aynı ortamı verir (aynı yollar, aynı kabuk, aynı Docker).
Ayrıca Node dosya izleme (Vite HMR) WSL içinde **kat kat hızlıdır** — tek şartla: **proje dosyaları
WSL'in kendi diskinde olmalı** (`~/projects/mw`), `/mnt/c/...` altında DEĞİL. `/mnt/c` üzerinden
çalışmak her dosya değişikliğini Windows dosya sistemine köprüler ve derlemeyi 5-10× yavaşlatır.

## A.1 WSL2 + Ubuntu 24.04
PowerShell'i **yönetici** olarak aç:
```powershell
wsl --install -d Ubuntu-24.04
```
Bilgisayarı yeniden başlat, Ubuntu açılınca kullanıcı adı + parola belirle. Sonra sürümü doğrula:
```powershell
wsl -l -v          # VERSION sütunu 2 olmalı
```
Bundan sonraki tüm komutlar **Ubuntu (WSL) terminalinde** çalışır.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl ca-certificates unzip postgresql-client-16
```
`postgresql-client-16` yalnızca `psql` komut satırı içindir — sunucu değil.

## A.2 Docker
İki yol var, birini seç:

**Yol 1 — Docker Desktop (önerilen, kolay):** Windows'a [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
kur → Settings → Resources → **WSL Integration** → Ubuntu-24.04 açık olsun.
Ayrıca Settings → Resources → Memory'yi 4 GB civarına sabitle (Windows'u boğmasın).

**Yol 2 — WSL içine doğrudan Docker Engine (daha hafif, Desktop yok):**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo service docker start        # WSL'de systemd yoksa her açılışta gerekir
```
Doğrula:
```bash
docker run --rm hello-world
docker compose version
```

## A.3 Node 22 + pnpm
`fnm` (hızlı sürüm yöneticisi) ile:
```bash
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22 && fnm default 22
corepack enable && corepack prepare pnpm@latest --activate
node -v && pnpm -v      # v22.x  /  9.x veya üstü
```

## A.4 Git + GitHub bağlantısı
```bash
git config --global user.name  "Abdullah"
git config --global user.email "abdullahkaya544@gmail.com"
git config --global init.defaultBranch main
git config --global pull.rebase true

ssh-keygen -t ed25519 -C "abdullahkaya544@gmail.com"       # Enter, Enter, Enter
cat ~/.ssh/id_ed25519.pub
```
Çıkan anahtarı GitHub → Settings → SSH and GPG keys → **New SSH key**'e yapıştır. Test:
```bash
ssh -T git@github.com        # "Hi pikachutr01!" görmelisin
```

## A.5 Projeyi klonla
```bash
mkdir -p ~/projects && cd ~/projects
git clone git@github.com:pikachutr01/mw.git
cd mw
```
> VS Code kullanıyorsan: Windows'a **WSL** eklentisini kur, sonra WSL terminalinde `code .` yaz.
> Dosyalar WSL diskinde kalır, düzenleme Windows'tan yapılır — iki dünyanın en iyisi.

## A.6 Altyapıyı ayağa kaldır
Repo kökündeki `compose.dev.yml` **yalnız altyapıyı** çalıştırır (uygulama host'ta koşar):
```yaml
# compose.dev.yml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: mw
      POSTGRES_PASSWORD: mw_dev
      POSTGRES_DB: mw
    ports: ["5432:5432"]
    volumes: ["mw_pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mw"]
      interval: 5s
      retries: 10
  redis:                      # opsiyonel — REDIS_URL tanımlıysa kullanılır
    image: redis:7-alpine
    command: ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory", "96mb"]
    ports: ["6379:6379"]
  mailpit:                    # e-posta doğrulama akışını lokalde test etmek için
    image: axllent/mailpit
    ports: ["1025:1025", "8025:8025"]
volumes: { mw_pgdata: }
```
```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml ps            # üçü de "healthy/running"
psql "postgresql://mw:mw_dev@localhost:5432/mw" -c "select version();"
```
Mailpit arayüzü: <http://localhost:8025> (giden tüm e-postalar burada görünür, gerçekten gönderilmez).

## A.7 Uygulamayı çalıştır
```bash
cp .env.example .env
pnpm install
pnpm db:migrate      # şema
pnpm db:seed         # test dünyası + oyuncular + yakın varışlı sahte görevler
pnpm dev             # api :3000 · web :5173
```
`.env` (lokal):
```dotenv
NODE_ENV=development
ROLE=all
DATABASE_URL=postgresql://mw:mw_dev@localhost:5432/mw
REDIS_URL=redis://localhost:6379      # boş bırakılırsa bellek-içi mod
JWT_SECRET=lokal-gelistirme-anahtari-degistir
SMTP_URL=smtp://localhost:1025
DEV_TIME_SCALE=60                     # oyun saati 60× hızlı → 1 saatlik sefer 1 dakika
LOG_LEVEL=debug
```

## A.8 Günlük kullanım
```bash
docker compose -f compose.dev.yml up -d     # sabah: altyapıyı aç
pnpm dev                                    # geliştirme
pnpm test                                   # testler
docker compose -f compose.dev.yml stop      # akşam: kapat (veriler kalır)
```
Veritabanını sıfırlamak: `docker compose -f compose.dev.yml down -v && docker compose -f compose.dev.yml up -d && pnpm db:migrate && pnpm db:seed`

---

# BÖLÜM B — VPS (mevcut sunucu: 31.210.36.185)

> ⚠️ Bu bölüm **sıfırdan sunucu kurulumu değil** — sunucunda zaten nginx + MySQL + php-fpm + PM2 +
> certbot + ufw + fail2ban çalışıyor ve iki canlı site var. Mobiwar bu düzene **eklenecek**.
> Sunucunun tam durumu: `VPS_DURUM_RAPORU.md`.

## B.0 Zaten hazır olanlar ✓
| | Durum |
|---|---|
| Kullanıcı + SSH | `root` ve `deploy` mevcut ✓ (parola girişi **açık** — B.9'a bak) |
| ufw | aktif (22, 80/443) ✓ |
| fail2ban | 2 jail aktif ✓ |
| unattended-upgrades | açık ✓ |
| Swap | 3.4 GB, swappiness 10 ✓ |
| nginx + certbot | kurulu, 3 site + 4 sertifika ✓ |
| PM2 | `pm2-deploy.service` olarak systemd'de ✓ |
| **Docker** | **YOK — kurulmayacak** (native kurulum tercih edildi) |
| **PostgreSQL** | **YOK — B.1'de kurulacak** |

## B.1 PostgreSQL 17 kurulumu (PGDG deposu)
Ubuntu 24.04'ün kendi deposu PostgreSQL 16 verir; lokalde 17 kullandığımız için sürüm paritesi adına
resmî PGDG deposunu ekliyoruz:
```bash
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-17
```
Küçük sunucu ayarları (`/etc/postgresql/17/main/conf.d/99-mw.conf`):
```conf
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB
maintenance_work_mem = 64MB
max_connections = 40
random_page_cost = 1.1
jit = off
wal_compression = on
max_wal_size = 1GB
checkpoint_timeout = 15min
autovacuum_vacuum_scale_factor = 0.05
listen_addresses = 'localhost'
```
> 4 GB'a yükseltince: `shared_buffers = 512MB`, `effective_cache_size = 1536MB`.

```bash
sudo systemctl restart postgresql
sudo -u postgres psql -c "CREATE USER mobilwar WITH PASSWORD 'GUCLU_PAROLA';"
sudo -u postgres psql -c "CREATE DATABASE mobilwar OWNER mobilwar;"
psql "postgresql://mobilwar:GUCLU_PAROLA@localhost/mobilwar" -c "select version();"   # doğrula
```

## B.2 Uygulama dizini ve ortam dosyası
```bash
sudo -u deploy mkdir -p /home/deploy/mobilwar/{releases,shared,web}
sudo -u deploy nano /home/deploy/mobilwar/shared/.env && chmod 600 /home/deploy/mobilwar/shared/.env
```
⚠️ Değişken adları **kodla birebir** olmak zorunda; aşağıdaki blok bu rehber yazıldığında
uydurulmuş adlar taşıyordu (`JWT_SECRET`, `PUBLIC_URL`, `SMTP_URL`, `VAPID_PUBLIC`,
`LOG_LEVEL` — beşi de hiç okunmuyor). **Tek doğru kaynak `mw/.env.example`**; buradaki
liste onun prod özetidir.

```dotenv
NODE_ENV=production
ROLE=all
PORT=3002
WORLD_ID=1

DATABASE_URL=postgresql://mobilwar:GUCLU_PAROLA@localhost:5432/mobilwar

JWT_ACCESS_SECRET=<openssl rand -base64 48>
# Jeton ömürleri env'de DEĞİL: panel → Ayarlar → Oturum (`session.accessTtlHours` = 12 sa).

# ⭐ Doğrulama / şifre sıfırlama / hesap silme bağlantılarının ÜÇÜ de bundan üretilir.
APP_ORIGIN=https://mobilwar.com
RESEND_API_KEY=<resend panelinden>
MAIL_FROM="MobilWar <noreply@mailer.mobilwar.com>"
MAIL_REPLY_TO=destek@mobilwar.com

# ⚠️ Anahtar çifti BİR KEZ üretilir; değişirse tüm push abonelikleri sessizce ölür.
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@mobilwar.com
```

## B.3 nginx site dosyası
`/etc/nginx/sites-available/mobilwar.conf` — mevcut iki sitenin kalıbıyla birebir aynı:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mobilwar.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name mobilwar.com;

    root /home/deploy/mobilwar/web;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /api/      { proxy_pass http://127.0.0.1:3002/api/; include /etc/nginx/proxy_params; }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3002/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;                 # WebSocket uzun ömürlü
        include /etc/nginx/proxy_params;
    }
    location /assets/   { expires 1y; add_header Cache-Control "public, immutable"; }
    location /          { try_files $uri $uri/ /index.html; }   # SPA
}
```
```bash
sudo ln -s /etc/nginx/sites-available/mobilwar.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mobilwar.com          # TLS (mevcut certbot kullanılıyor)
```
> DNS A kaydını önce sunucu IP'sine yönlendirmeyi unutma.

## B.4 PM2 ile çalıştırma
```bash
# /home/deploy/mobilwar/ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'mobilwar',
    script: 'dist/main.js',
    cwd: '/home/deploy/mobilwar/current',
    env_file: '/home/deploy/mobilwar/shared/.env',
    node_args: '--max-old-space-size=384',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '450M',
    kill_timeout: 60000,            // ⭐ worker'ın görevini bitirmesi için süre (graceful drain)
    listen_timeout: 10000,
    autorestart: true,
  }]
};
```
```bash
su - deploy
cd /home/deploy/mobilwar && pm2 start ecosystem.config.cjs && pm2 save
pm2 list                              # mobilwar online olmalı
```
`pm2 save` mevcut `pm2-deploy.service` sayesinde yeniden başlatmada otomatik ayağa kalkmasını sağlar.

## B.5 Dağıtım betiği (`/home/deploy/mobilwar/deploy.sh`)
CI'dan gelen artefaktı açar, migration'ı çalıştırır, PM2'yi tazeler:
```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=/home/deploy/mobilwar
REL="$BASE/releases/$(date +%Y%m%d%H%M%S)"
TARBALL="${1:?kullanim: deploy.sh /yol/mobilwar-<sha>.tar.gz}"

echo "▸ artefakt açılıyor"
mkdir -p "$REL" && tar -xzf "$TARBALL" -C "$REL"
ln -sfn "$BASE/shared/.env" "$REL/.env"

echo "▸ migration"
cd "$REL" && node dist/migrate.js

echo "▸ yayına alma"
ln -sfn "$REL" "$BASE/current"
cp -r "$REL/web/." "$BASE/web/"          # statik React derlemesi
pm2 reload mobilwar --update-env          # kill_timeout sayesinde görev güvenli biter

echo "▸ eski sürümler temizleniyor (son 5 kalır)"
ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf
echo "✓ tamam"
```
Geri alma: `ln -sfn $BASE/releases/<eski> $BASE/current && pm2 reload mobilwar`
(**migration geri alınmaz** → expand-contract zorunlu.)

## B.6 Yedekleme
```bash
sudo tee /usr/local/bin/mw-backup.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /var/backups/mw
TS=$(date +%F_%H%M)
sudo -u postgres pg_dump -Fc mw > /var/backups/mw/mw_$TS.dump
find /var/backups/mw -name 'mw_*.dump' -mtime +14 -delete
EOF
sudo chmod +x /usr/local/bin/mw-backup.sh
( sudo crontab -l 2>/dev/null; echo "0 4 * * * /usr/local/bin/mw-backup.sh" ) | sudo crontab -
```
> ⚠️ **MySQL için de aynısı gerekli** — sunucuda şu an hiçbir veritabanı yedeği yok
> (`VPS_DURUM_RAPORU.md` §4.1). Mobiwar'dan önce onu kur.
> Yedekleri sunucu dışına kopyala: `rclone`/`restic` → Backblaze B2 veya Hetzner Storage Box.

## B.7 Bakım modu (Mobiwar'a özel)
Oyunu duraklatmak için sunucuya girmeye gerek yok — yönetici ucundan:
```bash
curl -X POST https://mobilwar.com/api/admin/world/1/maintenance \
     -H "Authorization: Bearer <admin-token>"
# ...bakım...
curl -X POST https://mobilwar.com/api/admin/world/1/resume
```
Oyun saati duraklar, tüm geri sayımlar otomatik ötelenir (bkz. `MOBIWAR_SISTEM_PLANI.md` §2).

## B.8 Kaynak takibi
```bash
free -m && df -h / && pm2 list                    # hızlı bakış
pm2 monit                                          # canlı CPU/RAM
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('mw'));"
```
Uyarı eşikleri: kullanılabilir RAM < 300 MB · disk > %80 · `pm2 list` restart sayısı artıyorsa
(bellek sızıntısı veya OOM) `max_memory_restart` tetikleniyordur.

## B.9 Güvenlik (yapılması önerilenler)
```bash
# 1) SSH anahtar girişi (parola girişini kapat)
ssh-copy-id deploy@31.210.36.185          # lokalden
sudo nano /etc/ssh/sshd_config            # PasswordAuthentication no · PermitRootLogin prohibit-password
sudo systemctl restart ssh

# 2) Kullanılmayan ufw kuralı
sudo ufw delete allow 57109/tcp

# 3) Gereksiz servis
sudo systemctl disable --now packagekit
```
> Sohbette düz metin paylaşılan **root ve deploy parolalarını değiştir** (`passwd`).

---

# BÖLÜM C — CI/CD (GitHub Actions → artefakt)

⚠️ Sunucuda **derleme yapılmaz** (`pnpm build` 1 GB+ ister; canlı siteler RAM için yarışır).
GitHub Actions derler, **tarball artefakt** üretir, sunucuya `rsync` ile gider, `deploy.sh` açar.
(Docker imajı kullanılmıyor — sunucuda Docker yok, bkz. `VPS_DURUM_RAPORU.md` §7.)

```yaml
# .github/workflows/ci.yml (taslak)
name: ci
on: { push: { branches: [main] }, pull_request: }
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: mw, POSTGRES_PASSWORD: mw, POSTGRES_DB: mw }
        options: >-
          --health-cmd "pg_isready -U mw" --health-interval 5s --health-retries 10
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm test
  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: infra/Dockerfile.app
          push: true
          tags: ghcr.io/pikachutr01/mw-app:${{ github.sha }},ghcr.io/pikachutr01/mw-app:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```
Web derlemesi (statik) ayrı bir adımda üretilir ve `rsync`/`scp` ile `/srv/mw/web`'e gönderilir
(veya ikinci bir imaja konur). Dağıtımı Actions'tan SSH ile tetiklemek istersen sunucuya
deploy-özel bir SSH anahtarı ekleyip `appleboy/ssh-action` ile `./deploy.sh ${{ github.sha }}` çalıştır.

---

# BÖLÜM D — SIRALI KONTROL LİSTESİ

**Lokal (bugün yapılabilir):**
- [ ] WSL2 + Ubuntu 24.04 kuruldu, `wsl -l -v` → VERSION 2
- [ ] Docker çalışıyor (`docker run --rm hello-world`)
- [ ] Node 22 + pnpm kuruldu
- [ ] GitHub SSH anahtarı eklendi (`ssh -T git@github.com` başarılı)
- [ ] `~/projects/mw` klonlandı (WSL diskinde, `/mnt/c` altında DEĞİL)

**Faz 0 (kod, sıradaki adım):**
- [ ] Monorepo iskeleti + `compose.dev.yml` + `.env.example` + CI
- [ ] `packages/engine` v0.6 senkronu + seed'li PRNG
- [ ] `packages/catalog` (birim/yapı/teknik + doğrulanmış üretim/XP/mağara formülleri)
- [ ] `packages/contracts` (zod)
- [ ] `apps/api` iskeleti + `/healthz` + migration altyapısı

**VPS — önce mevcut sunucunun açıkları (Mobiwar'dan BAĞIMSIZ, acil):**
- [ ] **MySQL yedek cron'u** (şu an hiç yedek yok — `VPS_DURUM_RAPORU.md` §4.1)
- [ ] Yeniden başlatma: kernel 6.8.0-136 + 8 bekleyen güncelleme (~1 dk kesinti)
- [ ] MySQL `performance_schema=OFF` (~100-150 MB RAM kazancı, ~5 sn kesinti)
- [ ] SSH anahtar girişi + parola girişini kapatma · paylaşılan parolaları değiştir
- [ ] `ufw delete allow 57109/tcp` · `systemctl disable --now packagekit`

**VPS — Mobiwar (canlıya yaklaşınca):**
- [ ] RAM yükseltmesi: **4 GB + 3 çekirdek**
- [ ] PostgreSQL 17 (PGDG) + `99-mw.conf` ayarları + `mw` veritabanı
- [ ] Alan adı DNS → sunucu IP, sonra `certbot --nginx`
- [ ] `/home/deploy/mobilwar` dizin yapısı + `shared/.env` (chmod 600)
- [ ] nginx site dosyası (port 3002 proxy + WebSocket) + `ecosystem.config.cjs`
- [ ] `deploy.sh` + ilk dağıtım + Postgres yedek cron'u + uzak kopya
