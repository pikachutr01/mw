/**
 * ⭐ OYUNCULAR (panel 2. nesil, Tur 1) — panelin yeni giriş kapısı.
 *
 * Öncesinde oyuncu verisi **üç sekmeye dağılmıştı**: arama Oturumlar'da, künye Moderasyon'da,
 * ordular/teknikler Veri tabanı'nda. "Bu oyuncuda ne oluyor?" sorusunun cevabı üç ekran
 * gezmeyi ve şehir kimliğini elle taşımayı gerektiriyordu.
 *
 * ⚠️ **Liste sunucu taraflı**: arama, filtre ve sayfalama SQL'e iniyor. İstemcide filtrelemek
 * bugün 50 oyuncuyla çalışırdı ama panelin ömrü oyununkiyle aynı — 5.000 oyuncuda tüm tabloyu
 * tarayıcıya indirmek olurdu.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { num, stamp, when } from '../lib/format.ts';
import { Badge, Button, ErrorBox, Input, Panel } from '../components/ui.tsx';
import { PlayerDetail } from './player/PlayerDetail.tsx';

export interface PlayerRow {
  id: number; username: string; worldId: number; email: string; role: string;
  score: number; cities: number; alliance: string | null;
  online: boolean | null; lastSeenAt: string | null; createdAt: string | null;
  banned: boolean; banUntil: string | null; banMode: string | null;
  protectedUntil: string | null; vacationUntil: string | null;
}
interface ListPayload {
  page: number; pageSize: number; total: number;
  onlineKnown: boolean; onlineCount: number;
  items: PlayerRow[];
}

const STATUS: [string, string][] = [
  ['all', 'Hepsi'], ['online', 'Çevrimiçi'], ['recent', 'Son 7 gün'], ['idle', 'Uzun süredir yok'],
];

export function PlayersScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);

  const list = useQuery({
    queryKey: ['players', q, status, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), status });
      if (q.trim()) p.set('q', q.trim());
      return api<ListPayload>(`/api/v1/admin/players?${p}`);
    },
    /** Aramada her tuş vuruşunda istek gitmesin; React Query anahtarı zaten önbelleğe alıyor. */
    placeholderData: (prev) => prev,
  });

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <Panel
        title="Oyuncular"
        right={data
          ? `${num(data.total)} oyuncu${data.onlineKnown ? ` · ${data.onlineCount} çevrimiçi` : ''}`
          : '…'}
      >
        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs" placeholder="Kullanıcı adı veya e-posta…"
              value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
            />
            <div className="flex gap-1">
              {STATUS.map(([id, label]) => (
                <button
                  key={id} type="button"
                  onClick={() => { setStatus(id); setPage(0); }}
                  className={`rounded-[var(--radius-sm)] border px-2 py-1 text-xs ${
                    status === id
                      ? 'border-strong bg-accent text-on-accent'
                      : 'border-border bg-surface text-muted hover:bg-raised'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {list.isFetching ? <span className="text-xs text-muted">yükleniyor…</span> : null}
          </div>
          {/*
            ⚠️ Çevrimiçilik SÜREÇ-YEREL. Sunucu `onlineKnown: false` derse nokta hiç
            çizilmiyor — "herkes çevrimdışı" göstermek, bilgisizlikten kötü bir yalan olurdu.
          */}
          {data && !data.onlineKnown ? (
            <p className="text-[11px] text-warning">
              ⚠️ Çevrimiçilik bilgisi yok (soket sunucusu bu süreçte kayıtlı değil) — noktalar
              çizilmiyor.
            </p>
          ) : null}
        </div>

        <ErrorBox error={list.error} />

        <ul className="divide-y divide-border">
          {data?.items.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Eşleşme yok.</li>
          ) : null}
          {data?.items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate(`/oyuncular/${p.id}`)}
                className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left
                  hover:bg-raised ${String(p.id) === playerId ? 'bg-raised' : ''}`}
              >
                {p.online == null
                  ? null
                  : <span className={`inline-block size-2 rounded-full ${
                    p.online ? 'bg-success' : 'bg-border'}`} />}
                <span className="text-sm text-ink">{p.username}</span>
                {p.role !== 'player' ? <Badge tone="success">{p.role}</Badge> : null}
                {p.banned ? <Badge tone="danger">cezalı</Badge> : null}
                {p.protectedUntil && new Date(p.protectedUntil) > new Date()
                  ? <Badge tone="warning">korumalı</Badge> : null}
                {p.vacationUntil && new Date(p.vacationUntil) > new Date()
                  ? <Badge tone="warning">tatilde</Badge> : null}
                <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <span>D{p.worldId}</span>
                  <span className="tnum">{num(p.score)} puan</span>
                  <span className="tnum">{p.cities} şehir</span>
                  {p.alliance ? <span>{p.alliance}</span> : null}
                  <span title={stamp(p.lastSeenAt)}>{when(p.lastSeenAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {data && data.total > data.pageSize ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-xs text-muted">
              {num(page * data.pageSize + 1)}–{num(Math.min((page + 1) * data.pageSize, data.total))}
              {' / '}{num(data.total)}
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                ‹ önceki
              </Button>
              <Button
                variant="ghost" disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                sonraki ›
              </Button>
            </span>
          </div>
        ) : null}
      </Panel>

      {playerId ? (
        <PlayerDetail playerId={Number(playerId)} onNeedStepUp={onNeedStepUp} />
      ) : (
        <p className="px-1 text-xs text-muted">
          Künyesini görmek için bir oyuncu seç. Şehirler, ordular, mağara, savunma, teknikler,
          kahramanlar ve aktif hareketler tek ekranda gelir.
        </p>
      )}
    </div>
  );
}
