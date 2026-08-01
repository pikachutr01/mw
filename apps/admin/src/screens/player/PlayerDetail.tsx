/**
 * Bir oyuncunun her şeyi — üç alt sekme: **Künye · İmparatorluk · Oturumlar**.
 *
 * ⚠️ Alt sekme durumu da URL'de (`/oyuncular/12/imparatorluk`): destek konuşmasında
 * *"şu oyuncunun ordusuna bak"* linki paylaşılabilsin diye. `useState` ile tutsaydık
 * link her zaman künyeye açılırdı.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.ts';
import { ErrorBox, Panel } from '../../components/ui.tsx';
import { PlayerDossier, type Dossier } from '../Moderation.tsx';
import { EmpireView, type Empire } from './Empire.tsx';
import { PlayerSessions } from './PlayerSessions.tsx';

const TABS: [string, string][] = [
  ['kunye', 'Künye'], ['imparatorluk', 'İmparatorluk'], ['oturumlar', 'Oturumlar'],
];

export function PlayerDetail({ playerId, onNeedStepUp }: {
  playerId: number; onNeedStepUp: () => void;
}) {
  const { tab = 'kunye' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const empire = useQuery({
    queryKey: ['empire', playerId],
    queryFn: () => api<Empire>(`/api/v1/admin/players/${playerId}/empire`),
  });
  /**
   * ⚠️ Künye AYRI bir uçtan geliyor (`/admin/players/:id`) — imparatorluk ucuyla
   * birleştirmedik: künye cihaz/IP paylaşımı ve şikayet sayaçlarını taşıyor ve o sorgular
   * `player_devices`/`player_ips` üzerinde ağır. "Ordulara bak" diyen her tıklamada
   * onları da çalıştırmanın karşılığı yok.
   */
  const dossier = useQuery({
    queryKey: ['dossier', playerId],
    queryFn: () => api<Dossier>(`/api/v1/admin/players/${playerId}`),
    enabled: tab === 'kunye',
  });

  const name = empire.data?.player.username ?? dossier.data?.player.username ?? '…';

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {TABS.map(([id, label]) => (
          <button
            key={id} type="button"
            onClick={() => navigate(`/oyuncular/${playerId}/${id}`)}
            className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs ${
              tab === id
                ? 'border-strong bg-accent text-on-accent'
                : 'border-border bg-surface text-muted hover:bg-raised'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorBox error={empire.error ?? dossier.error} />

      {tab === 'kunye' ? (
        dossier.data
          ? (
            <PlayerDossier
              data={dossier.data}
              onChanged={() => {
                void qc.invalidateQueries({ queryKey: ['dossier', playerId] });
                void qc.invalidateQueries({ queryKey: ['players'] });
              }}
              onNeedStepUp={onNeedStepUp}
            />
          )
          : <Panel title={`${name} · künye`}><p className="p-3 text-xs text-muted">Yükleniyor…</p></Panel>
      ) : null}

      {tab === 'imparatorluk' ? (
        empire.data
          ? <EmpireView data={empire.data} />
          : <Panel title="İmparatorluk"><p className="p-3 text-xs text-muted">Yükleniyor…</p></Panel>
      ) : null}

      {tab === 'oturumlar' ? (
        <PlayerSessions playerId={playerId} name={name} onNeedStepUp={onNeedStepUp} />
      ) : null}
    </div>
  );
}
