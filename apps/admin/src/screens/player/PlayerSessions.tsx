/**
 * Oyuncunun aktif cihazları — zincir başına tek satır.
 *
 * ⭐ Yeni olan: **tek cihazı düşürme**. `AuthService.revokeChain` Faz 3'ten beri hazırdı ama
 * admin tarafında yalnız "hepsini düşür" vardı; destek çağrısında *"şu bilinmeyen telefonu at"*
 * demenin yolu, oyuncunun tüm oturumlarını kapatmaktan geçiyordu.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { needsStepUp } from '../../lib/admin.ts';
import { Badge, Button, ErrorBox, Panel } from '../../components/ui.tsx';
import { stamp, when } from '../../lib/format.ts';

interface SessionRow {
  chainId: string; platform: string | null; deviceModel: string | null;
  osVersion: string | null; appVersion: string | null;
  ip: string | null; userAgent: string | null;
  lastSeenAt: string; firstSeenAt: string; expiresAt: string; current: boolean;
}

export function PlayerSessions({ playerId, name, onNeedStepUp }: {
  playerId: number; name: string; onNeedStepUp: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  /** ⚠️ Onay adımı: eskiden "tüm oturumları düşür" tek tıkla, onaysız çalışıyordu. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['sessions', playerId],
    queryFn: () => api<{ items: SessionRow[] }>(`/api/v1/admin/players/${playerId}/sessions`),
  });

  const revoke = useMutation({
    mutationFn: (chainId: string | null) => api<{ revoked: number; sockets: number }>(
      chainId == null
        ? `/api/v1/admin/players/${playerId}/revoke-sessions`
        : `/api/v1/admin/players/${playerId}/sessions/${chainId}/revoke`,
      { method: 'POST' },
    ),
    onSuccess: (r) => {
      setError(null);
      setNote(`${r.revoked} oturum düşürüldü · ${r.sockets} açık bağlantı anında kapatıldı.`);
      void qc.invalidateQueries({ queryKey: ['sessions', playerId] });
    },
    onError: (err) => {
      setNote(null);
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    },
    onSettled: () => setConfirming(null),
  });

  const items = q.data?.items ?? [];

  return (
    <Panel title={`${name} · aktif cihazlar`} right={`${items.length} cihaz`}>
      <div className="space-y-2 p-3">
        <ErrorBox error={error} />
        {note ? <p className="text-xs text-success">{note}</p> : null}
        <p className="text-[11px] text-muted">
          Bir satır = bir <b>cihaz</b> (oturum zinciri). Token her ~15 dakikada yenilenip yeni
          satır açar ama zincir aynı kalır; bu yüzden liste yenilemelerle şişmez.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted">Aktif oturum yok.</li>
        ) : null}
        {items.map((s) => (
          <li key={s.chainId} className="space-y-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">
                {s.platform ?? 'bilinmiyor'}
                {s.deviceModel ? ` · ${s.deviceModel}` : ''}
              </span>
              {s.osVersion ? <Badge>{s.osVersion}</Badge> : null}
              {s.appVersion ? <Badge>v{s.appVersion}</Badge> : null}
              <span className="ml-auto flex gap-2">
                {confirming === s.chainId ? (
                  <>
                    <Button
                      variant="danger" disabled={revoke.isPending}
                      onClick={() => revoke.mutate(s.chainId)}
                    >
                      {revoke.isPending ? 'düşürülüyor…' : 'Bu cihazı çıkar'}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>vazgeç</Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirming(s.chainId)}>çıkar…</Button>
                )}
              </span>
            </div>
            <div className="tnum text-[11px] text-muted">
              {s.ip ?? '—'} · ilk <span title={stamp(s.firstSeenAt)}>{when(s.firstSeenAt)}</span>
              {' · son '}<span title={stamp(s.lastSeenAt)}>{when(s.lastSeenAt)}</span>
            </div>
            {s.userAgent ? (
              <div className="truncate text-[11px] text-muted" title={s.userAgent}>{s.userAgent}</div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <p className="text-[11px] text-muted">
          Hepsini düşürmek oyuncuyu her cihazından çıkarır; yeniden giriş yapması gerekir.
        </p>
        <span className="ml-auto flex gap-2">
          {confirming === 'ALL' ? (
            <>
              <Button
                variant="danger" disabled={revoke.isPending}
                onClick={() => revoke.mutate(null)}
              >
                {revoke.isPending ? 'düşürülüyor…' : `${items.length} cihazın HEPSİNİ çıkar`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>vazgeç</Button>
            </>
          ) : (
            <Button
              variant="danger" disabled={items.length === 0}
              onClick={() => setConfirming('ALL')}
            >
              Tüm oturumları düşür…
            </Button>
          )}
        </span>
      </div>
    </Panel>
  );
}
