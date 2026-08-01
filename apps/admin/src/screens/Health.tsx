/**
 * ⭐ BAKIM EKRANI (Faz 8) — panelin son ekranı.
 *
 * Tasarım kararı: bu ekran **soru sormaz, cevap verir**. Bir sayı göstermek yetmez; her
 * bölüm "bu sayı iyi mi kötü mü" ayrımını da taşır (rozet + eşik). Ham sayı gösteren bir
 * bakım ekranı, yöneticiyi her seferinde belgeye bakmaya zorlar ve pratikte açılmaz.
 *
 * ⚠️ **Temizlik akışı iki adımlı ve geri döndürülemez.** Önce kuru koşu (kaç satır, en
 * eskisi ne kadar), sonra ayrı bir onay. Aynı uç kullanılıyor: `confirm` yokken hiçbir şey
 * silinmiyor, yani yanlış tıklama veri kaybına dönüşemiyor.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Badge, Button, ErrorBox, Panel } from '../components/ui.tsx';

interface Loop {
  kind: string; workerId: string; worldId: number | null; pid: number | null; role: string | null;
  ageS: number; uptimeS: number; ticks: number; alive: boolean;
  detail: Record<string, unknown>;
}
interface Health {
  now: string; staleAfterS: number; loops: Loop[]; loopsKnown: boolean;
  outbox: {
    pending: number; dead: number; retrying: number; total: number;
    oldestPendingS: number | null;
    deadTopics: { topic: string; count: number; lastError: string | null }[];
  };
  worlds: {
    worldId: number; name: string; state: string;
    scheduled: number; running: number; failed: number; lagS: number | null;
  }[];
  pool: {
    total: number; active: number; idle: number; idleInTx: number;
    maxConnections: number; oldestTxS: number;
  };
}
interface SizeRow {
  table: string; totalBytes: number; tableBytes: number; indexBytes: number;
  indexCount: number; estRows: number | null; deadRows: number | null; lastAnalyze: string | null;
}
interface Job {
  id: string; label: string; table: string; description: string; keeps: string;
  settings: string[]; matched: number; tableRows: number; oldest: string | null;
}
interface SlowQuery { query: string; calls: number; totalMs: number; meanMs: number; rows: number }

const bytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

/** Saniyeyi insan ölçeğine çevirir — «412» değil «6 dk 52 sn». */
const dur = (s: number | null): string => {
  if (s == null) return '—';
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} sn`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`;
  return `${Math.floor(s / 86400)} gün ${Math.floor((s % 86400) / 3600)} sa`;
};

const num = (n: number | null): string => (n == null ? '—' : n.toLocaleString('tr-TR'));

export function HealthScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [sizes, setSizes] = useState<{ databaseBytes: number; tables: SizeRow[] } | null>(null);
  const [slow, setSlow] = useState<
    { available: boolean; reason?: string; howTo?: string; queries: SlowQuery[] } | null
  >(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loadHealth = useCallback(async (): Promise<void> => {
    try { setHealth(await api<Health>('/api/v1/admin/ops/health')); } catch (err) { setError(err); }
  }, []);

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      const out = await api<{ jobs: Job[] }>('/api/v1/admin/ops/cleanup');
      setJobs(out.jobs);
    } catch (err) { setError(err); }
  }, []);

  useEffect(() => {
    void loadHealth();
    void loadJobs();
    void api<{ databaseBytes: number; tables: SizeRow[] }>('/api/v1/admin/ops/sizes')
      .then(setSizes).catch(setError);
    void api<{ available: boolean; queries: SlowQuery[] }>('/api/v1/admin/ops/slow')
      .then(setSlow).catch(setError);
  }, [loadHealth, loadJobs]);

  /**
   * ⚠️ Sağlık 10 saniyede bir tazeleniyor, boyutlar TAZELENMİYOR. Boyut sorgusu her tabloyu
   * dolaşıyor ve saniyede bir koşması gereken bir bilgi değil; canlılık ise tam tersi.
   */
  useEffect(() => {
    const t = setInterval(() => void loadHealth(), 10_000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const run = async (job: Job, confirm: boolean): Promise<void> => {
    setBusy(job.id); setError(null); setNote(null);
    try {
      const out = await api<{ deleted: number; remaining: number; capped: boolean }>(
        `/api/v1/admin/ops/cleanup/${job.id}`, { method: 'POST', body: { confirm } },
      );
      setNote(confirm
        ? `«${job.label}» — ${out.deleted.toLocaleString('tr-TR')} satır silindi`
          + `${out.capped ? `, ${out.remaining.toLocaleString('tr-TR')} satır bir sonraki koşuya kaldı (tavan)` : ''}.`
        : `«${job.label}» kuru koşu: ${job.matched.toLocaleString('tr-TR')} satır eşleşiyor.`);
      await loadJobs();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(null); setConfirming(null);
    }
  };

  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {note ? (
        <p className="rounded-[var(--radius-sm)] border border-success bg-success/10 px-2.5 py-2
          text-xs text-success">{note}</p>
      ) : null}

      {/* ── 1. CANLILIK ─────────────────────────────────────────────────────── */}
      <Panel
        title="Döngü canlılığı"
        right={health ? `${health.staleAfterS} sn bayatlama eşiği` : '…'}
      >
        {!health ? <p className="p-3 text-xs text-muted">Yükleniyor…</p> : !health.loopsKnown ? (
          <p className="p-3 text-xs text-warning">
            ⚠️ Hiç nabız satırı yok. Bu <strong>«sağlıklı» demek değil, «bilinmiyor» demek</strong>:
            worker hiç çalışmamış ya da migration uygulanmamış olabilir.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {health.loops.map((l) => (
              <div key={`${l.kind}:${l.workerId}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Badge tone={l.alive ? 'success' : 'danger'}>{l.alive ? 'canlı' : 'ÖLÜ'}</Badge>
                <span className="text-sm text-ink">{l.kind}</span>
                <span className="text-xs text-muted">{l.workerId} · pid {l.pid ?? '—'} · ROLE={l.role ?? '—'}</span>
                <span className="text-xs text-muted">son nabız {dur(l.ageS)} önce</span>
                {/* ⭐ Uptime crash-loop'u gösterir: nabız taze ama süreç sürekli yeniden doğuyorsa
                    `at` güncel kalır ve yalnız BU alan düşer. */}
                <span className="text-xs text-muted">ayakta {dur(l.uptimeS)}</span>
                <span className="text-xs text-muted">{num(l.ticks)} tur</span>
                <code className="ml-auto max-w-[40%] truncate text-[11px] text-muted">
                  {JSON.stringify(l.detail)}
                </code>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── 2. KUYRUKLAR ────────────────────────────────────────────────────── */}
      <Panel title="Kuyruklar" right={health ? `${num(health.outbox.total)} outbox satırı` : '…'}>
        {!health ? null : (
          <div className="space-y-2 p-3">
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="text-muted">bekleyen <strong className="text-ink">{num(health.outbox.pending)}</strong></span>
              <span className="text-muted">yeniden deneniyor <strong className="text-ink">{num(health.outbox.retrying)}</strong></span>
              <span className={health.outbox.dead > 0 ? 'text-danger' : 'text-muted'}>
                ölü mektup <strong>{num(health.outbox.dead)}</strong>
              </span>
              <span className="text-muted">en eski bekleyen <strong className="text-ink">{dur(health.outbox.oldestPendingS)}</strong></span>
            </div>
            {health.outbox.deadTopics.length > 0 ? (
              <div className="space-y-1 rounded-[var(--radius-sm)] border border-danger bg-danger/10 p-2">
                {/* ⭐ "10 satır bekliyor" eyleme dönüşmez; "hepsi mail:send" doğrudan
                    Resend anahtarını işaret eder. Bu yüzden konu kırılımı burada. */}
                {health.outbox.deadTopics.map((t) => (
                  <p key={t.topic} className="text-[11px] text-danger">
                    <strong>{t.topic}</strong> × {t.count}
                    {t.lastError ? ` — ${t.lastError}` : ''}
                  </p>
                ))}
              </div>
            ) : null}

            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1">dünya</th><th>durum</th><th>bekleyen</th>
                  <th>çalışan</th><th>başarısız</th><th>gecikme</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {health.worlds.map((w) => (
                  <tr key={w.worldId} className="border-t border-border">
                    <td className="py-1">{w.name} <span className="text-muted">#{w.worldId}</span></td>
                    <td>{w.state === 'running' ? 'çalışıyor' : w.state}</td>
                    <td>{num(w.scheduled)}</td>
                    <td>{num(w.running)}</td>
                    <td className={w.failed > 0 ? 'text-danger' : ''}>{num(w.failed)}</td>
                    {/* ⚠️ Gecikme OYUN saatinde: bakımdaki dünya «saatlerce geride» görünmemeli. */}
                    <td className={(w.lagS ?? 0) > 60 ? 'text-warning' : ''}>{dur(w.lagS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── 3. BAĞLANTI HAVUZU ──────────────────────────────────────────────── */}
      <Panel title="Bağlantı havuzu" right={health ? `${health.pool.total}/${health.pool.maxConnections}` : '…'}>
        {!health ? null : (
          <div className="flex flex-wrap gap-4 p-3 text-xs">
            <span className="text-muted">etkin <strong className="text-ink">{health.pool.active}</strong></span>
            <span className="text-muted">boşta <strong className="text-ink">{health.pool.idle}</strong></span>
            {/* ⭐ «idle in transaction» tek başına bir arıza belirtisi: açık kalmış bir
                transaction vacuum'u durdurur ve tabloyu şişirir. */}
            <span className={health.pool.idleInTx > 0 ? 'text-warning' : 'text-muted'}>
              transaction'da boşta <strong>{health.pool.idleInTx}</strong>
            </span>
            <span className="text-muted">en uzun transaction <strong className="text-ink">{dur(health.pool.oldestTxS)}</strong></span>
          </div>
        )}
      </Panel>

      {/* ── 4. TEMİZLİK ─────────────────────────────────────────────────────── */}
      <Panel title="Temizlik görevleri" right="önce kuru koşu, sonra onay">
        {!jobs ? <p className="p-3 text-xs text-muted">Yükleniyor…</p> : (
          <div className="divide-y divide-border">
            {jobs.map((j) => (
              <div key={j.id} className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink">{j.label}</span>
                  <code className="text-[11px] text-muted">{j.table}</code>
                  <Badge tone={j.matched > 0 ? 'warning' : 'muted'}>
                    {num(j.matched)} / {num(j.tableRows)} satır
                  </Badge>
                  {j.oldest ? (
                    <span className="text-[11px] text-muted">
                      en eskisi {new Date(j.oldest).toLocaleDateString('tr-TR')}
                    </span>
                  ) : null}
                  <span className="ml-auto flex gap-2">
                    {confirming === j.id ? (
                      <>
                        {/* İkinci adım: silme burada. Ayrı düğme, ayrı renk. */}
                        <Button
                          variant="danger" disabled={busy === j.id}
                          onClick={() => void run(j, true)}
                        >
                          {busy === j.id ? 'siliniyor…' : `${num(j.matched)} satırı SİL`}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>vazgeç</Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost" disabled={j.matched === 0}
                        onClick={() => setConfirming(j.id)}
                      >
                        {j.matched === 0 ? 'temiz' : 'temizle…'}
                      </Button>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-muted">{j.description}</p>
                {/* ⭐ Ekranın en önemli satırı: NE SİLİNMEDİĞİ. Karar tuzağı bilerek alınmalı. */}
                <p className="text-[11px] text-ink">🛡 {j.keeps}</p>
                <p className="text-[11px] text-muted">Ayarlar: <code>{j.settings.join(' · ')}</code></p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── 5. BOYUTLAR ─────────────────────────────────────────────────────── */}
      <Panel
        title="Tablo ve indeks boyutları"
        right={sizes ? `veri tabanı ${bytes(sizes.databaseBytes)}` : '…'}
      >
        {!sizes ? <p className="p-3 text-xs text-muted">Yükleniyor…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1 pl-3">tablo</th><th>toplam</th><th>veri</th>
                  <th>indeks</th><th>#</th><th>satır (tahmin)</th><th className="pr-3">ölü satır</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {sizes.tables.slice(0, 25).map((t) => (
                  <tr key={t.table} className="border-t border-border">
                    <td className="py-1 pl-3">{t.table}</td>
                    <td>{bytes(t.totalBytes)}</td>
                    <td>{bytes(t.tableBytes)}</td>
                    {/* İndeks veriden büyükse bu bir sinyal: fazla ya da yanlış indeks. */}
                    <td className={t.indexBytes > t.tableBytes ? 'text-warning' : ''}>
                      {bytes(t.indexBytes)}
                    </td>
                    <td className="text-muted">{t.indexCount}</td>
                    {/* ⚠️ TAHMİN (`reltuples`) — hiç ANALYZE görmemiş tabloda «bilinmiyor». */}
                    <td>{t.estRows == null ? <span className="text-muted">bilinmiyor</span> : num(t.estRows)}</td>
                    <td className="pr-3 text-muted">{num(t.deadRows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── 6. YAVAŞ SORGULAR ───────────────────────────────────────────────── */}
      <Panel title="En pahalı sorgular" right={slow?.available ? 'pg_stat_statements' : 'eklenti yok'}>
        {!slow ? <p className="p-3 text-xs text-muted">Yükleniyor…</p> : !slow.available ? (
          <div className="space-y-1 p-3">
            {/* ⚠️ Eklenti yokluğu bir HATA DEĞİL: panelin geri kalanı çalışmaya devam ediyor. */}
            <p className="text-xs text-muted">{slow.reason}</p>
            {slow.howTo ? <code className="block text-[11px] text-muted">{slow.howTo}</code> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1 pl-3">sorgu</th><th>çağrı</th><th>toplam</th><th className="pr-3">ortalama</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {slow.queries.map((q, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="py-1 pl-3"><code className="text-[11px]">{q.query}</code></td>
                    <td>{num(q.calls)}</td>
                    <td>{num(q.totalMs)} ms</td>
                    <td className="pr-3">{q.meanMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
