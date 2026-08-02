#!/usr/bin/env bash
# ── MobilWar — sürüm yayınlama (sunucuda çalışır) ────────────────────────────
#
# GitHub Actions derlenmiş paketi `/var/www/mobilwar/releases/<sürüm>` içine açar,
# sonra bu betiği çağırır. Betik yalnız SIRAYI ve GERİ ALMAYI yönetir; derleme yapmaz
# (§4.0: sunucuda derleme yasak — canlı iki site RAM için yarışır).
#
# Kullanım:  ./surum-yayinla.sh <sürüm-dizin-adı>
#
# ⭐ Sıra neden bu:
#   1. göç ÖNCE — yeni kod eski şemayla değil, yeni şemayla karşılaşsın. Göçler
#      expand-contract olduğu için eski kod da yeni şemada çalışmaya devam eder;
#      tersi (kod önce) doğru DEĞİL: yeni kod olmayan kolonu okuyup patlardı.
#   2. symlink SONRA — statik dosyalar ve Node girişi aynı anda yeni sürüme geçsin.
#   3. reload EN SON — `main.ts` SIGTERM'i yakalayıp çalışan görev turunu bitiriyor.
#   4. /healthz — geçmezse symlink ESKİ sürüme döner ve süreç yeniden yüklenir.
#
# ⚠️ GÖÇ GERİ ALINMAZ. Sağlık kontrolü başarısız olursa kod eski sürüme döner ama şema
# yeni kalır — bu yüzden her göç, bir önceki sürümün de çalışabileceği şekilde yazılmalı.
set -euo pipefail

REL_NAME="${1:?Kullanım: surum-yayinla.sh <sürüm-dizin-adı>}"
BASE=/var/www/mobilwar
REL="$BASE/releases/$REL_NAME"
NODE=/opt/node22/bin/node
HEALTH_URL=http://127.0.0.1:3002/healthz
KEEP=5   # kaç eski sürüm saklanır (geri alma için)

log() { echo "[yayın] $*"; }

[[ -d "$REL/api/dist" ]] || { echo "HATA: $REL/api/dist yok — paket eksik açılmış."; exit 1; }
[[ -x "$NODE" ]]         || { echo "HATA: $NODE yok — Node 22 kurulu mu?"; exit 1; }

# Geri alma hedefi: ŞU ANKİ sürüm (symlink henüz değişmedi).
PREV=""
if [[ -L "$BASE/current" ]]; then PREV="$(readlink -f "$BASE/current")"; fi
log "önceki sürüm: ${PREV:-yok (ilk yayın)}"

# ── 1. Göçler ────────────────────────────────────────────────────────────────
log "göçler uygulanıyor…"
( cd "$REL/api" && "$NODE" --env-file=/etc/mobilwar/.env scripts/migrate.mjs )

# ── 2. Sürüm değişimi ────────────────────────────────────────────────────────
# `ln -sfn` + `mv -T`: değişim ATOMİK olsun. Düz `ln -sf` var olan symlink'in İÇİNE
# yazmaya çalışır ve `current/current` üretir — klasik tuzak.
log "current → $REL_NAME"
ln -sfn "$REL" "$BASE/current.tmp"
mv -Tf "$BASE/current.tmp" "$BASE/current"

# ── 3. Uygulama ──────────────────────────────────────────────────────────────
# ⚠️ `reload` yerine `startOrReload`: uygulama PM2'de hiç yoksa (ilk yayın ya da
# `pm2 delete` sonrası) `reload` hata verir ve dağıtım orada durur.
log "pm2 startOrReload…"
pm2 startOrReload "$BASE/shared/ecosystem.config.cjs" --update-env
pm2 save --force >/dev/null

# ── 4. Sağlık kontrolü ───────────────────────────────────────────────────────
# Süreç ayağa kalkıp DB'ye bağlanana kadar birkaç saniye geçebilir; 30 sn tavan.
log "sağlık kontrolü…"
ok=0
for i in $(seq 1 30); do
  if curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "[yayın] ⛔ /healthz 30 sn içinde cevap vermedi."
  if [[ -n "$PREV" && -d "$PREV" ]]; then
    echo "[yayın] geri alınıyor → $(basename "$PREV")"
    ln -sfn "$PREV" "$BASE/current.tmp"
    mv -Tf "$BASE/current.tmp" "$BASE/current"
    pm2 startOrReload "$BASE/shared/ecosystem.config.cjs" --update-env
    echo "[yayın] eski sürüme dönüldü. ⚠️ ŞEMA yeni kaldı (göç geri alınmaz)."
  else
    echo "[yayın] geri alınacak önceki sürüm yok."
  fi
  echo "[yayın] son loglar:"; pm2 logs mobilwar --lines 40 --nostream || true
  exit 1
fi

log "✅ sağlık kontrolü geçti."

# ── 5. Eski sürümleri buda ───────────────────────────────────────────────────
# Sürüm başına ~65 MB; 5 sürüm ≈ 325 MB. Diskte 29 GB boş var, bol geliyor.
cd "$BASE/releases"
ls -1dt */ 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r d; do
  # Yayında olan sürüm asla silinmez (savunma amaçlı ikinci kontrol).
  [[ "$(readlink -f "$BASE/current")" == "$(readlink -f "$d")" ]] && continue
  log "eski sürüm siliniyor: $d"
  rm -rf -- "$d"
done

log "🚀 $REL_NAME yayında."
