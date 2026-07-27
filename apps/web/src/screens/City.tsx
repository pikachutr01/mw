/**
 * ŞEHİR — iç sekmeler: Yapılar · Baraka · Savunma · Akademi (§10).
 *
 * ⭐ Maliyet, **süre** ve ön-şartlar SUNUCUDAN gelir (`/cities/:id/catalog`); istemci hesaplamaz.
 * Denge değiştiğinde arayüz kendiliğinden doğru olur — formül tek yerde yaşar.
 * ⭐ Sıralama da sunucudan gelir (katalogdaki `BUILDING_ORDER`/`TECH_ORDER`) → arayüzün kendi
 * sıralama tablosu YOK, olsaydı katalogdan sürüklenirdi.
 */
import { useState } from 'react';
import { fmt, formatDuration, remaining, useTick } from '../lib/hooks.ts';
import { nameOf } from '../lib/names.ts';
import {
  useCancelQueue, useCatalog, useCity, useEnqueue,
  type CatalogUnit, type CityDetail, type QueueRow,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Button, Empty, ErrorBox, Input, Panel, Requirements, Res } from '../components/ui.tsx';

/**
 * Şehir ekranlarının ORTAK kabuğu: şehir başlığı + bütçe çubukları + açık kuyruklar.
 * Baraka/Yapılar/Savunma/Akademi artık ayrı menü maddesi (ve ayrı rota) olduğu için ortak kısım
 * tek yerde duruyor — dört ekranda tekrarlanmıyor.
 */
function CityFrame({ children }: { children: (city: CityDetail) => React.ReactNode }) {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);

  if (!city.data || !catalog.data) return <Empty>Şehir yükleniyor…</Empty>;
  const d = city.data;

  return (
    <div className="space-y-3">
      {/* ⚠️ "Alan bütçeleri" paneli KALDIRILDI (kullanıcı kararı): dört şehir ekranının da
          tepesinde iki çubuk taşımak yer yiyordu ve bilgi zaten gerektiği anda kendini gösteriyor —
          bütçe dolduğunda yükseltme denemesi açık bir uyarıyla reddediliyor. Kale bütçesi çubuğu
          ileride **Kale'ye tıklanınca açılan modalda** yaşayacak; bileşen o gün için duruyor.
          Sur kapasitesi ise artık hiç UYGULANMIYOR (bkz. `capacity.service.ts`). */}
      <Queues city={d} />
      {children(d)}
    </div>
  );
}

export const BuildingsScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Buildings city={c} />}</CityFrame>;
export const BarracksScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Trainable city={c} kind="unit" />}</CityFrame>;
export const DefenseScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Trainable city={c} kind="defense" />}</CityFrame>;
export const AcademyScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Techs city={c} />}</CityFrame>;

/**
 * Kale bütçesi çubuğu. **Şu an hiçbir ekranda çizilmiyor** — yeri Kale detay modalı (sıradaki tur).
 * Silmek yerine duruyor çünkü bütçe kuralı canlı: yalnız gösterimi ertelendi.
 */
export function Budget({ label, used, total, hint }: { label: string; used: number; total: number; hint: string }) {
  // ⚠️ Kapasite HENÜZ YOKSA (Sur 0) "0 / 0" kırmızı yazılırsa "dolu" sanılır; oysa yapı hiç
  //    kurulmamıştır. Ayrı durum olarak gösteriliyor.
  const none = total <= 0;
  const pct = none ? 0 : Math.min(100, (used / total) * 100);
  const full = !none && used >= total;

  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between">
        <span className="text-muted">{label}</span>
        {none ? (
          <span className="text-muted">yok</span>
        ) : (
          <span className={`tnum ${full ? 'font-semibold text-danger' : 'text-ink'}`}>
            {fmt(used)} / {fmt(total)}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-border bg-raised">
        <div className={`h-full transition-all ${full ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Maliyet + süre satırı — her kalemde AYNI biçim (oyuncu tek yere bakmayı öğrenir). */
function CostLine({ gold, food, seconds }: { gold: number; food: number; seconds: number | null }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
      <Res kind="gold" value={fmt(gold)} size={14} />
      <Res kind="food" value={fmt(food)} size={14} />
      {seconds != null ? (
        <span className="tnum inline-flex items-center gap-1" title="Süre">
          ⏳ {formatDuration(seconds)}
        </span>
      ) : null}
    </div>
  );
}

/** Açık kuyruklar — oyuncunun gördüğü geri sayımlar; sunucu saatinden çizilir. */
function Queues({ city }: { city: CityDetail }) {
  useTick(city.queues.length > 0);
  const cancel = useCancelQueue();

  if (city.queues.length === 0) return null;
  return (
    <Panel title="Sürüyor">
      <ul className="divide-y divide-border">
        {city.queues.map((q, i) => (
          <li key={q.id}
            className={`flex items-center justify-between gap-2 px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">{describeQueue(q)}</div>
              <div className="tnum text-xs text-warning">{remaining(q.finishAt) ?? 'birazdan biter…'}</div>
            </div>
            <Button size="sm" variant="danger" disabled={cancel.isPending}
              onClick={() => cancel.mutate(q.id)}>
              İptal
            </Button>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
        İptal iadesi: yapı/teknik <b>süreye göre</b>, savaşçı <b>bir birim eksik</b>.
      </div>
    </Panel>
  );
}

function describeQueue(q: QueueRow): string {
  // Ekranda İngilizce id GÖRÜNMEZ (§13.14): "farm → seviye 2" değil "Çiftlik → seviye 2".
  if (q.count != null) return `${nameOf(q.itemType)} × ${fmt(q.count)}`;
  return `${nameOf(q.itemType)} → seviye ${q.targetLevel}`;
}

function Buildings({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const busy = city.queues.some((q) => q.category === 'building');

  return (
    <Panel title="Yapılar" right={busy ? 'bir yapı sürüyor' : undefined}>
      <div className="px-3 pt-2"><ErrorBox error={enqueue.error} /></div>
      <ul className="divide-y divide-border">
        {(catalog.data?.buildings ?? []).map((b, i) => {
          const maxed = b.level >= b.maxLevel;
          const cost = b.nextCost;
          const afford = !!cost && city.resources.gold >= cost.gold && city.resources.food >= cost.food;
          return (
            <li key={b.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="font-medium text-ink">{b.name}</span>
                  <span className="ml-1.5 tnum text-xs text-accent">sv {b.level}</span>
                  {maxed ? <span className="ml-1.5 text-[11px] text-muted">(tavan)</span> : null}
                </div>
                {cost ? <CostLine gold={cost.gold} food={cost.food} seconds={b.nextSeconds} /> : null}
                <Requirements requirementNames={b.requirementNames}
                  buildings={city.buildings} techs={city.techs} />
              </div>
              <Button size="sm" disabled={maxed || busy || !afford || enqueue.isPending}
                onClick={() => enqueue.mutate({ category: 'building', type: b.id })}>
                {maxed ? '—' : `sv ${b.level + 1}`}
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
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
    <Panel title={kind === 'unit' ? 'Baraka' : 'Savunma'} right={busy ? 'üretim sürüyor' : undefined}>
      <div className="px-3 pt-2"><ErrorBox error={enqueue.error} /></div>
      <ul className="divide-y divide-border">
        {list.map((u, i) => {
          const n = Number(counts[u.id] ?? '') || 0;
          // Sur ve Büyü Kalkanı ADET değil SEVİYE ilerletir → adet kutusu gösterilmez.
          const levelBased = u.levelBased === true;
          const total = levelBased
            ? { gold: u.cost.gold, food: u.cost.food, seconds: u.seconds }
            : { gold: u.cost.gold * n, food: u.cost.food * n, seconds: (u.seconds ?? 0) * n };
          const afford = city.resources.gold >= total.gold && city.resources.food >= total.food;
          return (
            <li key={u.id} className={`px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm">
                    <span className="font-medium text-ink">{u.name}</span>
                    <span className="ml-1.5 tnum text-xs text-accent">
                      {levelBased ? `sv ${have[u.id] ?? 0}` : `${fmt(have[u.id] ?? 0)} adet`}
                    </span>
                  </div>
                  {/* ⚠️ "alan · hız" satırı KALDIRILDI (kullanıcı kararı): ham stat, üretim
                      kararında işe yaramıyordu ve satırı kalabalıklaştırıyordu. Bu bilgiler
                      birime tıklayınca açılacak detay modalında — savaşçının hikâyesiyle
                      birlikte — gösterilecek (sıradaki tur). */}
                  <CostLine gold={u.cost.gold} food={u.cost.food} seconds={u.seconds ?? null} />
                  <Requirements requirementNames={u.requirementNames}
                    buildings={city.buildings} techs={city.techs} />
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
              {!levelBased && n > 0 ? (
                <div className={`mt-1 flex items-center gap-3 text-[11px] ${afford ? 'text-muted' : 'text-danger'}`}>
                  <span>Toplam:</span>
                  <Res kind="gold" value={fmt(total.gold)} size={13} />
                  <Res kind="food" value={fmt(total.food)} size={13} />
                  <span className="tnum">⏳ {formatDuration(total.seconds)}</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Techs({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const busy = city.queues.some((q) => q.category === 'tech');

  return (
    <Panel title="Akademi" right={busy ? 'araştırma sürüyor' : undefined}>
      <div className="px-3 pt-2"><ErrorBox error={enqueue.error} /></div>
      <div className="px-3 pb-1 text-[11px] text-muted">
        Teknik seviyesi <b>oyuncu geneli</b>dir; aynı teknik iki şehirde aynı anda araştırılamaz.
      </div>
      <ul className="divide-y divide-border">
        {(catalog.data?.techs ?? []).map((t, i) => {
          const afford = city.resources.gold >= t.nextCost.gold && city.resources.food >= t.nextCost.food;
          return (
            <li key={t.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="font-medium text-ink">{t.name}</span>
                  <span className="ml-1.5 tnum text-xs text-accent">sv {t.level}</span>
                </div>
                <CostLine gold={t.nextCost.gold} food={t.nextCost.food} seconds={t.nextSeconds} />
                <Requirements requirementNames={t.requirementNames}
                  buildings={city.buildings} techs={city.techs} />
              </div>
              <Button size="sm" disabled={busy || !afford || enqueue.isPending}
                onClick={() => enqueue.mutate({ category: 'tech', type: t.id })}>
                sv {t.level + 1}
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
