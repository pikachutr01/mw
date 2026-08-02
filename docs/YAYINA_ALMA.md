# YAYINA ALMA — mobilwar.com

> **Durum (2026-08-02):** Sunucu hazırlığı **BİTTİ**, site **henüz yayında değil**.
> Kalan dört adım aşağıda §2'de; hepsi bilinçli ve geri alınabilir.
>
> Bu belge iki soruyu cevaplar: **canlıya nasıl çıkılır** (§2) ve **bundan sonra her
> değişiklik canlıya nasıl gider** (§3). Sunucunun genel künyesi `VPS_DURUM_RAPORU.md`'de,
> mimari gerekçeler `referans/MOBIWAR_TEKNIK_KURULUM.md §4`'te.

---

## 0. Yerleşim — ne nerede

| | |
|---|---|
| Alan adı | `mobilwar.com` (oyun) · `admin.mobilwar.com` (yönetim paneli) · `mailer.mobilwar.com` (Resend) |
| DNS | **Cloudflare** (Free) · NS `craig`/`serena.ns.cloudflare.com` · apex **proxy'li** |
| Origin | `31.210.36.185` — Ubuntu 24.04, **4 GB RAM / 3 vCPU / 40 GB** |
| Web sunucusu | mevcut **nginx 1.24** (yeni sunucu kurulmadı; 80/443 zaten onda) |
| Süreç yöneticisi | mevcut **PM2** (`deploy` kullanıcısı, `pm2-deploy.service`) |
| Veritabanı | **PostgreSQL 17.10** (PGDG, native — Docker yok) |
| Node | **`/opt/node22`** (v22.23.2) — ⚠️ sistem Node'u v20 ve ona DOKUNULMADI |
| Depo | `github.com/pikachutr01/mw` |

### ⚠️ Bu sunucuda başka iki canlı site var
`scrabblecozucu.com` (+ `api.`) ve `klavyetest.xyz` — ikisi de Node **v20** üzerinde PM2 ile.
MobilWar için yapılan hiçbir şey onlara dokunmamalı. Bu yüzden:

- Node 22 sisteme değil **`/opt/node22`**'ye kuruldu; PATH'e eklenmedi. Yalnız MobilWar'ın
  PM2 tanımı (`interpreter`) o yolu biliyor.
- Rapor önerisi olan **«80/443'ü yalnız Cloudflare IP'lerine aç»** ufw kuralı
  **UYGULANAMAZ**: o iki site Cloudflare'de değil, doğrudan bu IP'ye bakıyor — kural onları
  anında erişilemez yapardı (üstelik certbot'un HTTP-01 doğrulaması da kesilirdi). Aynı
  korumanın uygulanabilir hâli nginx katmanında ve **yalnız panel bloğunda** var (§1.3).
- Aynı sebeple **origin IP'si bu kutuda gizlenemez**: `scrabblecozucu.com` zaten aynı IP'yi
  herkese açıkça gösteriyor. Cloudflare'in değeri burada IP gizliliği değil, **panelin
  önündeki Access kapısı**, TLS ve DDoS süzgeci.

---

## 1. Kurulum — ne yapıldı (2026-08-02)

`ops/sunucu-kurulum.sh` ile (idempotent, root):

1. **Node 22** → `/opt/node22` (izole)
2. **PostgreSQL 17** + 4 GB profili ayarları (`shared_buffers=256MB`, `jit=off`, UTC,
   `listen_addresses=localhost`) · `mobilwar` rolü ve veritabanı
3. **Dizinler:** `/var/www/mobilwar/{releases,shared/logs}` (sahibi `deploy`)
4. **Sırlar:** `/etc/mobilwar/.env` — sahibi `root:deploy`, izin **640**
   → `deploy` **okur, YAZAMAZ** (doğrulandı). İçinde: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
   `RESEND_API_KEY`, `MAIL_FROM`/`MAIL_REPLY_TO`, `APP_ORIGIN`, **VAPID çifti**.
   ⚠️ **VAPID anahtarları bir daha DEĞİŞTİRİLMEZ** — değişirse mevcut tüm push abonelikleri
   sessizce ölür.
5. **nginx** yapılandırmaları `sites-available`'a kopyalandı (**etkinleştirilmedi**) +
   `conf.d/cloudflare-realip.conf` yüklendi (`nginx -t` temiz, siteler etkilenmedi)
6. **PM2 tanımı** → `/var/www/mobilwar/shared/ecosystem.config.cjs`
7. **Günlük yedek** `pg_dump --format=custom` → 04:45, 14 gün (MySQL yedeği 04:30'da)
8. **Cloudflare IP listesi** aylık tazeleme cron'u

### 1.3 Panelin üç katmanlı koruması
| Katman | Neyi keser |
|---|---|
| nginx `if ($mw_cloudflare = 0) { return 444; }` | Origin IP'sine **doğrudan** gelip Access'i atlama denemesi |
| **Cloudflare Access** (Zero Trust, 50 kullanıcıya kadar ücretsiz) | Bot taraması ve yetkisiz ziyaretçi — panelin giriş ekranını hiç göremezler |
| Panelin `AdminGuard` + adım yükseltmesi | **Asıl yetki sınırı** — hep burada, ağ katmanında değil |

### 1.4 Gerçek istemci IP'si — sessiz bozulmayı önleyen ayar
`conf.d/cloudflare-realip.conf` olmadan `$remote_addr` **Cloudflare edge** IP'si olur ve
üç şey aynı anda bozulur: IP başına günlük posta kotası (30) tüm oyunculara ortak uygulanır,
giriş rate-limit'i herkesi birlikte bloklar, `player_ips` çoklu-hesap tespiti anlamsızlaşır.
Kod tarafı doğru (`abuse/device-context.ts` XFF'in ilk öğesini okuyor) — mesele nginx'in
oraya ne yazdığıydı.

---

## 2. Canlıya çıkış — kalan dört adım

### 2.1 DNS: panel kaydı (Cloudflare)
| Type | Name | Content | Proxy |
|---|---|---|---|
| A (veya CNAME) | `admin` | `31.210.36.185` (ya da `mobilwar.com`) | 🟠 **Proxied — şart** |

⚠️ Proxy kapatılırsa Access devre dışı kalır ve nginx bloğu isteği `444` ile düşürür; panel
tamamen erişilemez olur. Bu bilinçli: yanlış yapılandırma paneli **açık bırakmaktansa**
kapatsın.

### 2.2 TLS sertifikası
```bash
ssh root@31.210.36.185 "certbot certonly --webroot -w /var/www/html \
  -d mobilwar.com -d www.mobilwar.com -d admin.mobilwar.com \
  --agree-tos -m destek@mobilwar.com --non-interactive"
```
⚠️ Bu komuttan **önce** Cloudflare'de **Always Use HTTPS kapalı** olmalı (şu an kapalı) ve
`admin` DNS kaydı eklenmiş olmalı — yoksa doğrulama o alan adında başarısız olur.

`certonly --webroot` seçildi, `--nginx` değil: certbot nginx yapılandırmasına hiç dokunmuyor,
böylece bloklar depoda versiyonlu kalıyor (`ops/nginx/`). Yenileme certbot timer'ıyla otomatik.

### 2.3 nginx'i etkinleştir
```bash
ssh root@31.210.36.185 "ln -sfn /etc/nginx/sites-available/mobilwar.com /etc/nginx/sites-enabled/ \
  && ln -sfn /etc/nginx/sites-available/admin.mobilwar.com /etc/nginx/sites-enabled/ \
  && nginx -t && systemctl reload nginx"
```
⚠️ `nginx -t` **geçmeden** reload etme: bozuk yapılandırma diğer iki siteyi de düşürür.

### 2.4 Cloudflare ayarları
| Ayar | Yeni değer | Neden |
|---|---|---|
| SSL/TLS modu | **Full (Strict)** | Origin'de artık geçerli Let's Encrypt sertifikası var. `Flexible` olsaydı trafik sunucuya şifresiz iner ve HTTPS yönlendirmesi sonsuz döngüye girerdi |
| Always Use HTTPS | **Açık** (sertifikadan SONRA) | — |
| Bot Fight Mode | **Kapalı kalsın** | API ve WebSocket istemcilerini kırar |
| Zero Trust → Access | `admin.mobilwar.com` için uygulama + e-posta kuralı | §1.3 |

### 2.5 GitHub secret'ları (Settings → Secrets and variables → Actions)
| Secret | Değer |
|---|---|
| `DEPLOY_HOST` | `31.210.36.185` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | `31.210.36.185 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGS/KdkZxya98DuMu5bcKKoCSH5HIKUJOCtGZ/VPuRDN` |
| `DEPLOY_SSH_KEY` | `ssh root@31.210.36.185 "cat /root/mw-deploy-key"` çıktısının tamamı (`BEGIN`/`END` satırları dâhil) |

Dağıtım için **ayrı** bir ed25519 anahtarı üretildi (kişisel anahtar kullanılmıyor);
açık kısmı `deploy` kullanıcısının `authorized_keys`'ine eklendi ve giriş doğrulandı.

`DEPLOY_KNOWN_HOSTS` bilerek sabit: `ssh-keyscan`'i dağıtım anında çalıştırmak, ne dönerse
ona güvenmek demek olurdu (ortadaki adam saldırısına açık kapı).

---

## 3. Bundan sonra: her değişiklik canlıya nasıl gider

```
BEN (lokal)              GitHub                         VPS
──────────               ──────                         ───
kod → commit ──push──►  [CI ci.yml]  typecheck · test · tokens:check
                             │ (her push'ta, otomatik)
                             ▼
                        [deploy.yml]  ⏸ SEN «Run workflow» dersin
                             │
                        runner'da (ubuntu-latest, Node 22):
                          testler TEKRAR koşar → pnpm build
                          → pnpm deploy --prod (hoisted)
                          → tarball: api/ web/ admin/ ops/
                             │  scp + ssh
                             ▼
                        releases/<zaman-sha>/ içine açılır
                        ops/surum-yayinla.sh:
                          1. göçler          (drizzle-orm koşucusu)
                          2. current symlink (atomik)
                          3. pm2 reload      (graceful, SIGTERM)
                          4. /healthz        ✗ → ESKİ sürüme geri dön
                          5. 5 sürümden eskisini buda
                             │
                        https://mobilwar.com → 200 doğrulaması
```

### Neden bu tasarım

| Karar | Gerekçe |
|---|---|
| **Derleme runner'da, sunucuda ASLA** | `pnpm build` 1 GB+ yiyor; sunucuda koşarsa canlı iki site RAM için yarışır (§4.0'daki yasak) |
| **Elle tetikleme** (`workflow_dispatch`) | Testin yakalamadığı hata commit atar atmaz canlıya inmesin. Kullanıcı kararı, 2026-08-02 |
| Deploy iş akışı **testleri tekrar koşar** | «Run workflow» keyfî bir commit'e basılabilir; o commit'in CI'dan geçtiğinin garantisi yok |
| **`--config.node-linker=hoisted`** | Varsayılan pnpm çıktısında `node_modules/@mobilwar/*` **mutlak** yollara işaret ediyor → paket sunucuda başka dizine açılınca kırılır. `hoisted` düz ve taşınabilir ağaç üretir (ölçüldü: 0 symlink) |
| **Göç ÖNCE, kod SONRA** | Göçler expand-contract; eski kod yeni şemada çalışmaya devam eder. Tersi doğru değil: yeni kod olmayan kolonu okur ve patlar |
| **`pm2 reload`** | `main.ts` SIGTERM'i yakalayıp çalışan görev turunu bitiriyor, kilitleri bırakıyor. `kill_timeout: 10s` ona yetiyor |
| **Sağlık kontrolü + otomatik geri alma** | 30 sn içinde `/healthz` cevap vermezse symlink eski sürüme döner. ⚠️ **Göç geri alınmaz** — bu yüzden her göç bir önceki sürümün de çalışabileceği şekilde yazılmalı |
| **Ayrı `migrate.mjs`** | `drizzle-kit` bir devDependency; üretim paketinde yok. `drizzle-orm`un koşucusu aynı `_journal.json` sırasını ve aynı `__drizzle_migrations` tablosunu kullanıyor — çift uygulama olmaz |
| **Dağıtım paketi ASLA yerel Windows'ta üretilmez** | `@node-rs/argon2` platforma özel ikili yükler; paket Linux runner'da derlenmeli |

### Elle müdahale gereken durumlar
```bash
# Geri alma (sağlık kontrolü geçmiş ama sorun sonradan görülmüşse)
ssh deploy@31.210.36.185 "ls -1t /var/www/mobilwar/releases | head -5"
ssh deploy@31.210.36.185 "/var/www/mobilwar/releases/<eski-sürüm>/ops/surum-yayinla.sh <eski-sürüm>"

# Loglar
ssh deploy@31.210.36.185 "pm2 logs mobilwar --lines 100 --nostream"

# Ayarları değiştirmek (yönetim paneli): yeniden başlatma GEREKMEZ —
# `LISTEN mw_settings` ile tüm süreçler milisaniyeler içinde tazelenir.
```

---

## 4. Yayına çıkmadan önce kapatılacaklar

| # | İş | Not |
|---|---|---|
| 1 | **İlk dağıtım** (`deploy.yml` → Run workflow) | Boş veritabanına 36 göç uygulanacak |
| 2 | **Dünya tohumlama** | Boş DB'de dünya kaydı yok; ilk oyuncu kaydından önce gerekli |
| 3 | **Posta uçtan uca testi** | Gerçek kayıt → Gmail'de «Show original» → **SPF/DKIM/DMARC = PASS** |
| 4 | **Push testi** | Yeni VAPID çiftiyle ilk abonelik |
| 5 | **Yedek tatbikatı** | `pg_restore` ile boş bir veritabanına geri yükleme denenmeli — *tatbikat yapılmamış yedek, yedek değildir* |
| 6 | **Uzak yedek kopyası** | Yedekler hâlâ **aynı sunucuda**; sunucu tamamen giderse yedek de gider (rclone/restic → B2) |
| 7 | `og:url` / `og:image` | `apps/web/index.html`'deki mutlak adresler alan adına bağlı |
| 8 | Sohbete düşen sırlar | **Resend API anahtarı ve root/deploy parolaları bu oturumda düz metin geçti** — yayına çıkmadan döndürülmeli |
