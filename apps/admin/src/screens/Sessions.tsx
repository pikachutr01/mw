/**
 * ⭐ OTURUMLAR EKRANI (Faz 3) — "hesabıma girilmiş olabilir mi?" sorusunun destek tarafı.
 *
 * ⚠️ Liste, oyuncunun kendi Seçenekler ekranında gördüğüyle **aynı servis metodundan** geliyor
 * (`AuthService.listSessions`). Admin için ayrı bir sorgu yazsaydık ikisi zamanla ayrışır ve
 * "oyuncu şunu görüyor, ben bunu görüyorum" tartışması çıkardı.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Badge, Button, ErrorBox, Input, Panel } from '../components/ui.tsx';

interface PlayerHit {
  id: number; username: string; worldId: number; email: string; role: string;
  lastSeenAt: string | null;
}

interface DeviceRow {
  chainId: string;
  platform: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
}

interface SessionsPayload {
  playerId: number; username: string; email: string; role: string; items: DeviceRow[];
}

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('tr-TR') : '—');

export function SessionsScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [selected, setSelected] = useState<SessionsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  /** ⚠️ 300 ms geciktirme: her tuşta sorgu atmak arama kutusunu yük üretecine çevirirdi. */
  useEffect(() => {
    if (query.trim().length < 2) { setHits(null); return; }
    const id = setTimeout(() => {
      void api<{ items: PlayerHit[] }>(`/api/v1/admin/players/lookup?q=${encodeURIComponent(query)}`)
        .then((r) => setHits(r.items))
        .catch(setError);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const open = useCallback(async (playerId: number): Promise<void> => {
    setError(null); setNote(null);
    try {
      setSelected(await api<SessionsPayload>(`/api/v1/admin/players/${playerId}/sessions`));
    } catch (err) {
      setError(err);
    }
  }, []);

  const revokeAll = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ revoked: number; sockets: number }>(
        `/api/v1/admin/players/${selected.playerId}/revoke-sessions`, { method: 'POST', body: {} });
      setNote(`${r.revoked} oturum düşürüldü · ${r.sockets} açık bağlantı anında kapatıldı.`);
      await open(selected.playerId);
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel title="Oyuncu ara">
        <div className="space-y-2 p-3">
          <Input type="text" value={query} placeholder="kullanıcı adı veya e-posta"
            onChange={(e) => setQuery(e.target.value)} />
          <ErrorBox error={error} />
          {hits ? (
            <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
              {hits.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => void open(p.id)}
                    className="flex w-full items-center justify-between gap-3 px-2.5 py-2
                      text-left hover:bg-raised">
                    <span className="text-sm text-ink">
                      {p.username}
                      {p.role !== 'player' ? <> <Badge tone="success">{p.role}</Badge></> : null}
                    </span>
                    <span className="text-[11px] text-muted">
                      D{p.worldId} · {p.email} · {when(p.lastSeenAt)}
                    </span>
                  </button>
                </li>
              ))}
              {hits.length === 0
                ? <li className="px-2.5 py-2 text-sm text-muted">Eşleşme yok.</li> : null}
            </ul>
          ) : null}
        </div>
      </Panel>

      {selected ? (
        <Panel
          title={`${selected.username} · aktif cihazlar`}
          right={<Badge>{selected.items.length}</Badge>}
        >
          <ul className="divide-y divide-border">
            {selected.items.map((d) => (
              <li key={d.chainId} className="px-3 py-2.5">
                <div className="text-sm text-ink">
                  {d.platform ?? 'bilinmiyor'}
                  {d.deviceModel ? ` · ${d.deviceModel}` : ''}
                  {d.appVersion ? ` · v${d.appVersion}` : ''}
                </div>
                <p className="mt-0.5 font-mono text-[10px] leading-snug text-muted">
                  {d.ip ?? 'ip yok'} · ilk {when(d.firstSeenAt)} · son {when(d.lastSeenAt)}
                </p>
                {d.userAgent
                  ? <p className="mt-0.5 truncate text-[10px] text-muted">{d.userAgent}</p> : null}
              </li>
            ))}
            {selected.items.length === 0
              ? <li className="px-3 py-3 text-sm text-muted">Aktif oturum yok.</li> : null}
          </ul>
          {note ? <p className="px-3 py-2 text-xs text-success">{note}</p> : null}
          <div className="border-t border-border px-3 py-2.5">
            {/* ⚠️ Metin ne olacağını AÇIKÇA söylüyor: bu düğme oyuncuyu her cihazından atar. */}
            <p className="mb-2 text-[11px] text-muted">
              Tüm oturumları düşürmek oyuncuyu <b>her cihazından</b> anında çıkarır; açık
              bağlantılar da kapanır. Oyuncu parolasıyla yeniden girebilir.
            </p>
            <Button variant="danger" disabled={busy || selected.items.length === 0}
              onClick={() => void revokeAll()}>
              {busy ? 'Düşürülüyor…' : 'Tüm oturumları düşür'}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
