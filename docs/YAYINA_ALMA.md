# YAYINA ALMA — mobilwar.com

> ### ✅ 2026-08-02 — **CANLIDA**
> `https://mobilwar.com` ve `https://admin.mobilwar.com` ayakta. Sertifika alındı (üç alan,
> 2026-10-31, otomatik yenileme), nginx blokları etkin, PM2 uygulaması `online`, veritabanı
> 36 göçle kurulu ve `Dünya 1` tohumlandı. Kalan: Always Use HTTPS · Cloudflare Access · §4.
>
> **İlk dağıtım ilk denemede düştü, sebebi ve dersi §5'te.**
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
| Network → **IP Geolocation** | **Açık** | `CF-IPCountry` başlığını origin'e gönderir — çoklu hesap künyesindeki ülke alanı (§9.1.2c). Tüm planlarda ücretsiz. ⚠️ Kapalı kalırsa hiçbir şey kırılmaz: ülke iptoasn veri kümesinden türer, yalnız biraz daha kabadır |

### 2.4b ⭐ İlk açılışta bir kez: ASN veri kümesini indir
Yönetim paneli → **Çoklu hesap** → «ASN / ülke veri kümesi» → **Veriyi indir**.

~712.000 aralık, 15 saniye. Bu olmadan IP'lerin yanında ağ adı görünmez ve «Aynı IP»
sinyalinin masum açıklaması tahmin olarak kalır — operatör NAT'ı mı yoksa veri merkezi
(VPN) mi ayırt edilemez.

⚠️ Otomatik değil, bilerek: açılışta indirseydi API her yeniden başlatmada dış bir servise
bağımlı olurdu. Veri bayatlasa bile hiçbir oyun mekaniği bozulmaz; ayda bir tazelemek yeter.
⚠️ İndirme sırasında oyuncuların girişi etkilenmez (`DELETE`+`INSERT`, tek transaction).

### 2.4c ⭐ İlk açılışta bir kez: geçici e-posta listesini indir
Yönetim paneli → **Kayıtlar** → «Alan listesini indir». ~8.200 alan, 1-2 saniye.

Bu olmadan geçici e-posta tespiti çalışmaz (liste boş kalır). Aynı düğme mevcut hesapların
**posta kutusu kimliğini** de dolduruyor — `ahmet+1@` ile `ah.met@` aynı kutu olarak görünür
hâle gelir.

⚠️ **Geçici e-posta varsayılanda ENGELLENMİYOR**, yalnız işaretleniyor. Önce panelde kaç
kaydın işaretlendiğine bak; gerçek oyuncu yoksa «Ayarlar → Çoklu hesap tespiti →
Geçici e-posta ile kaydı ENGELLE»yi açabilirsin.

### 2.4d ⚠️ BOT SINIRI ile GERÇEK IP ZİNCİRİ BİRBİRİNE BAĞLI
Kayıt koruması aynı /24 ağdan saatte 5 hesapla sınırlı (panelden ayarlanır).

⚠️ **Ters vekil zinciri bozulursa tüm oyuncular tek IP gibi görünür** ve bu sınır kayıtları
tamamen durdurabilir. Kod özel/yerel adresleri muaf tutuyor (bozuk zincirin bir biçimi), ama
Cloudflare kenar IP'si GENEL bir adrestir ve muaf DEĞİLDİR.
→ Panelde «Çoklu hesap → Gerçek IP zinciri» kırmızı uyarı veriyorsa **kayıt da risk altında**:
ya zinciri düzelt ya da sınırı geçici olarak yükselt.

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
| **Web derlemesi GIT DEPOSUNDA koşmalı** | Sürüm damgası (aşağı bak) SHA'yı `git rev-parse` ile derleme anında okuyor. Runner `actions/checkout` kullandığı için bu sağlanıyor; git'siz bir ortamda derleme **kırılmaz**, damga `dev`e düşer |

### Sürüm damgası (2026-08-06)

Yardım sayfasının en altında `v0.1.0 · a1b2c3d` satırı: **sürüm** kök `package.json`dan,
**SHA** derleme anında `git rev-parse --short HEAD`ten. İkisi de `apps/web/vite.config.ts`
içinde `define` ile gömülüyor — çalışma zamanı değişkeni değil, kaynağa yazılan düz metin.

- **Sürümü bumplamak elle**: kök `package.json` → `"version"`. Değişikliğin büyüklüğüne göre
  majör.minör.yama. Tek kaynak; başka hiçbir yere kopyalanmıyor (test bunu bekçiye bağlıyor).
- ⚠️ **Damga derleme anında donuyor.** Sunucuda `pm2 reload` sürümü değiştirmez — yeni damga
  ancak yeni bir web derlemesiyle gelir. Canlıda gördüğün SHA, o paketi üreten commit'tir.
- Oyuncudan hata raporu alırken bu satırı istemek en ucuz teşhis: hangi paketi çalıştırdığı
  tek bakışta belli olur (`select-all` ile tek tıkta kopyalanıyor).

## ⏱️ ZAMAN MİMARİSİ DAĞITIMI — ADIM ADIM (Faz 1+2+3, tek seferde)

> ⛔⛔ **«Run workflow»a tek başına basmak YETMEZ ve zarar da vermez.** `0043` göçü ilk iş olarak
> dünyanın bakımda olup olmadığına bakıyor; değilse şu hatayla kendini iptal ediyor:
>
> ```
> Tek zaman cizgisi gocu yalniz BAKIM MODUNDA kosabilir.
> Once: POST /api/v1/admin/worlds/:id/pause
> ```
>
> `surum-yayinla.sh` `set -euo pipefail` ile koşuyor ve göç **1. adım** — yani symlink'e ve
> `pm2 reload`a hiç gelinmiyor. Eski sürüm dokunulmadan çalışmaya devam eder. Yanlışlıkla
> basarsan kaybın yalnız birkaç dakika CI süresidir.

### A. ÖNCEDEN (oyun AÇIKKEN yapılabilir, kesinti yok)

```bash
# A1. Log rotasyonu — ÖLÇÜLDÜ: kurulu DEĞİL. Faz 3 log hacmini artırıyor, 40 GB disk.
ssh deploy@31.210.36.185
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true

# A2. Alarm adresi — ÖLÇÜLDÜ: .env'de YOK. Dağıtımın kendi `pm2 reload`u bunu alacak,
#     yani şimdi eklemek ayrı bir yeniden başlatma gerektirmiyor.
sudo sh -c 'echo "OPS_ALERT_EMAIL=destek@mobilwar.com" >> /etc/mobilwar/.env'
sudo grep OPS_ALERT /etc/mobilwar/.env      # doğrula
```

```sql
-- A3. İki ölü mektubu KAPAT (silme!). 02.08 Resend idempotency artığı; sebebi düzeltildi.
--     Yapılmazsa Faz 3'ün `outbox_dead` eşiği (0) dağıtımın ilk dakikasında yanlış alarm üretir.
UPDATE outbox SET dispatched_at = now() WHERE id IN (1, 2) AND dispatched_at IS NULL;
INSERT INTO audit_log (world_id, action, entity, after)
VALUES (NULL, 'ops.outbox.acknowledge', 'outbox',
        '{"ids":[1,2],"reason":"2026-08-02 Resend idempotency olayi; anahtar duzeltildi"}'::jsonb);
```

### B. BAKIM PENCERESİ (~15 dk, düşük trafik — ör. 05:00 TRT)

| # | Ne | Nasıl |
|---|---|---|
| **B1** | Tam yedek | `sudo -u postgres pg_dump mobilwar > ~/mobilwar-$(date +%F-%H%M).sql` |
| **B2** | Başlangıç değerini **kaydet** | `SELECT clock_offset_ms FROM worlds WHERE id=1;` → **196563** bekleniyor |
| **B3** | **Bakıma al** | `admin.mobilwar.com` → Dünyalar → *«Bakıma al (oyunu dondur)»*. Metin: «Zaman altyapısı güncelleniyor», ETA 15 dk |
| **B4** | Dağıtımı başlat | GitHub → Actions → **Canlıya çıkış** → *Run workflow* → dal `main` |
| **B5** | Doğrula — **dünya HÂLÂ duraklıyken** | aşağıdaki sorgu |
| **B6** | Devam ettir | Panel → *«Bakımı bitir ve devam et»* |
| **B7** | Duman testi | Bina kuyruğa al + **casusluk gönder (120 sn — en hassas gösterge)** |

⭐ **B3 ile B4 arasında beklemene gerek yok.** Akış derleme + testlerle birkaç dakika sürüyor ve
göç ancak ondan sonra koşuyor — yani **workflow'un kendi süresi drenaj penceresidir.** Bakıma
alındığı anda uçuşta olan görevler saniyeler içinde biter.

```sql
-- B5 — üçü de tutmalı. ⛔ TUTMUYORSA B6'YI ÇALIŞTIRMA: dünya duraklı kalır, yedekten dönülür.
SELECT clock_offset_ms FROM worlds WHERE id = 1;             -- 0 olmalı
SELECT kind, shift_ms, registry_hash FROM time_shifts
 WHERE world_id = 1 AND kind = 'migration';                   -- shift_ms = B2'deki değer
-- Bekleyen görevlerin kalan süresi B3 öncesiyle aynı mı (donmuş saate göre):
SELECT id, type,
       EXTRACT(EPOCH FROM (execute_at - (SELECT paused_at FROM worlds WHERE id=1)))::int AS kalan_sn
  FROM missions WHERE world_id = 1 AND status = 'scheduled' ORDER BY execute_at;
```

⭐ **B6 sonrası:** panel `shiftMs` ve `rowsByTable` gösterir. **Hiçbir tablo 0 olmamalı** —
0, o girişin yükleminin bozuk olduğunun tek göstergesi.

### C. GERİ DÖNÜŞ — ne zaman mümkün, ne zaman değil

| An | Geri dönüş |
|---|---|
| B4 başarısız (göç reddetti/patladı) | **Hiçbir şey değişmedi.** Eski sürüm çalışıyor, B3'ü geri al (panel → devam ettir) |
| Göç koştu, sağlık kontrolü düştü | Betik symlink'i **kendiliğinden** eski sürüme döndürür. ⭐ Ve bu **güvenli**: göç `V' = V + K`, `K = 0` yaptı; eski kod `gameNow = now() − 0` ile kalan süreyi `V + K − now()` hesaplar — göç ÖNCESİ `V − (now() − K)` ile **cebirsel olarak aynı**. Oyuncu farkı görmez. ⚠️ Ama o hâlde bir daha bakım yapma: eski `resume` `clock_offset_ms`i tekrar şişirir |
| **B6'dan sonra** | ⛔ **Geri dönüş YOK.** Kaydırma uygulandı |

### D. SONRASI — 24 saat

```bash
curl -s 'http://127.0.0.1:3002/healthz?deep=1' | jq .          # status: ok
tail -n 500 ~/.pm2/logs/mobilwar-out.log | jq -c 'select(.mod=="scheduler")'
```
```sql
SELECT at, lag_ms, due_count, skipped_locked, stuck FROM scheduler_samples
 ORDER BY at DESC LIMIT 20;                       -- lag_ms küçük, skipped_locked/stuck 0
SELECT * FROM ops_events ORDER BY id DESC LIMIT 5;                       -- boş olmalı
SELECT taken_at, entries FROM ranking_runs ORDER BY taken_at DESC LIMIT 4;
--   ⚠️ 21:00 / 05:00 / 13:00 UTC DOĞRUDUR (= 00/08/16 Türkiye saati, §13.22). «Kaymış» değil.
SELECT COUNT(*) FROM missions WHERE status='done' AND finished_at > now() - interval '1 hour'
   AND finished_at - execute_at > interval '30 seconds';   -- 0 olmalı: 197 sn artefaktı BİTTİ
```

⭐ **Son satır tek başına Faz 2'nin kanıtı.** Bugün canlıda her bitmiş görev
`finished_at − execute_at ≈ 197 sn` gösteriyor; bu gecikme değil, iki ayrı saatin çıkarılması.
Göçten sonra bu fark **gerçek işlem süresine** iner.

---

### ⏱️ Canlıdan ÖLÇÜLEN başlangıç durumu (2026-08-08)

Aşağıdakiler tahmin değil, sunucuda çalıştırılan sorguların çıktısı. Göç sonrası doğrulama
adımının beklenen değerleri bunlar.

| Ölçüm | Değer | Anlamı |
|---|---|---|
| `worlds.clock_offset_ms` | **196 563** (≈196,5 sn) | Göç bu kadar kaydıracak; `time_shifts` satırındaki `shift_ms` **buna eşit** çıkmalı |
| Takılmış görev | **0** | Kuyruk şu an sağlıklı; 06.08 olayı tekrarlamadı |
| Açık transaction | **yok** | Kök neden şu an aktif değil |
| `statement_timeout` / `idle_in_transaction` / `lock_timeout` | **hepsi 0** | Faz 1 bunları getirecek — ölçüldü: uygulama bağlantısında `30s / 2min / 10s` |
| `max_connections` | **40** | Havuz (süreç başına 10) bolca altında |
| Ölü mektup | **2** | ⚠️ aşağı bak |

⚠️⚠️ **DAĞITIM ÖNCESİ TEK ELLE İŞ — iki ölü mektup.** `outbox` id 1 ve 2, 02.08'deki Resend
`invalid_idempotent_request` olayının artığı (veritabanı sıfırlanmış, Resend anahtarları
görmüştü). Sebep **zaten düzeltildi** (`outbox-<id>-<createdAt>` anahtarı, `worker.ts`).
Ama Faz 3'ün `outbox_dead` eşiği **0** olduğu için dağıtımın ilk dakikasında bir alarm açar ve
e-posta gönderir — beş gün önce çözülmüş bir sorun için. **Dağıtım gününde yanlış alarm almak,
alarmın okunmamasını öğretir**; bu, alarm sisteminin üretebileceği en kötü sonuç.

Doğru işlem satırları silmek DEĞİL (kendi kuralımız: *"teslim edilmemiş satır bir arıza
kanıtıdır"*), **kapatmak**:

```sql
-- Bilinçli operatör işlemi: teslim edilemeyeceği KANITLANMIŞ iki satırı kapat + izini bırak.
UPDATE outbox SET dispatched_at = now() WHERE id IN (1, 2) AND dispatched_at IS NULL;
INSERT INTO audit_log (world_id, action, entity, after)
VALUES (NULL, 'ops.outbox.acknowledge', 'outbox',
        '{"ids":[1,2],"reason":"2026-08-02 Resend idempotency olayi; anahtar duzeltildi, mail artik gonderilemez"}'::jsonb);
```

### Sunucuda BİR KEZ yapılacaklar — ayrıntı (yukarıdaki A1/A2 adımlarının gerekçesi)

⚠️ Bu iki adım koda yazılamaz; sunucuda elle yapılır ve **yapılmazsa Faz 3'ün yarısı sessizce
çalışmaz**.

```bash
# 1. LOG ROTASYONU — bugün YOK ve dosyalar sınırsız büyüyor.
#    ⚠️ Faz 3 logu yapılandırdı (JSON, pino) ve hacmi ARTIRDI. 40 GB'lık diskte, üzerinde iki
#    canlı site daha barındıran bir sunucuda rotasyonsuz log, çözdüğü sorundan büyük bir
#    sorun: disk dolunca Postgres yazamaz ve oyun tamamen durur.
ssh deploy@31.210.36.185 "pm2 install pm2-logrotate"
ssh deploy@31.210.36.185 "pm2 set pm2-logrotate:max_size 20M"
ssh deploy@31.210.36.185 "pm2 set pm2-logrotate:retain 14"
ssh deploy@31.210.36.185 "pm2 set pm2-logrotate:compress true"

# 2. ALARM ADRESİ — .env'e ekle, sonra `pm2 reload mobilwar`.
#    ⚠️ Boşsa eşik aşımları `ops_events` tablosuna yine YAZILIR ve panelde görünür; yalnız
#    e-posta gitmez. Yani boş bırakmak "izleme kapalı" değil, "kimse haber almıyor" demek —
#    06.08.2026'da arızanın 9,5 saat sürmesinin sebebi tam olarak buydu.
#    OPS_ALERT_EMAIL=destek@mobilwar.com
```

**İsteğe bağlı ama önerilir — dış yoklayıcı `/healthz?deep=1`e baksın.** Sığ `/healthz`, süreç
ayakta olduğu sürece daima 200 döner; 06.08.2026'da API sapasağlamdı, uç yeşildi ve kuyruk 9,5
saattir durmuştu. Derin kontrol nabız yaşına, kuyruk gecikmesine ve ölü mektuba bakıp **503**
döner. ⚠️ Eşik aşımını scheduler'ın kendisi değerlendiriyor; **scheduler ölürse alarm da ölür**
— o boşluğu ancak dışarıdan bakan bir yoklayıcı kapatır.

### Elle müdahale gereken durumlar
```bash
# Geri alma (sağlık kontrolü geçmiş ama sorun sonradan görülmüşse)
ssh deploy@31.210.36.185 "ls -1t /var/www/mobilwar/releases | head -5"
ssh deploy@31.210.36.185 "/var/www/mobilwar/releases/<eski-sürüm>/ops/surum-yayinla.sh <eski-sürüm>"

# Loglar (Faz 3'ten beri JSON — `jq` ile süzülebilir)
ssh deploy@31.210.36.185 "pm2 logs mobilwar --lines 100 --nostream"
ssh deploy@31.210.36.185 "tail -n 2000 ~/.pm2/logs/mobilwar-out.log | jq -c 'select(.mod==\"scheduler\")'"
ssh deploy@31.210.36.185 "tail -n 5000 ~/.pm2/logs/mobilwar-error.log | jq -c 'select(.traceId==\"<oyuncunun-verdigi-id>\")'"

# Derin sağlık: süreç ayakta ama KUYRUK durmuş mu? (`/healthz` tek başına bunu söylemez)
ssh deploy@31.210.36.185 "curl -s -o /dev/null -w '%{http_code}\n' localhost:3002/healthz?deep=1"
ssh deploy@31.210.36.185 "curl -s 'localhost:3002/healthz?deep=1' | jq ."

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
| 6b | ⚠️⚠️ **`/var/lib/mobilwar/uploads` yedeğe eklenecek** | **Veritabanı yedeği artık TEK BAŞINA tam yedek DEĞİL** (2026-08-14). Destek eklerinin gelişine kadar tüm durum Postgres'teydi ve `pg_dump` her şeyi kapsıyordu; artık kapsamıyor. `pg_restore` sonrası DB'de duran her ek satırının dosyası eksik olur ve indirme 500 döner. `UPLOAD_ROOT` ayrıca `deploy:www-data` / `0750` olmalı — nginx dosyayı `X-Accel-Redirect` ile **kendisi** okuyor (`ops/sunucu-kurulum.sh`) |
| 7 | `og:url` / `og:image` | `apps/web/index.html`'deki mutlak adresler alan adına bağlı |
| 8 | Sohbete düşen sırlar | **Resend API anahtarı ve root/deploy parolaları bu oturumda düz metin geçti** — yayına çıkmadan döndürülmeli |

---

## 5. İlk dağıtımın dersleri (2026-08-02)

Üç şey kırıldı; üçü de yapılandırma, hiçbiri uygulama kodu değildi.

### 5.1 PM2: `node_args` ile `interpreter_args` **aynı alan**
Tanımda ikisi birden vardı. PM2 bunları ayrı alan sanmıyor — `node_args`, `interpreter_args`'ın
**takma adı**. Biri diğerini ezdi, `--env-file=/etc/mobilwar/.env` düştü ve süreç açılışta
«DATABASE_URL tanımsız» diyerek öldü.

Asıl sinsi kısım: **PM2 uygulamayı «online» gösterdi.** Sağlık kontrolü olmasaydı dağıtım
başarılı sanılırdı. `surum-yayinla.sh`'in `/healthz` adımı tam da bunun için var — 30 sn
bekledi, cevap alamadı ve sürümü kendiliğinden geri aldı. Site hiç bozulmadı.

→ Değişiklikten sonra `pm2 describe mobilwar` çıktısındaki **«interpreter args»** satırına bak.

### 5.2 nginx `http2 on;` — sunucuda 1.24 var
`http2` ayrı direktif olarak 1.25.1 ile geldi. `nginx -t` bunu **reload'dan önce** yakaladı;
üç canlı site aynı nginx'e bağlı olduğu için bu adım pazarlıksız.

### 5.3 ⛔ `smoke.mjs` üretime karşı koşturuldu
Betik gerçek hesap açıyor ve gerçek mail gönderiyor. Sonuç: üretim veritabanına iki test
oyuncusu, Resend'den `@smoke.local` adreslerine iki mail — **hard bounce**, üstelik hesabın
ilk gönderimleri oldukları için bounce oranı bir anda %100 göründü.

Veritabanı sıfırlandı (`DROP`/`CREATE` + 36 göç + dünya kaydı; gerçek oyuncu yoktu).
**Resend'deki kayıt geri alınamadı.** Betiğe `NODE_ENV=production` kapısı eklendi.

→ Canlıyı denemenin doğru yolu: `/healthz`, `pm2 logs` ve gerçek bir tarayıcıyla tek kayıt.

### 5.4 Ne İŞE YARADI
- **Sağlık kontrolü + otomatik geri alma**: bozuk sürüm canlıya hiç oturmadı.
- **`nginx -t && reload` zinciri**: hatalı yapılandırma diğer siteleri düşürmedi.
- **Sürüm dizinleri**: paket sunucuda durduğu için düzeltmeden sonra **yeni bir CI koşusu
  gerekmedi** — aynı sürüm tek komutla yeniden yayınlandı.
- **Göç ayrı adım**: uygulama açılamadığı hâlde şema doğru kurulmuştu.
