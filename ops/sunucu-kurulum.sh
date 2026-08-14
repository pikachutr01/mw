#!/usr/bin/env bash
# ── MobilWar — sunucu hazırlığı (TEK SEFERLİK, root ile) ─────────────────────
#
# Bu betik sunucuyu MobilWar'ı çalıştırabilir hâle getirir; **siteyi yayına ALMAZ**.
# nginx yapılandırmaları yalnız `sites-available`'a kopyalanır — etkinleştirme (symlink),
# sertifika ve ilk dağıtım ayrı ve bilinçli adımlardır (docs/YAYINA_ALMA.md).
#
# Betik İDEMPOTENT: ikinci kez çalıştırmak zarar vermez, var olanı bozmaz.
#
# ⚠️ SUNUCUDA BAŞKA CANLI SİTELER VAR (`scrabblecozucu.com`, `klavyetest.xyz`). Bu betik
# onlara dokunmuyor. En kritik nokta Node: sistem Node'u **v20** ve iki site onu kullanıyor.
# Yükseltmek onları da habersiz taşırdı → Node 22 `/opt/node22` altına AYRI kuruluyor.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "root ile çalıştır."; exit 1; }

NODE_MAJOR=22
BASE=/var/www/mobilwar
DEPLOY_USER=deploy
say() { echo; echo "── $* ──"; }

# ── 1. Node 22 (izole) ───────────────────────────────────────────────────────
say "Node ${NODE_MAJOR} → /opt/node${NODE_MAJOR}"
if [[ -x /opt/node${NODE_MAJOR}/bin/node ]]; then
  echo "zaten kurulu: $(/opt/node${NODE_MAJOR}/bin/node --version)"
else
  V=$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/" \
      | grep -o "node-v${NODE_MAJOR}\.[0-9.]*-linux-x64\.tar\.xz" | head -1)
  [[ -n "$V" ]] || { echo "Node ${NODE_MAJOR} sürümü bulunamadı."; exit 1; }
  echo "indiriliyor: $V"
  curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/${V}" -o /tmp/node.tar.xz
  mkdir -p /opt/node${NODE_MAJOR}
  tar -xJf /tmp/node.tar.xz -C /opt/node${NODE_MAJOR} --strip-components=1
  rm -f /tmp/node.tar.xz
  echo "kuruldu: $(/opt/node${NODE_MAJOR}/bin/node --version)"
fi
# ⚠️ PATH'e EKLENMİYOR — eklenirse `node` çağıran her şey (iki canlı sitenin PM2 süreçleri
# dahil) sessizce sürüm değiştirebilirdi. Yalnız PM2 `interpreter` alanı bu yolu biliyor.

# ── 2. PostgreSQL 17 ─────────────────────────────────────────────────────────
say "PostgreSQL 17"
if command -v psql >/dev/null 2>&1; then
  echo "zaten kurulu: $(psql --version)"
else
  apt-get install -y -qq postgresql-common >/dev/null
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  apt-get install -y -qq postgresql-17 >/dev/null
  echo "kuruldu: $(psql --version)"
fi

# ── 3. Postgres ayarları (4 GB profili) ──────────────────────────────────────
# Gerekçeler §4.0'da. `jit=off`: küçük kutuda JIT CPU yakar, faydası yok.
# `autovacuum_*_scale_factor` düşük: `missions` ve `outbox` yüksek devirli tablolar.
say "Postgres ayarları"
cat > /etc/postgresql/17/main/conf.d/99-mobilwar.conf <<'CONF'
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
autovacuum_analyze_scale_factor = 0.05
# ⚠️ Dışarı AÇILMAZ: uygulama aynı kutuda, 5432 ufw'de de kapalı.
listen_addresses = 'localhost'
timezone = 'UTC'
log_min_duration_statement = 500ms
CONF
mkdir -p /etc/postgresql/17/main/conf.d
grep -q "conf.d" /etc/postgresql/17/main/postgresql.conf \
  || echo "include_dir = 'conf.d'" >> /etc/postgresql/17/main/postgresql.conf
systemctl enable --now postgresql >/dev/null 2>&1 || true
systemctl restart postgresql
echo "postgres: $(systemctl is-active postgresql)"

# ── 4. Veritabanı ve rol ─────────────────────────────────────────────────────
# Parola dışarıdan gelir (betikte SABİT DEĞİL): PGPASS ortam değişkeni.
say "veritabanı + rol"
: "${PGPASS:?PGPASS tanımsız — parolayı çağıran taraf üretip geçmeli}"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='mobilwar'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE mobilwar LOGIN PASSWORD '${PGPASS}'"
sudo -u postgres psql -c "ALTER ROLE mobilwar PASSWORD '${PGPASS}'" >/dev/null
for db in mobilwar; do
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || sudo -u postgres createdb -O mobilwar "$db"
done
echo "hazır: $(sudo -u postgres psql -tAc "SELECT datname FROM pg_database WHERE datname='mobilwar'")"

# ── 5. Dizinler ──────────────────────────────────────────────────────────────
say "dizinler"
mkdir -p "$BASE/releases" "$BASE/shared/logs"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BASE"
mkdir -p /var/www/html/.well-known/acme-challenge   # certbot --webroot için

# ⭐ Destek eklerinin deposu (2026-08-14) — projedeki İLK kullanıcı içeriği dizini.
# ⚠️⚠️ Sahiplik `deploy:www-data` ve mod 0750 olmak ZORUNDA. Dosyayı **nginx** servis ediyor
#    (`X-Accel-Redirect`), yani grubun okuma izni şart. Bu adım atlanırsa özellik "çalışıyor"
#    görünür — yükleme başarılı olur, DB satırı yazılır — ama her indirme 403 döner ve hata
#    uygulama hatası gibi görünür. En pahalı yanlış teşhis sınıfı.
# ⚠️ Sürüm dizininin (`$BASE`) DIŞINDA: yüklenen içerik dağıtımla gelip gitmemeli.
mkdir -p /var/lib/mobilwar/uploads
chown -R "$DEPLOY_USER:www-data" /var/lib/mobilwar
chmod 750 /var/lib/mobilwar /var/lib/mobilwar/uploads

echo "$BASE hazır"

# ── 6. Sırlar ────────────────────────────────────────────────────────────────
# /etc/mobilwar/.env — root'a ait, `deploy` YALNIZ OKUR. Süreç `deploy` olarak koştuğu
# için okuma izni şart; yazma izni bilerek yok (dağıtım sırları değiştiremesin).
say "/etc/mobilwar/.env"
mkdir -p /etc/mobilwar
if [[ -f /etc/mobilwar/.env ]]; then
  echo "zaten var — DOKUNULMADI (sırların üzerine yazmak tüm oturumları ve push aboneliklerini düşürürdü)"
else
  echo "yok — çağıran taraf oluşturacak"
fi
chown -R root:"$DEPLOY_USER" /etc/mobilwar
chmod 750 /etc/mobilwar
[[ -f /etc/mobilwar/.env ]] && chmod 640 /etc/mobilwar/.env

# ── 7. nginx yapılandırmaları (KOPYALANIR, etkinleştirilmez) ─────────────────
say "nginx yapılandırmaları"
SRC="$(cd "$(dirname "$0")" && pwd)/nginx"
cp "$SRC/cloudflare-realip.conf" /etc/nginx/conf.d/
cp "$SRC/mobilwar.com.conf"       /etc/nginx/sites-available/mobilwar.com
cp "$SRC/admin.mobilwar.com.conf" /etc/nginx/sites-available/admin.mobilwar.com
echo "sites-available'a kopyalandı. ⚠️ ETKİNLEŞTİRİLMEDİ — sertifika alınmadan bu bloklar"
echo "   nginx'i başlatmaz (var olmayan .pem'e bakıyorlar). Sıra: certbot → symlink → reload."

# ── 8. PM2 tanımı ────────────────────────────────────────────────────────────
say "PM2 ecosystem"
cp "$(cd "$(dirname "$0")" && pwd)/pm2/ecosystem.config.cjs" "$BASE/shared/"
chown "$DEPLOY_USER:$DEPLOY_USER" "$BASE/shared/ecosystem.config.cjs"
echo "$BASE/shared/ecosystem.config.cjs"

# ── 9. Günlük yedek ──────────────────────────────────────────────────────────
# ⚠️ Yedekler AYNI SUNUCUDA duruyor — sunucu tamamen giderse yedek de gider. Uzak kopya
# (rclone/restic → B2) hâlâ yapılacaklar listesinde (VPS_DURUM_RAPORU §3b).
say "günlük yedek"
cat > /usr/local/bin/mobilwar-pg-yedek.sh <<'YEDEK'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /var/backups/mobilwar
TS=$(date +%F)
sudo -u postgres pg_dump --format=custom mobilwar \
  > "/var/backups/mobilwar/mobilwar_$TS.dump"
find /var/backups/mobilwar -name '*.dump' -mtime +14 -delete
YEDEK
chmod +x /usr/local/bin/mobilwar-pg-yedek.sh
( crontab -l 2>/dev/null | grep -v mobilwar-pg-yedek; \
  echo "45 4 * * * /usr/local/bin/mobilwar-pg-yedek.sh" ) | crontab -
echo "cron: her gün 04:45 (MySQL yedeği 04:30'da, çakışmıyor)"

# ── 10. Cloudflare IP listesi tazeleme ───────────────────────────────────────
say "Cloudflare IP tazeleme (aylık)"
cat > /usr/local/bin/mobilwar-cf-ip.sh <<'CFIP'
#!/usr/bin/env bash
# Cloudflare aralıkları değişirse real-ip listesi bayatlar: gerçek IP'ler yanlış okunur
# ve panel koruması yanlış istekleri düşürür. Ayda bir tazelenir.
set -euo pipefail
OUT=/etc/nginx/conf.d/cloudflare-realip.conf
TMP=$(mktemp)
{
  echo "# OTOMATİK ÜRETİLDİ — $(date -u +%F) · kaynak: mw/ops/nginx/cloudflare-realip.conf"
  curl -fsS https://www.cloudflare.com/ips-v4 | sed 's/^/set_real_ip_from /; s/$/;/'
  curl -fsS https://www.cloudflare.com/ips-v6 | sed 's/^/set_real_ip_from /; s/$/;/'
  echo "real_ip_header CF-Connecting-IP;"
  echo "geo \$realip_remote_addr \$mw_cloudflare {"
  echo "    default 0;"
  curl -fsS https://www.cloudflare.com/ips-v4 | sed 's/^/    /; s/$/ 1;/'
  curl -fsS https://www.cloudflare.com/ips-v6 | sed 's/^/    /; s/$/ 1;/'
  echo "}"
} > "$TMP"
cp "$TMP" "$OUT" && rm -f "$TMP"
# ⚠️ Önce sına: bozuk yapılandırmayla reload etmek TÜM siteleri düşürürdü.
nginx -t && systemctl reload nginx
CFIP
chmod +x /usr/local/bin/mobilwar-cf-ip.sh
( crontab -l 2>/dev/null | grep -v mobilwar-cf-ip; \
  echo "20 5 1 * * /usr/local/bin/mobilwar-cf-ip.sh" ) | crontab -
echo "cron: her ayın 1'i 05:20"

say "BİTTİ"
echo "Sıradaki adımlar docs/YAYINA_ALMA.md'de: DNS (admin kaydı) → certbot → nginx etkinleştir → ilk dağıtım."
