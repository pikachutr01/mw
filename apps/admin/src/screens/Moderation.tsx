/**
 * ⭐ MODERASYON EKRANI (Faz 6) — şikayet kuyruğu + oyuncu künyesi + sohbet yasağı.
 *
 * ⚠️ **Otomatik ceza YOK** (§9.1.1). Cihaz/IP paylaşım sayıları ekranda görünür ama hiçbiri
 * kendiliğinden ban üretmez; aynı cihazdan iki hesaba girmek tek başına suç değil (ev, iş,
 * internet kafe). Sayı bilgi, karar insanın.
 *
 * ⚠️ Şikayeti KAPATMAK ile CEZA VERMEK ayrı iki işlem ve ayrı iki audit satırı. Tek düğmede
 * birleştirseydik geçmişte hangisinin olduğu ayırt edilemezdi.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Badge, Button, ErrorBox, Field, Input, Panel } from '../components/ui.tsx';

interface Report {
  id: number;
  reason: string;
  note: string | null;
  body: string | null;
  reporter: string | null;
  reported: string | null;
  reportedPlayerId: number;
  totalAgainst: number;
  currentlyBanned: boolean;
  status: string;
  createdAt: string;
}

interface Dossier {
  player: {
    id: number; username: string; worldId: number; score: number;
    createdAt: string; lastSeenAt: string | null; bannedAt: string | null; alliance: string | null;
  };
  account: {
    id: number; email: string; role: string; emailVerified: boolean;
    lockedUntil: string | null; failedLogins: number; createdAt: string;
  };
  cities: { id: number; name: string; coordinates: string; isCapital: boolean }[];
  chatBan: { id: number; until: string | null; reason: string | null; createdAt: string } | null;
  /** ⚠️ `active` sunucudan geliyor: süresi geçmiş kayıt duruyor olabilir, karar tek yerde. */
  ban: { until: string | null; mode: string; reason: string | null; active: boolean } | null;
  reports: { against: number; filed: number };
  devices: { deviceId: string; platform: string | null; lastSeen: string; sharedWith: number }[];
  ips: { ip: string; lastSeen: string; sharedWith: number }[];
}

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam', abuse: 'Hakaret', scam: 'Dolandırıcılık', cheating: 'Hile', other: 'Diğer',
};

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('tr-TR') : '—');

export function ModerationScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadReports = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const r = await api<{ items: Report[] }>(
        `/api/v1/admin/reports?status=${openOnly ? 'open' : 'all'}`);
      setReports(r.items);
    } catch (err) {
      setError(err);
    }
  }, [openOnly]);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const openDossier = useCallback(async (playerId: number): Promise<void> => {
    setError(null);
    try {
      setDossier(await api<Dossier>(`/api/v1/admin/players/${playerId}`));
    } catch (err) {
      setError(err);
    }
  }, []);

  const resolve = async (id: number, action: string): Promise<void> => {
    setError(null); setNote(null);
    try {
      await api(`/api/v1/admin/reports/${id}/resolve`, { method: 'POST', body: { action } });
      setNote('Şikayet kapatıldı.');
      await loadReports();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    }
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Şikayet kuyruğu"
        right={
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--mw-color-accent)]" />
            yalnız açık
          </label>
        }
      >
        {note ? <p className="px-3 pt-2 text-xs text-success">{note}</p> : null}
        <ErrorBox error={error} />
        <ul className="divide-y divide-border">
          {(reports ?? []).map((r) => (
            <li key={r.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.reason === 'abuse' || r.reason === 'scam' ? 'danger' : 'muted'}>
                  {REASON_LABEL[r.reason] ?? r.reason}
                </Badge>
                <button type="button" className="text-sm text-ink underline"
                  onClick={() => void openDossier(r.reportedPlayerId)}>
                  {r.reported ?? `#${r.reportedPlayerId}`}
                </button>
                <span className="text-[11px] text-muted">← {r.reporter ?? 'silinmiş'}</span>
                {r.totalAgainst > 1 ? (
                  <Badge tone="warning">{r.totalAgainst} şikayet</Badge>
                ) : null}
                {r.currentlyBanned ? <Badge tone="danger">yasaklı</Badge> : null}
                {r.status !== 'open' ? <Badge tone="success">{r.status}</Badge> : null}
              </div>
              {/* ⚠️ Gösterilen metin şikayet ANINDAKİ kopya (`body_snapshot`), canlı mesaj
                  değil: şikayet edilen mesajı silerek kanıtı yok edemesin. */}
              {r.body ? (
                <p className="mt-1 rounded-[var(--radius-sm)] border border-border bg-surface
                  px-2 py-1.5 text-xs text-ink">
                  «{r.body}»
                </p>
              ) : null}
              {r.note ? <p className="mt-1 text-[11px] text-muted">Not: {r.note}</p> : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted">{when(r.createdAt)}</span>
                {r.status === 'open' ? (
                  <>
                    <Button variant="ghost" onClick={() => void resolve(r.id, 'dismissed')}>
                      Haksız — kapat
                    </Button>
                    <Button variant="ghost" onClick={() => void resolve(r.id, 'reviewed')}>
                      Bakıldı
                    </Button>
                    <Button variant="ghost" onClick={() => void resolve(r.id, 'actioned')}>
                      İşlem yapıldı
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
          {reports?.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">
              {openOnly ? 'Açık şikayet yok.' : 'Hiç şikayet yok.'}
            </li>
          ) : null}
        </ul>
      </Panel>

      {dossier ? (
        <PlayerDossier
          data={dossier}
          onChanged={() => { void openDossier(dossier.player.id); void loadReports(); }}
          onNeedStepUp={onNeedStepUp}
        />
      ) : null}
    </div>
  );
}

/* ═══ Oyuncu künyesi ════════════════════════════════════════════════════════ */

function PlayerDossier({ data, onChanged, onNeedStepUp }: {
  data: Dossier; onChanged: () => void; onNeedStepUp: () => void;
}) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const call = async (path: string, body?: unknown): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      await api(`/api/v1/admin/players/${data.player.id}/${path}`, { method: 'POST', body: body ?? {} });
      setNote(path === 'chat-ban' ? 'Sohbet yasağı verildi.' : 'Yasak kaldırıldı.');
      setReason(''); setDays('');
      onChanged();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const d = Number(days);
  const ban = data.chatBan;

  return (
    <Panel
      title={`${data.player.username} · künye`}
      right={
        <span className="flex gap-1">
          {data.ban?.active ? (
            <Badge tone="danger">
              cezalı · {data.ban.mode === 'open' ? 'saldırıya açık' : 'saldırıya kapalı'}
            </Badge>
          ) : null}
          {ban ? <Badge tone="danger">sohbet yasaklı</Badge> : null}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-3 text-xs sm:grid-cols-4">
        <Stat label="Puan" value={data.player.score.toLocaleString('tr-TR')} />
        <Stat label="Şehir" value={String(data.cities.length)} />
        <Stat label="Katılım" value={when(data.player.createdAt)} />
        <Stat label="Son görülme" value={when(data.player.lastSeenAt)} />
        <Stat label="E-posta" value={data.account.email} />
        <Stat label="Doğrulanmış" value={data.account.emailVerified ? 'evet' : 'hayır'} />
        <Stat label="Hakkında şikayet" value={String(data.reports.against)} />
        <Stat label="Yaptığı şikayet" value={String(data.reports.filed)} />
      </dl>

      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        Şehirler: {data.cities.map((c) => `${c.name} (${c.coordinates})`).join(' · ') || '—'}
        {data.player.alliance ? ` · İttifak: ${data.player.alliance}` : ''}
      </div>

      {/* ⚠️ Paylaşım sayıları KAYIT, karar değil (§9.1.1). */}
      {data.devices.length > 0 || data.ips.length > 0 ? (
        <div className="border-t border-border px-3 py-2">
          <p className="mb-1 text-[11px] text-muted">
            ⚠️ Cihaz/IP paylaşımı tek başına suç değildir (ev, iş, internet kafe). Karar senin.
          </p>
          <ul className="space-y-0.5 font-mono text-[10px] text-muted">
            {data.devices.map((x) => (
              <li key={x.deviceId}>
                {x.platform ?? '?'} · {x.deviceId.slice(0, 8)} · son {when(x.lastSeen)}
                {x.sharedWith > 1 ? <b className="text-warning"> · {x.sharedWith} oyuncu</b> : null}
              </li>
            ))}
            {data.ips.map((x) => (
              <li key={x.ip}>
                {x.ip} · son {when(x.lastSeen)}
                {x.sharedWith > 1 ? <b className="text-warning"> · {x.sharedWith} oyuncu</b> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PlayerBanBox data={data} onChanged={onChanged} onNeedStepUp={onNeedStepUp} />

      <div className="border-t border-border px-3 py-3">
        <p className="mb-2 text-xs text-muted">
          <b className="text-ink">Sohbet yasağı.</b>{' '}
          {ban ? (
            <>
              Aktif — {ban.until ? `${when(ban.until)} tarihine kadar` : '<b>süresiz</b>'}.
              {ban.reason ? ` Sebep: ${ban.reason}` : ''}
            </>
          ) : (
            <>
              Yasaklı oyuncu <b>kimseye</b> mesaj yazamaz ve yeni konuşma açamaz, ama
              kendisine yazılanı <b>okumaya devam eder</b> — ceza sohbetten silinmek değil.
            </>
          )}
        </p>

        {ban ? (
          <>
            <ErrorBox error={error} />
            {note ? <p className="mb-2 text-xs text-success">{note}</p> : null}
            <Button disabled={busy} onClick={() => void call('chat-unban')}>
              {busy ? 'Kaldırılıyor…' : 'Yasağı kaldır'}
            </Button>
            {/* ⚠️ Kaldırma satırı SİLMEZ, süreyi geçmişe çeker: geçmiş kalıcı olmalı. */}
            <p className="mt-1 text-[11px] text-muted">
              Kayıt silinmez, yalnız süresi bitirilir — geçmiş moderasyon kararları kalıcıdır.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Field label="Sebep" hint="Oyuncuya gösterilir.">
                <Input type="text" maxLength={500} value={reason}
                  placeholder="ör. tekrarlayan spam"
                  onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Field label="Süre (gün)" hint="Boş = süresiz.">
                <Input type="number" min={1} max={3650} value={days} className="w-28 tnum text-right"
                  onChange={(e) => setDays(e.target.value)} />
              </Field>
            </div>
            <ErrorBox error={error} />
            {note ? <p className="mt-2 text-xs text-success">{note}</p> : null}
            <Button
              variant="danger"
              disabled={busy || reason.trim().length < 3}
              className="mt-2"
              onClick={() => void call('chat-ban', {
                reason: reason.trim(),
                ...(Number.isFinite(d) && d > 0 ? { days: Math.trunc(d) } : {}),
              })}
            >
              {busy ? 'Veriliyor…'
                : days ? `${Math.trunc(d)} gün yasakla` : 'Süresiz yasakla'}
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ═══ Oyuncu cezası ════════════════════════════════════════════════════════ */

/**
 * ⭐ OYUNCU CEZASI — oyuncu oyuna giremez; şehirlerine ne olacağı **kipe** bağlı.
 *
 * ⚠️ İki kip arasındaki fark ekranda AÇIKÇA yazıyor. Yalnız "ban" deyip geçseydik yönetici
 * hangi kipin ne yaptığını hatırlamak zorunda kalırdı ve yanlış seçim geri alınması zor bir
 * sonuç doğururdu: açık cezada şehirler yağmalanır, o kaynaklar geri gelmez.
 */
function PlayerBanBox({ data, onChanged, onNeedStepUp }: {
  data: Dossier; onChanged: () => void; onNeedStepUp: () => void;
}) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [mode, setMode] = useState<'open' | 'closed'>('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const d = Number(days);
  const hasDays = Number.isFinite(d) && d > 0;
  /**
   * ⚠️ Süresiz ceza **daima saldırıya açık** (kullanıcı kuralı; şema CHECK'i de zorluyor).
   * Ekran da böyle davranıyor: gün girilmediği an «kapalı» seçeneği kilitleniyor ve gerekçesi
   * yazıyor — sunucudan 400 yiyip "neden" diye düşünmek gerekmesin.
   */
  const effectiveMode = hasDays ? mode : 'open';
  const active = data.ban?.active === true;

  const call = async (path: string, body?: unknown): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ revokedSessions?: number; closedSockets?: number }>(
        `/api/v1/admin/players/${data.player.id}/${path}`, { method: 'POST', body: body ?? {} });
      setNote(path === 'ban'
        ? `Ceza verildi · ${r.revokedSessions ?? 0} oturum düşürüldü, `
          + `${r.closedSockets ?? 0} bağlantı kapatıldı.`
        : 'Ceza kaldırıldı.');
      setReason(''); setDays('');
      onChanged();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const MODES = [
    ['open', 'Saldırıya AÇIK',
      'Şehirleri savunmasız kalır ve herkes saldırabilir. ⚠️ Acemi korumasını ve tatil '
      + 'modunu da EZER. Kalıcı cezanın doğru kipi: hesap geri gelmeyecek.'],
    ['closed', 'Saldırıya KAPALI',
      'Şehirleri korunur; oyuncu döndüğünde imparatorluğunu bulur. Diğer oyuncular '
      + 'saldıramaz ve nakliye gönderemez, ama casus kuş atabilir.'],
  ] as const;

  return (
    <div className={`border-t border-border px-3 py-3 ${active ? 'bg-danger/10' : ''}`}>
      <p className="mb-2 text-xs text-muted">
        <b className="text-ink">Oyuncu cezası.</b>{' '}
        {active ? (
          <>
            Oyuncu <b>oyuna giremiyor</b>
            {data.ban?.until ? ` (${when(data.ban.until)} tarihine kadar)` : ' (süresiz)'}.
            {' '}Şehirleri{' '}
            {data.ban?.mode === 'open'
              ? <b className="text-warning">saldırıya AÇIK</b>
              : <b>korumada</b>}.
            {data.ban?.reason ? ` Sebep: ${data.ban.reason}` : ''}
          </>
        ) : (
          <>
            Cezalı oyuncu oyuna giremez, yani şehirlerini savunamaz. Kip, o şehirlere ne
            olacağını belirler.
          </>
        )}
      </p>

      {active ? (
        <>
          <ErrorBox error={error} />
          {note ? <p className="mb-2 text-xs text-success">{note}</p> : null}
          <Button disabled={busy} onClick={() => void call('unban')}>
            {busy ? 'Kaldırılıyor…' : 'Cezayı kaldır'}
          </Button>
        </>
      ) : (
        <>
          <div className="mb-2 grid gap-1.5">
            {MODES.map(([id, label, desc]) => (
              <label key={id}
                className={`flex cursor-pointer gap-2 rounded-[var(--radius-sm)] border p-2 ${
                  effectiveMode === id ? 'border-strong bg-raised' : 'border-border'
                } ${!hasDays && id === 'closed' ? 'opacity-50' : ''}`}>
                <input type="radio" name="ban-mode" className="mt-0.5 accent-[var(--mw-color-accent)]"
                  checked={effectiveMode === id}
                  disabled={!hasDays && id === 'closed'}
                  onChange={() => setMode(id)} />
                <span className="min-w-0">
                  <span className="text-sm text-ink">{label}</span>
                  <span className="block text-[11px] leading-snug text-muted">{desc}</span>
                </span>
              </label>
            ))}
          </div>
          {!hasDays ? (
            <p className="mb-2 text-[11px] text-warning">
              ⚠️ Gün girilmedi → ceza <b>süresiz</b> ve zorunlu olarak <b>saldırıya açık</b>.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Field label="Sebep" hint="Giriş denemesinde oyuncuya gösterilir.">
              <Input type="text" maxLength={500} value={reason}
                placeholder="ör. çoklu hesap kullanımı"
                onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label="Süre (gün)" hint="Boş = süresiz.">
              <Input type="number" min={1} max={3650} value={days} className="w-28 tnum text-right"
                onChange={(e) => setDays(e.target.value)} />
            </Field>
          </div>

          <ErrorBox error={error} />
          {note ? <p className="mt-2 text-xs text-success">{note}</p> : null}
          <Button
            variant="danger"
            disabled={busy || reason.trim().length < 3}
            className="mt-2"
            onClick={() => void call('ban', {
              reason: reason.trim(), mode: effectiveMode,
              ...(hasDays ? { days: Math.trunc(d) } : {}),
            })}
          >
            {busy ? 'Veriliyor…'
              : `${hasDays ? `${Math.trunc(d)} gün` : 'Süresiz'} ceza · `
                + `${effectiveMode === 'open' ? 'saldırıya açık' : 'saldırıya kapalı'}`}
          </Button>
          {/* ⚠️ Ceza oturumları da düşürür — oyuncu "girişim hâlâ açık" diye devam edememeli. */}
          <p className="mt-1 text-[11px] text-muted">
            Ceza verilince oyuncunun tüm oturumları düşer ve açık bağlantıları anında kapanır.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
}
