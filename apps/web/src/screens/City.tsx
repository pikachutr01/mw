/**
 * ŞEHİR sekmesi — iç sekmeler: Yapılar · Baraka · Savunma · Akademi (§10).
 *
 * ⭐ Maliyet ve ön-şartlar **sunucudan** gelir (`/cities/:id/catalog`), istemci hesaplamaz.
 * Denge değiştiğinde arayüz kendiliğinden doğru olur — formül tek yerde yaşar.
 */
import { useState } from 'react';
import { fmt, remaining, useTick } from '../lib/hooks.ts';
import {
  useCancelQueue, useCatalog, useCity, useEnqueue,
  type CatalogUnit, type CityDetail, type QueueRow,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Badge, Button, Card, Empty, ErrorBox, Input, Requirements, SectionTitle } from '../components/ui.tsx';

type Tab = 'buildings' | 'units' | 'defenses' | 'techs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'buildings', label: 'Yapılar' },
  { id: 'units', label: 'Baraka' },
  { id: 'defenses', label: 'Savunma' },
  { id: 'techs', label: 'Akademi' },
];

export function City() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);
  const [tab, setTab] = useState<Tab>('buildings');

  if (!city.data || !catalog.data) return <Empty>Şehir yükleniyor…</Empty>;
  const d = city.data;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle right={`${d.coordinates.k}:${d.coordinates.d}:${d.coordinates.s}`}>
          {d.name}{d.isCapital ? ' · Başkent' : ''}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-xs">
          <Budget label="Kale bütçesi" used={d.capacity.castle.used} total={d.capacity.castle.total}
            hint="Σ(bina seviyeleri) ≤ Kale × 10" />
          <Budget label="Sur kapasitesi" used={d.capacity.defense.used} total={d.capacity.defense.total}
            hint="Savunma birimleri Alan kadar yer kaplar" />
        </div>
      </Card>

      <Queues city={d} />

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs ${
              tab === t.id ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:bg-raised'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'buildings' ? <Buildings city={d} /> : null}
      {tab === 'units' ? <Trainable city={d} kind="unit" /> : null}
      {tab === 'defenses' ? <Trainable city={d} kind="defense" /> : null}
      {tab === 'techs' ? <Techs city={d} /> : null}
    </div>
  );
}

function Budget({ label, used, total, hint }: { label: string; used: number; total: number; hint: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between text-muted">
        <span>{label}</span>
        <span className="tnum">{fmt(used)} / {fmt(total)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Açık kuyruklar — oyuncunun gördüğü geri sayımlar. Sunucu saatinden çizilir. */
function Queues({ city }: { city: CityDetail }) {
  useTick(city.queues.length > 0);
  const cancel = useCancelQueue();

  if (city.queues.length === 0) return null;
  return (
    <Card>
      <SectionTitle>Sürüyor</SectionTitle>
      <ul className="divide-y divide-border">
        {city.queues.map((q) => (
          <li key={q.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">{describeQueue(q)}</div>
              <div className="tnum text-xs text-muted">
                {remaining(q.finishAt) ?? 'birazdan biter…'}
              </div>
            </div>
            <Button size="sm" variant="danger" disabled={cancel.isPending}
              onClick={() => cancel.mutate(q.id)}>
              İptal
            </Button>
          </li>
        ))}
      </ul>
      <div className="px-3 pb-3 text-[11px] text-muted">
        İptal iadesi: yapı/teknik <b>süreye göre</b>, savaşçı <b>bir birim eksik</b>.
      </div>
    </Card>
  );
}

function describeQueue(q: QueueRow): string {
  if (q.count != null) return `${q.itemType} × ${fmt(q.count)}`;
  return `${q.itemType} → seviye ${q.targetLevel}`;
}

function Buildings({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const busy = city.queues.some((q) => q.category === 'building');

  return (
    <Card>
      <SectionTitle right={busy ? 'bir yapı sürüyor' : undefined}>Yapılar</SectionTitle>
      <ErrorBox error={enqueue.error} />
      <ul className="divide-y divide-border">
        {(catalog.data?.buildings ?? []).map((b) => {
          const maxed = b.level >= b.maxLevel;
          const cost = b.nextCost;
          const afford = !!cost && city.resources.gold >= cost.gold && city.resources.food >= cost.food;
          return (
            <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-ink">
                  {b.name} <span className="text-muted">sv {b.level}</span>
                  {maxed ? <Badge>tavan</Badge> : null}
                </div>
                {cost ? (
                  <div className="tnum text-xs text-muted">
                    🪙 {fmt(cost.gold)} · 🌾 {fmt(cost.food)}
                  </div>
                ) : null}
                <Requirements requirements={b.requirements} buildings={city.buildings} techs={city.techs} />
              </div>
              <Button size="sm" disabled={maxed || busy || !afford || enqueue.isPending}
                onClick={() => enqueue.mutate({ category: 'building', type: b.id })}>
                {maxed ? '—' : `sv ${b.level + 1}`}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Savaşçı ve savunma birimi üretimi aynı desendir; fark yalnız kategori ve adet kuralı. */
function Trainable({ city, kind }: { city: CityDetail; kind: 'unit' | 'defense' }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const busy = city.queues.some((q) => q.category === kind);
  const list: CatalogUnit[] = (kind === 'unit' ? catalog.data?.units : catalog.data?.defenses) ?? [];
  const have = kind === 'unit' ? city.units : city.defenses;

  return (
    <Card>
      <SectionTitle right={busy ? 'üretim sürüyor' : undefined}>
        {kind === 'unit' ? 'Baraka' : 'Savunma'}
      </SectionTitle>
      <ErrorBox error={enqueue.error} />
      <ul className="divide-y divide-border">
        {list.map((u) => {
          const n = Number(counts[u.id] ?? '') || 0;
          // Sur ve Büyü Kalkanı ADET değil SEVİYE ilerletir → adet kutusu gösterilmez.
          const levelBased = u.levelBased === true;
          const total = levelBased ? null : { gold: u.cost.gold * n, food: u.cost.food * n };
          const afford = !total
            || (city.resources.gold >= total.gold && city.resources.food >= total.food);
          return (
            <li key={u.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-ink">
                    {u.name} <span className="text-muted">· {fmt(have[u.id] ?? 0)} adet</span>
                  </div>
                  <div className="tnum text-xs text-muted">
                    🪙 {fmt(u.cost.gold)} · 🌾 {fmt(u.cost.food)} · alan {u.area}
                    {u.speed ? ` · hız ${u.speed}` : ''}
                  </div>
                  <Requirements requirements={u.requirements} buildings={city.buildings} techs={city.techs} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {levelBased ? null : (
                    <Input type="number" min={1} inputMode="numeric" placeholder="adet"
                      className="w-20 tnum"
                      value={counts[u.id] ?? ''}
                      onChange={(e) => setCounts({ ...counts, [u.id]: e.target.value })} />
                  )}
                  <Button size="sm"
                    disabled={busy || enqueue.isPending || (!levelBased && (n <= 0 || !afford))}
                    onClick={() => enqueue.mutate({
                      category: kind, type: u.id, ...(levelBased ? {} : { count: n }),
                    })}>
                    {levelBased ? `sv ${(have[u.id] ?? 0) + 1}` : 'Üret'}
                  </Button>
                </div>
              </div>
              {total && n > 0 ? (
                <div className={`tnum mt-1 text-[11px] ${afford ? 'text-muted' : 'text-danger'}`}>
                  Toplam: 🪙 {fmt(total.gold)} · 🌾 {fmt(total.food)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Techs({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const busy = city.queues.some((q) => q.category === 'tech');

  return (
    <Card>
      <SectionTitle right={busy ? 'araştırma sürüyor' : undefined}>Akademi</SectionTitle>
      <ErrorBox error={enqueue.error} />
      <div className="px-3 pb-1 text-[11px] text-muted">
        Teknik seviyesi <b>oyuncu geneli</b>dir; aynı teknik iki şehirde aynı anda araştırılamaz.
      </div>
      <ul className="divide-y divide-border">
        {(catalog.data?.techs ?? []).map((t) => {
          const afford = city.resources.gold >= t.nextCost.gold && city.resources.food >= t.nextCost.food;
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-ink">
                  {t.name} <span className="text-muted">sv {t.level}</span>
                </div>
                <div className="tnum text-xs text-muted">
                  🪙 {fmt(t.nextCost.gold)} · 🌾 {fmt(t.nextCost.food)}
                </div>
                <Requirements requirements={t.requirements} buildings={city.buildings} techs={city.techs} />
              </div>
              <Button size="sm" disabled={busy || !afford || enqueue.isPending}
                onClick={() => enqueue.mutate({ category: 'tech', type: t.id })}>
                sv {t.level + 1}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
