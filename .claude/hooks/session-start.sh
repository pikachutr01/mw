#!/bin/bash
# ⭐ OTURUM AÇILIŞ KANCASI — Claude Code on the web (2026-08-13).
#
# Amaç: uzak oturum, testleri KOŞABİLİR hâlde açılsın. API testlerinin 54 dosyasından 53'ü
# GERÇEK Postgres istiyor (`apps/api/test/helpers/db.ts`: `SKIP LOCKED`, advisory lock ve
# transaction davranışı taklit edilemez).
#
# ⚠️ Uzak konteynerde Docker YOK ama PostgreSQL **native kurulu** ve cluster hazır — yalnız
# başlatılmamış oluyor. `compose.dev.yml` bu yüzden burada işe yaramaz; onun yerine mevcut
# cluster kullanılıyor. `docs/referans/KURULUM_REHBERI.md` zaten "önemli olan sürüm paritesi,
# çalıştırma biçimi değil" diyor.
#
# ⚠️ PID 1 systemd DEĞİL → `systemctl start postgresql` çalışmaz; doğru yol `pg_ctlcluster`.
#
# ⚠️ Rol/DB adları `apps/api/test/helpers/db.ts` içindeki `DATABASE_URL` VARSAYILANIYLA ve
# `.github/workflows/ci.yml` ile birebir aynı: `mobilwar:mobilwar@localhost:5432/mobilwar`.
# Böylece ne burada ne CI'da ortam değişkeni vermek gerekiyor. ⚠️ Role `CREATEDB` şart:
# testler `mobilwar_test_1..N` veritabanlarını (vitest worker başına bir tane) kendisi yaratıyor.
#
# ⚠️ Betik baştan sona **idempotent**: her açılışta yeniden koşuyor, var olanı bozmuyor.
set -euo pipefail

# Yerelde geliştirenin makinesine dokunma — orada Docker ile `compose.dev.yml` kullanılıyor.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# ── 1) Postgres ───────────────────────────────────────────────────────────────
# ⚠️ Postgres kurulu değilse SESSİZCE geçiliyor: oturumun kendisi bu yüzden ölmemeli, yalnız
#    DB isteyen testler koşmaz. `|| true` yerine açık kontrol — hatayı yutmak ile yokluğu
#    kabul etmek farklı şeyler.
if command -v pg_ctlcluster >/dev/null 2>&1 && [ -d /etc/postgresql ]; then
  PGVER="$(ls -1 /etc/postgresql | sort -V | tail -1)"
  if ! pg_isready -q 2>/dev/null; then
    pg_ctlcluster "$PGVER" main start || echo "uyarı: Postgres başlatılamadı (${PGVER})"
  fi

  if pg_isready -q 2>/dev/null; then
    # ⚠️ `psql -tAc` + `grep -q` yerine tek SQL: `DO` bloğu yarışa da dayanıklı.
    su postgres -c "psql -v ON_ERROR_STOP=1 -q" <<'SQL' || echo "uyarı: rol/DB kurulamadı"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobilwar') THEN
    CREATE ROLE mobilwar LOGIN PASSWORD 'mobilwar' CREATEDB;
  END IF;
END
$$;
SQL
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='mobilwar'\"" \
      | grep -q 1 || su postgres -c "createdb -O mobilwar mobilwar"
  fi
else
  echo "bilgi: Postgres yok — DB isteyen API testleri koşmayacak."
fi

# ── 2) Bağımlılıklar ──────────────────────────────────────────────────────────
# ⚠️ `--frozen-lockfile` DEĞİL: kilit dosyası tazeyken de koşan, dalda bir bağımlılık
#    eklendiğinde de çalışan bir kurulum istiyoruz. Konteyner durumu kancadan sonra
#    önbelleğe alınıyor, yani ikinci açılışta bu adım neredeyse anında bitiyor.
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
else
  echo "uyarı: pnpm bulunamadı — bağımlılıklar kurulmadı."
fi
