/**
 * ⭐ KOMUTA MERKEZİ — **Genel Durum** ve **Sıralamalar** (referans `images/scr_web05`, `scr_web02`)
 *
 * Doküman (GENEL DURUM): *"tüm şehirlerinizdeki ordu ve kaynak durumunu gösterir. Ayrıca
 * tekniklerinizin seviyesi ve sıralamanız hakkında da istatistikler içerir. Puanlama,
 * harcadığınız kaynak miktarına göre yapılır."*
 *
 * İki karar bu ekranın şeklini belirledi:
 *
 *  1. **Ordu dökümü SÜTUN, satır değil.** 4 şehir × 12 savaşçı türü bir satır listesi olarak
 *     48 satır ederdi; şehirler satır, birim türleri sütun olunca tablo tek bakışta okunuyor ve
 *     "hangi şehirde ne var" karşılaştırması dikey olarak yapılabiliyor. Sütun başlıkları
 *     **birimin kendi görseli** (ad `title`'da) — 12 Türkçe başlık tabloyu ekrana sığdırmazdı.
 *  2. **Sıra CANLI DEĞİL** (§13.16): başlıkta "son güncelleme / sıradaki" yazıyor. Bu olmadan
 *     oyuncu puanını artırıp sırasının değişmemesini hata sanar.
 */
import { useState } from 'react';
import { LEVEL_BASED } from '@mobiwar/catalog';
import { useOverview, useRankings, type Overview, type RankingKind } from '../lib/queries.ts';
import { fmt } from '../lib/hooks.ts';
import { Badge, Button, CatalogIcon, Empty, Panel, Res, Skeleton, Td, Th } from '../components/ui.tsx';

type Tab = 'overview' | 'rankings';

export function CommandScreen(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="space-y-2">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[['overview', 'Genel Durum'], ['rankings', 'Sıralamalar']]}
      />
      {tab === 'overview' ? <Overview /> : <Rankings />}
    </div>
  );
}

/* ═══ Genel Durum ═══════════════════════════════════════════════════════════ */

function Overview(): React.ReactElement {
  const q = useOverview();
  const d = q.data;

  if (!d) {
    return (
      <Panel title="Genel Durum">
        <div className="space-y-2 p-3">
          <Skeleton w="12rem" /><Skeleton w="8rem" /><Skeleton w="16rem" />
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-2">
      <ScoreHeader d={d} />
      <ArmyTable d={d} kind="units" title="Ordular" />
      <ArmyTable d={d} kind="defenses" title="Savunma" />
      <TechList d={d} />
    </div>
  );
}

function ScoreHeader({ d }: { d: Overview }): React.ReactElement {
  const p = d.player;
  return (
    <Panel title="Genel Durum" right={snapshotNote(d.ranking)}>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Stat label="Puan" value={fmt(p.score)}
          hint={`sonraki puana ${fmt(p.toNextPoint)} kaynak`} />
        <Stat label="Sıra"
          value={p.rank == null ? '—' : `${fmt(p.rank)} / ${fmt(p.totalPlayers)}`}
          hint={changeLabel(p.rankChange)} tone={changeTone(p.rankChange)} />
        <Stat label="İttifak" value={p.alliance ?? '—'} hint="henüz açılmadı" />
        <Stat label="İttifak sırası"
          value={p.allianceRank == null ? '—' : fmt(p.allianceRank)}
          hint={changeLabel(p.allianceRankChange)} tone={changeTone(p.allianceRankChange)} />
      </div>
      {/* Puanın nereden geldiği ekranda yazılı: oyuncu "neden puanım düştü" diye sormasın. */}
      <div className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Harcanan her 1.000 kaynak 1 puan kazandırır; savaşta kaybedilen ordu aynı oranda puan
        götürür.
      </div>
    </Panel>
  );
}

function Stat({
  label, value, hint, tone = 'muted',
}: {
  label: string; value: string; hint?: string | null; tone?: 'muted' | 'success' | 'danger';
}): React.ReactElement {
  const toneClass = { muted: 'text-muted', success: 'text-success', danger: 'text-danger' }[tone];
  return (
    <div className="bg-surface px-3 py-2">
      <div className="display text-[11px] tracking-wide text-muted uppercase">{label}</div>
      <div className="tnum truncate text-lg font-semibold text-ink">{value}</div>
      {hint ? <div className={`truncate text-[11px] ${toneClass}`}>{hint}</div> : null}
    </div>
  );
}

/**
 * Şehir × birim tablosu. Sütunlar **oyuncunun sahip olduğu** türlerle sınırlanıyor: katalogdaki
 * her türü sütun yapmak boş bir 20 sütunluk tablo üretiyordu.
 */
function ArmyTable({
  d, kind, title,
}: { d: Overview; kind: 'units' | 'defenses'; title: string }): React.ReactElement {
  const types = (kind === 'units' ? d.unitTypes : d.defenseTypes)
    .filter((t) => (d.totals[kind][t.id] ?? 0) > 0);
  const art = kind === 'units' ? 'units' : 'defenses';

  return (
    <Panel title={title} right={`${d.cities.length} şehir`}>
      {types.length === 0 ? (
        <Empty>Henüz {kind === 'units' ? 'savaşçınız' : 'savunma biriminiz'} yok.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                <Th className="min-w-[8rem]">Şehir</Th>
                {kind === 'units' ? <Th className="w-24 text-right">Kaynak</Th> : null}
                {types.map((t) => (
                  <Th key={t.id} className="w-14 text-center">
                    <span className="flex justify-center" title={t.name}>
                      <CatalogIcon kind={art} id={t.id} size={28} alt={t.name} />
                    </span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.cities.map((c, i) => (
                <tr key={c.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                  <Td className="font-medium text-ink">
                    {c.name}{c.isCapital ? ' ★' : ''}
                    <span className="tnum ml-1 text-[11px] text-muted">
                      {c.coordinates.k}:{c.coordinates.d}:{c.coordinates.s}
                    </span>
                  </Td>
                  {kind === 'units' ? (
                    <Td className="text-right">
                      <span className="flex flex-col items-end gap-0.5">
                        <Res kind="gold" value={fmt(c.resources.gold)} size={14} />
                        <Res kind="food" value={fmt(c.resources.food)} size={14} />
                      </span>
                    </Td>
                  ) : null}
                  {types.map((t) => (
                    <Td key={t.id} className="tnum text-center">
                      {c[kind][t.id] ? amount(t.id, c[kind][t.id]!) : <span className="text-muted">—</span>}
                    </Td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-strong bg-raised font-semibold">
                <Td className="text-ink">Toplam</Td>
                {kind === 'units' ? (
                  <Td className="text-right">
                    <span className="flex flex-col items-end gap-0.5">
                      <Res kind="gold" value={fmt(d.totals.gold)} size={14} />
                      <Res kind="food" value={fmt(d.totals.food)} size={14} />
                    </span>
                  </Td>
                ) : null}
                {types.map((t) => (
                  <Td key={t.id} className="tnum text-center text-ink">
                    {/* Sur/Kalkan SEVİYE taşır → şehirler arası toplanamaz, çizgi konur. */}
                    {LEVEL_BASED.has(t.id) ? '—' : fmt(d.totals[kind][t.id] ?? 0)}
                  </Td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Teknik seviyeleri — araştırılmamışlar da görünür ki oyuncu neyi kaçırdığını görsün. */
function TechList({ d }: { d: Overview }): React.ReactElement {
  return (
    <Panel title="Teknikler" right={`${d.techs.filter((t) => t.level > 0).length}/${d.techs.length}`}>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
        {d.techs.map((t) => (
          <div key={t.id}
            className={`flex items-center gap-2 bg-surface px-2 py-1.5 ${t.level === 0 ? 'opacity-45' : ''}`}>
            <CatalogIcon kind="techs" id={t.id} size={32} alt="" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.name}</span>
            <span className="tnum text-sm font-semibold text-ink">{t.level}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ═══ Sıralamalar ═══════════════════════════════════════════════════════════ */

const KINDS: [RankingKind, string][] = [
  ['player', 'Oyuncu'], ['alliance', 'İttifak'], ['hero', 'Kahraman'],
];

function Rankings(): React.ReactElement {
  const [kind, setKind] = useState<RankingKind>('player');
  const [page, setPage] = useState(1);
  const q = useRankings(kind, page);
  const d = q.data;

  const pick = (k: RankingKind): void => { setKind(k); setPage(1); };

  return (
    <div className="space-y-2">
      <Tabs value={kind} onChange={pick} items={KINDS} />
      <Panel title="Sıralama" right={d ? snapshotNote(d) : null}>
        {d?.unavailable ? (
          <Empty>{d.unavailable}</Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                    <Th className="w-12 text-center">Sıra</Th>
                    <Th className="w-10 text-center">Δ</Th>
                    <Th>{kind === 'hero' ? 'Kahraman' : 'Oyuncu'}</Th>
                    {kind === 'hero'
                      ? <><Th className="w-16 text-center">Seviye</Th><Th className="w-24 text-right">Tecrübe</Th></>
                      : <><Th className="w-24 text-right">Puan</Th><Th className="w-14 text-center">Şehir</Th></>}
                  </tr>
                </thead>
                <tbody>
                  {!d
                    ? Array.from({ length: 8 }, (_, i) => (
                      <tr key={`sk${i}`} className="h-8 border-b border-border">
                        <Td className="text-center"><Skeleton w="1.5rem" /></Td>
                        <Td className="text-center"><Skeleton w="1rem" /></Td>
                        <Td><Skeleton w="8rem" /></Td>
                        <Td><Skeleton w="4rem" /></Td>
                        <Td><Skeleton w="2rem" /></Td>
                      </tr>
                    ))
                    : d.rows.map((r, i) => (
                      <tr key={r.id}
                        className={`h-8 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''} ${
                          r.isMine ? 'text-accent' : 'text-ink'}`}>
                        <Td className="tnum text-center font-semibold">{fmt(r.rank)}</Td>
                        <Td className={`tnum text-center text-[11px] ${
                          changeTone(r.change) === 'success' ? 'text-success'
                            : changeTone(r.change) === 'danger' ? 'text-danger' : 'text-muted'}`}>
                          {changeMark(r.change)}
                        </Td>
                        <Td className="max-w-[12rem] truncate">
                          {r.name}
                          {kind === 'hero' ? (
                            <span className="ml-1 text-[11px] text-muted">{r.owner}</span>
                          ) : null}
                          {r.dead ? <span className="ml-1"><Badge tone="danger">ölü</Badge></span> : null}
                        </Td>
                        {kind === 'hero'
                          ? <><Td className="tnum text-center">{fmt(r.level ?? 0)}</Td>
                            <Td className="tnum text-right">{fmt(r.xp ?? 0)}</Td></>
                          : <><Td className="tnum text-right">{fmt(r.score ?? 0)}</Td>
                            <Td className="tnum text-center text-muted">{fmt(r.cities ?? 0)}</Td></>}
                      </tr>
                    ))}
                  {d && d.rows.length === 0 ? (
                    <tr>
                      <Td colSpan={5} className="py-4 text-center text-muted">
                        Bu sıralamada henüz kayıt yok.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {d ? (
              <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
                <Button size="sm" variant="ghost" disabled={d.page <= 1}
                  onClick={() => setPage(d.page - 1)}>◀</Button>
                <span className="tnum text-xs text-muted">{d.page} / {d.pages}</span>
                <Button size="sm" variant="ghost" disabled={d.page >= d.pages}
                  onClick={() => setPage(d.page + 1)}>▶</Button>
                {/* 340. sıradaki oyuncu kendini aramasın diye: doğru sayfaya tek tıkla gider. */}
                {d.myPage ? (
                  <Button size="sm" variant="ghost" className="ml-auto"
                    onClick={() => setPage(d.myPage!)}>
                    Beni göster ({fmt(d.myRank ?? 0)})
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}

/* ═══ Ortak parçalar ════════════════════════════════════════════════════════ */

function Tabs<T extends string>({
  value, onChange, items,
}: { value: T; onChange: (v: T) => void; items: [T, string][] }): React.ReactElement {
  return (
    <div className="flex gap-1">
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex-1 rounded-[var(--radius-sm)] border-2 px-2 py-1.5 text-xs ${
            value === id
              ? 'border-strong bg-accent text-on-accent'
              : 'border-border bg-surface text-muted hover:bg-raised'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * "güncelleme 08:00 · sıradaki 16:00" — sıranın neden donuk olduğunu ekranda söyler.
 *
 * ⚠️ Saatler **OYUN SAATİ (UTC)** ile yazılır, tarayıcının yerel saatiyle değil. Oyunun bütün
 * zaman kuralları oyun saatinde yaşıyor (gece savaşı 00:00–08:00, sıralama 00/08/16); yerel
 * saate çevirseydik UTC+3'teki oyuncu "sıralama 19:00'da" diye okur ve dokümandaki saatlerle
 * hiçbir zaman eşleşmezdi.
 */
function snapshotNote(r: { takenAt: string | null; nextAt: string }): React.ReactElement {
  const hhmm = (iso: string): string =>
    new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return (
    <span title="Saatler oyun saatidir (UTC): 00:00 · 08:00 · 16:00">
      {r.takenAt
        ? `güncelleme ${hhmm(r.takenAt)} · sıradaki ${hhmm(r.nextAt)} (oyun saati)`
        : `ilk güncelleme ${hhmm(r.nextAt)} (oyun saati)`}
    </span>
  );
}

/**
 * ⚠️ Sur ve Büyü Kalkanı `defenses` tablosunda **SEVİYE** taşır, adet değil (§13.11.1b).
 * Aynı sütunda çıplak sayı yazsaydık "Sur 5" beş adet sur gibi okunurdu.
 */
function amount(id: string, n: number): string {
  return LEVEL_BASED.has(id) ? `sv. ${n}` : fmt(n);
}

function changeTone(change: number | null | undefined): 'muted' | 'success' | 'danger' {
  if (change == null || change === 0) return 'muted';
  return change > 0 ? 'success' : 'danger';
}

function changeLabel(change: number | null | undefined): string | null {
  if (change == null) return null;
  if (change === 0) return 'değişmedi';
  return change > 0 ? `▲ ${change} yükseldi` : `▼ ${-change} düştü`;
}

function changeMark(change: number | null | undefined): string {
  if (change == null) return '·';
  if (change === 0) return '—';
  return change > 0 ? `▲${change}` : `▼${-change}`;
}
