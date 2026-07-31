# VPS DURUM RAPORU — 31.210.36.185

> **Tarih:** 2026-07-26 · İnceleme + temizlik yapıldı, **hiçbir servis durdurulmadı**, siteler kesintisiz.

## 1. Sistem künyesi

| | |
|---|---|
| İşletim sistemi | Ubuntu 24.04.4 LTS · kernel **6.8.0-111** (çalışan) |
| CPU | 2 vCPU · Intel Xeon E5-2699C v4 @ 2.20 GHz |
| RAM | 1.9 GB + **3.4 GB swap** (swappiness zaten 10 ✓) |
| Disk | 30 GB · **9.3 GB kullanımda (%33)** — temizlik öncesi 13 GB (%46) |
| Çalışma süresi | 82 gün (⚠️ yeniden başlatma bekliyor) |
| Yük ortalaması | 0.04 / 0.05 / 0.00 — **CPU neredeyse boşta** |

## 2. Üzerinde çalışan sistemler

| Site | Teknoloji | Port | Bellek |
|---|---|---|---|
| **scrabblecozucu.com** + `api.` | React (statik, nginx) + Node backend (PM2 `scrabble-backend`) | 3000 | 122 MB |
| **klavyetest.xyz** | React (statik, nginx) + Node backend (PM2 `typing-backend`) | 3001 | 55 MB |
| phpMyAdmin | php-fpm 8.3 | — | 16 MB |
| MySQL 8 | tek veritabanı `klmbul` (**81 MB veri**) | 3306 (localhost) | 214 MB |

**Kurulu altyapı:** nginx · MySQL 8 · php-fpm 8.3 · Node.js + **PM2** (systemd servisi olarak) ·
certbot (4 sertifika, en yakın yenileme 56 gün) · **ufw aktif** (22, 80/443, 57109) ·
**fail2ban** (2 jail: sshd, nginx-botsearch) · unattended-upgrades **açık** · postfix (yerel mail) ·
open-vm-tools. **Docker YOK. Redis YOK. PostgreSQL YOK.**

## 3. Yapılan temizlik (kesintisiz, ~3.7 GB kazanıldı)

| İşlem | Kazanç |
|---|---|
| `.vscode-server` (5 Mart'tan beri kullanılmıyor, 5 eski sürüm) | **1.4 GB** |
| pnpm store prune (819 paket, 36.380 dosya) | **~500 MB** |
| npm cache (646 MB → 700 KB) | **645 MB** |
| Eski çekirdek paketlerinin `rc` artıkları (30 paket) + yetim modül dizinleri | **~600 MB** |
| MySQL binlog (405 MB → 162 MB, saklama 7 gün → **3 gün** kalıcı ayar) | **243 MB** |
| `btmp` + `btmp.1` (127.164 başarısız SSH denemesi kaydı) | **97 MB** |
| apt önbelleği | 109 MB |
| snapd tamamen kaldırıldı (hiç snap uygulaması kullanılmıyordu) | 455 MB disk + **~40 MB RAM** |
| 30 günden eski sıkıştırılmış loglar | ~160 MB |

**Sonuç:** disk %46 → **%33** · kullanılan RAM 876 MB → **~790 MB** · kullanılabilir RAM 1091 MB → **1177 MB**.
Doğrulama: nginx/mysql/php-fpm/pm2/fail2ban/ssh **hepsi aktif**, `scrabblecozucu.com` ve
`klavyetest.xyz` **HTTP 200**, PM2 uygulamaları online (restart sayıları değişmedi).

## 3b. ✅ İyileştirmeler UYGULANDI (2026-07-26, kullanıcı onayıyla)

| İşlem | Sonuç |
|---|---|
| **MySQL günlük yedeği kuruldu** | `/usr/local/bin/mysql-backup.sh` + cron `30 4 * * *`; ilk yedek alındı: **6.9 MB, 51 tablo**, bütünlük doğrulandı (`gunzip -t`), 14 gün saklama |
| MySQL `performance_schema = OFF` | mysqld **269 MB → 183 MB** |
| `innodb_buffer_pool_size` 64 → **128 MB** | 81 MB'lik veritabanı artık tamamen bellekte |
| 8 paket güncellemesi + `autoremove` | bekleyen güncelleme **0** |
| **Yeniden başlatma** | kernel **6.8.0-111 → 6.8.0-136** ✓ · `reboot-required` temizlendi · snapd systemd artıkları tamamen gitti (0 süreç, 0 birim) |
| `ufw delete allow 57109/tcp` | kullanılmayan port kapatıldı |

**Yeniden başlatma sonrası doğrulama:** nginx/mysql/php-fpm/pm2-deploy/fail2ban/ssh/cron **hepsi aktif** ·
PM2'de `scrabble-backend` + `typing-backend` **online** (otomatik ayağa kalktı) ·
`scrabblecozucu.com` ve `klavyetest.xyz` **HTTP 200** · MySQL ayarları kalıcı (ps=OFF, pool=128M, binlog=3 gün).

**Nihai durum:** kullanılan RAM **640 MB** (başlangıç 876 MB) · kullanılabilir **1327 MB** (başlangıç 1091 MB)
· disk **%33** (başlangıç %46).

> ⚠️ **Yedekle ilgili not:** MySQL `root` parolası elimizde yok (`/root/.my.cnf` `scrabbleuser` olarak
> bağlanıyor, `root` ise auth_socket kullanmıyor). Bu yüzden yedek `--all-databases` değil, **`klmbul`
> veritabanını** alıyor — zaten tek gerçek veri o (`phpmyadmin` ve sistem şemaları 0 MB). MySQL root
> parolasını bulursan betiği `--all-databases` yapmak 1 satırlık değişiklik.
> **Yedekler hâlâ aynı sunucuda** — sunucu tamamen giderse yedek de gider. Uzak kopya (rclone/restic →
> B2 veya Storage Box) hâlâ yapılacaklar listesinde.

## 4. ⚠️ Bulgular (aksiyon gerektirenler)

### 4.1 KRİTİK — MySQL yedeği YOK
Root ve deploy crontab'larında yedekleme görevi yok; yalnız `/root/delete_old_logs.sh` (log budama) var.
`/home/deploy` altındaki iki `.sql` dosyası **23 Haziran** tarihli, elle alınmış. Binlog'lar tek başına
işe yaramaz (temel yedek olmadan geri dönülemez). Sunucu çökerse `klmbul` veritabanı **tamamen gider**.
→ Aşağıda hazır cron önerisi var (§6).

### 4.2 Yeniden başlatma bekliyor
82 gündür açık. Kernel **6.8.0-136** kurulu ama **6.8.0-111** çalışıyor; ayrıca 8 paket güncellemesi
bekliyor (apport, iproute2, plymouth, apparmor…). `/var/run/reboot-required` mevcut.
Ayrıca snapd kaldırıldı ama systemd birim artıkları yeniden başlatmayla tamamen temizlenecek.
→ **Sitelerin ~1 dakika kesintiye girmesi anlamına geldiği için ben yapmadım.**

### 4.3 MySQL `performance_schema` açık
2 GB'lik makinede ~100-150 MB boşa RAM. Bu sunucuda hiç kullanılmıyor (izleme aracı yok).
Kapatmak MySQL yeniden başlatması gerektirir (~5 sn, sitelerin DB'si o an cevap veremez).
`innodb_buffer_pool_size` 64 MB — 81 MB'lik veritabanı için 128 MB'a çıkarmak sorguları hızlandırır.

### 4.4 Küçük notlar
- **57109/tcp** ufw'de açık ama **hiçbir şey dinlemiyor** → kural kaldırılabilir.
- **127.164 başarısız SSH girişi** — fail2ban yakalıyor ama SSH'ı anahtar-tabanlı yapmak (parola
  girişini kapatmak) tek gerçek çözüm. Şu an parola girişi **açık**.
- `scrabblecozucu.site` için sertifika var ama nginx'te **etkin site yok** (sites-available'da duruyor).
- `packagekitd` (21 MB) sunucuda gereksiz, devre dışı bırakılabilir.
- `scrabble-backend` 48 kez yeniden başlamış (3 gün uptime) — çökme/OOM olabilir, PM2 logları
  incelenmeye değer.

## 5. ⭐ Kaynak yükseltme kararı

**Öneri: 4 GB RAM + 3 çekirdek yeterli. 6 GB'a şimdi gerek yok.**

Gerekçe — 4 GB'de bellek dağılımı:
```
Mevcut siteler + sistem      ~790 MB   (ölçülen)
Mobiwar PostgreSQL           ~768 MB   (shared_buffers 256MB)
Mobiwar uygulama (Node)      ~400 MB
─────────────────────────────────────
Toplam                      ~1.96 GB  →  4 GB'de ~2 GB sayfa önbelleği kalır
```
CPU zaten sorun değil: yük ortalaması **0.04** (2 çekirdek neredeyse boşta). 3. çekirdek Postgres +
Node için rahat rahat yeter. Beta hedefimiz (100-200 eşzamanlı oyuncu) bu yapılandırmada güvenli.

**6 GB'ı ne zaman al:** oyuncu sayısı artıp Postgres veritabanı birkaç GB'ı geçtiğinde (önbellek
yetmemeye başlayınca) — o zaman da parayı doğru yere harcamış olursun. Şimdi almak boşa gider.

## 6. Önerilen sonraki adımlar (senin onayınla)

**A. Hemen yapılabilir (kesintisiz):**
```bash
# MySQL yedeği — günlük, 14 gün saklama
sudo tee /usr/local/bin/mysql-backup.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /var/backups/mysql
TS=$(date +%F)
mysqldump --single-transaction --routines --triggers --all-databases \
  | gzip > /var/backups/mysql/all_$TS.sql.gz
find /var/backups/mysql -name '*.sql.gz' -mtime +14 -delete
EOF
sudo chmod +x /usr/local/bin/mysql-backup.sh
( sudo crontab -l 2>/dev/null; echo "30 4 * * * /usr/local/bin/mysql-backup.sh" ) | sudo crontab -
sudo ufw delete allow 57109/tcp        # kullanılmayan port
sudo systemctl disable --now packagekit
```
> Yedekleri **sunucu dışına** da kopyalamak şart (rclone/restic → B2 veya Storage Box).

**B. Kısa kesintiyle (MySQL ~5 sn):**
```bash
sudo tee /etc/mysql/mysql.conf.d/99-tuning.cnf >/dev/null <<'EOF'
[mysqld]
performance_schema = OFF
innodb_buffer_pool_size = 128M
EOF
sudo systemctl restart mysql          # ~100-150 MB RAM kazancı
```

**C. Yeniden başlatma (~1 dk kesinti, düşük trafik saatinde):**
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot                            # kernel 6.8.0-136 + snapd artıklarının temizlenmesi
```

**D. Güvenlik (önerilir):** SSH anahtar girişine geç, `PasswordAuthentication no`.
Ayrıca **bu sohbette paylaşılan root ve deploy parolalarını değiştir** — düz metin olarak iletildiler.

---

## 7. Mobiwar dağıtımına etkisi (plan güncellemeleri)

Sunucunun gerçek durumu iki mimari kararı değiştirdi:

1. **Caddy YOK → mevcut nginx kullanılacak.** nginx zaten 80/443'ü tutuyor ve certbot kurulu.
   Mobiwar için `oyun.alanadin.com` adında yeni bir nginx site dosyası + `certbot --nginx` yeterli.
   İkinci bir web sunucusu kurmak port çakışması ve boşa RAM demekti.
2. **Docker YOK → PostgreSQL native (apt/PGDG) + uygulama PM2 ile.** Sunucuda Docker yok ve
   Docker daemon'ı ~80 MB. Mevcut düzen (nginx + PM2 + systemd) zaten çalışıyor ve sen bu düzene
   alışıksın. CI, Docker imajı yerine **derlenmiş artefakt** (tarball) üretir; sunucuya rsync ile
   gider, `pm2 reload` yapılır. *Lokal geliştirmede Docker (postgres:17) kullanmaya devam —
   önemli olan sürüm paritesi, çalıştırma biçimi değil.*
3. **Port 3002** Mobiwar API'sine ayrıldı (3000 ve 3001 dolu).
4. Görev zamanlayıcısı (worker) ayrı PM2 uygulaması olarak da çalıştırılabilir; 4 GB'de
   `ROLE=all` tek süreç yeterli, gerekirse `ROLE=api` + `ROLE=worker` diye ikiye bölünür.
