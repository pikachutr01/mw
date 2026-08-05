/**
 * ⭐ GÖREVLER — sunucuda o an açık olan HER görev, tek tabloda (kullanıcı, `ek_bilgiler`).
 *
 * ⚠️ **Oyuncu künyesindeki hareket listesinin kopyası değil.** Orada merkez bir oyuncu var ve
 * satırlar ona göre "giden/gelen" diye bölünüyor. Burada merkez yok; bu yüzden her satır kaynak
 * ve hedef şehrin **sahibini** de yazıyor — yoksa "kim kime saldırıyor" sorusu cevapsız kalır.
 *
 * ⚠️ Geri sayım **sunucunun döndürdüğü oyun saatinden** başlıyor, tarayıcı saatinden değil:
 * dünya duraklatılmışsa oyun saati de durur ve tablo doğru kalır.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatGameTime } from '@mobilwar/contracts';
import { api } from '../lib/api.ts';
import {
  Badge, DataTable, ErrorBox, Info, Loading, Pagination, Panel, SearchInput, Select,
} from '../components/ui.tsx';

interface MissionRow {
  id: number; type: string; status: string;
  executeAt: string; createdAt: string;
  owner: string | null; ownerPlayerId: number | null;
  origin: string | null; originCoord: string | null; originOwner: string | null;
  target: string | null; targetCoord: string | null; targetOwner: string | null;
  units: string[]; heroes: string[];
  cargo: { gold: number; food: number } | null;
}
interface Payload {
  total: number; page: number; pageSize: number; gameNow: string; items: MissionRow[];
}

/** Görev tipi → Türkçe. Ekranda ham `id` görünmez (§13.14). */
const TYPE_TR: Record<string, string> = {
  attack: 'Saldırı', spy: 'Casusluk', transport: 'Nakliye', support: 'Destek',
  found_city: 'Şehir kurma', teleport: 'Teleport', return: 'Dönüş',
  cave_withdraw: 'Mağaradan çıkış', cave_return: 'Mağaradan kaçış',
  ranking_snapshot: 'Sıralama anlık görüntüsü', abuse_scan: 'Kötüye kullanım taraması',
};
const typeTr = (t: string): string => TYPE_TR[t] ?? t;

/** Süzgeç listesi oyuncu görevleriyle sınırlı; bakım görevleri ayrı bir soru. */
const FILTERS = ['attack', 'spy', 'transport', 'support', 'found_city', 'teleport', 'return'];

function remaining(iso: string, now: number): string {
  const left = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (left === 0) return 'vadesi geçti';
  return h > 0 ? `${h}s ${m}dk` : m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
}

/** «şehir (sahibi)» — biri eksikse tire. */
function Place({ name, coord, owner }: {
  name: string | null; coord: string | null; owner: string | null;
}) {
  if (!name && !coord) return <span className="text-muted">—</span>;
  return (
    <span>
      <span className="text-ink">{name ?? 'boş koordinat'}</span>
      {coord ? <span className="tnum ml-1 text-muted">{coord}</span> : null}
      {owner ? <span className="block text-[10px] text-muted">{owner}</span> : null}
    </span>
  );
}

export function MissionsScreen({ worldId }: { worldId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const p = new URLSearchParams({
        worldId: String(worldId), page: String(page), pageSize: String(pageSize),
      });
      if (type) p.set('type', type);
      if (q.trim().length >= 2) p.set('q', q.trim());
      setData(await api<Payload>(`/api/v1/admin/missions?${p}`));
    } catch (err) {
      setError(err);
    }
  }, [worldId, page, pageSize, type, q]);

  useEffect(() => { void load(); }, [load]);

  /**
   * ⚠️ Saniyelik `tick` yalnız GERİ SAYIMI tazeliyor, veriyi değil. Her saniye sunucuya
   * gitmek bu tabloyu panelin en pahalı sayfası yapardı; liste 20 saniyede bir yenileniyor.
   */
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const r = setInterval(() => { void load(); }, 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [load]);

  /**
   * Geri sayımın çıpası: sunucunun oyun saati + o yanıttan beri geçen süre.
   * ⚠️ `tick` bilerek bağımlılık: değişmesi bu değeri yeniden hesaplatıyor.
   */
  const now = useMemo(() => {
    void tick;
    return data ? new Date(data.gameNow).getTime() + (Date.now() - fetchedAt(data)) : Date.now();
  }, [data, tick]);

  if (!data && !error) return <Panel title="Görevler"><Loading /></Panel>;

  return (
    <Panel
      title="Görevler"
      right={data ? `${data.total.toLocaleString('tr-TR')} açık görev` : undefined}
    >
      <div className="flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[12rem] flex-1">
          <SearchInput
            value={q}
            onChange={(v) => { setQ(v); setPage(0); }}
            placeholder="Oyuncu veya şehir adı…"
          />
        </div>
        <Select
          className="w-auto"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(0); }}
        >
          <option value="">Tüm tipler</option>
          {FILTERS.map((t) => <option key={t} value={t}>{typeTr(t)}</option>)}
        </Select>
        <Select
          className="w-auto"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
        >
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} satır</option>)}
        </Select>
        <Info label="tablo hakkında">
          Yalnız <b>açık</b> görevler (bekleyen ve çalışan). Tamamlananlar burada görünmez.
          <br /><br />
          Sayfalama <b>sunucu taraflı</b>: her sayfa ayrı bir sorgu, tüm liste tarayıcıya
          taşınmıyor. Geri sayım <b>oyun saatinden</b> hesaplanıyor, dünya duraklatılmışsa
          durur. Liste 20 saniyede bir kendini yeniler.
        </Info>
      </div>

      <ErrorBox error={error} />

      {data ? (
        <>
          <DataTable
            rows={data.items}
            keyOf={(r) => r.id}
            empty="Şu anda açık görev yok."
            columns={[
              {
                key: 'type',
                label: 'Görev',
                render: (r) => (
                  <span>
                    <span className="text-ink">{typeTr(r.type)}</span>
                    {r.status === 'running'
                      ? <Badge tone="warning">çalışıyor</Badge>
                      : null}
                  </span>
                ),
              },
              {
                key: 'owner',
                label: 'Sahibi',
                render: (r) => (r.ownerPlayerId ? (
                  <Link className="text-accent hover:underline" to={`/oyuncular/${r.ownerPlayerId}`}>
                    {r.owner ?? r.ownerPlayerId}
                  </Link>
                ) : <span className="text-muted">sistem</span>),
              },
              {
                key: 'from',
                label: 'Kaynak',
                render: (r) => <Place name={r.origin} coord={r.originCoord} owner={r.originOwner} />,
              },
              {
                key: 'to',
                label: 'Hedef',
                render: (r) => <Place name={r.target} coord={r.targetCoord} owner={r.targetOwner} />,
              },
              {
                key: 'content',
                label: 'İçerik',
                render: (r) => (
                  <span className="text-[11px]">
                    {r.units.length > 0 ? r.units.join(' · ') : <span className="text-muted">—</span>}
                    {r.heroes.length > 0 ? (
                      <span className="block text-accent">{r.heroes.join(' · ')}</span>
                    ) : null}
                    {/* ⚠️ Sıfır olan kaynak YAZILMIYOR: "900 altın · 0 yemek" satırın yarısını
                        hiçbir şey söylemeyen bir sayıya harcıyordu. */}
                    {r.cargo ? (
                      <span className="tnum block text-muted">
                        {[
                          r.cargo.gold > 0 ? `${r.cargo.gold.toLocaleString('tr-TR')} altın` : null,
                          r.cargo.food > 0 ? `${r.cargo.food.toLocaleString('tr-TR')} yemek` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'left',
                label: 'Kalan',
                align: 'right',
                render: (r) => (
                  <span className="tnum">
                    {remaining(r.executeAt, now)}
                    <span className="block text-[10px] text-muted">
                      {formatGameTime(r.executeAt)}
                    </span>
                  </span>
                ),
              },
            ]}
          />
          <Pagination
            page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}
          />
        </>
      ) : null}
    </Panel>
  );
}

/**
 * Yanıtın alındığı an. `Payload`da taşınmıyor; ilk okunduğunda işaretlenip saklanıyor —
 * geri sayımın "sunucu saati + o zamandan beri geçen süre" olarak akması için gerekli.
 */
const fetchedAtMap = new WeakMap<Payload, number>();
function fetchedAt(p: Payload): number {
  const hit = fetchedAtMap.get(p);
  if (hit != null) return hit;
  const now = Date.now();
  fetchedAtMap.set(p, now);
  return now;
}
