/**
 * ⭐ KOMUTA MERKEZİ — **Genel Durum** ve **Sıralamalar**
 * (referans `images/scr_web05`, `images/scr_web02`; menü hiyerarşisi `DecompiledSrc/src/g.java`)
 *
 * ### Orijinalden ne alındı
 * J2ME istemcisinde Komuta Merkezi bir **hub**tur (`g.java` case 10):
 * *Mesajlar · Genel Durum · İttifak · Arama · Sıralamalar*. Bizde Mesajlar sol menüde ayrı duruyor
 * (okunmamış rozeti sürekli görünsün diye), İttifak ve Arama ise kendi turlarını bekliyor —
 * ama **sekme yapısı ve isimlendirme** oradan geliyor. Sıralamanın üç dalı da aynı dosyadan
 * (case 101): *Oyuncuya Göre · İttifağa Göre · Kahramana Göre*.
 *
 * ### Ekranın şeklini belirleyen üç karar
 *  1. **Panel adı "Hükümdarlık"** (orijinal web ekranı), sayfa adı ise bilgi çubuğunda
 *     "Genel Durum" — ikisi orijinalde de farklı.
 *  2. **Şehir tablosu DEVRİK:** satırlar kaynak/birim türü, sütunlar şehirler. Bir ara tersiydi
 *     (şehir satır, birim sütun); orijinal de bu yönde ve sebebi net — oyuncu "hangi birimden
 *     toplam kaç tane, nerede" diye bakar, şehir sayısı 4-10 arasında kalır ama birim türü 20'ye
 *     çıkar. Sütun sayısını şehre bağlamak tabloyu yatay kaydırmaktan kurtarıyor.
 *  3. **Sıra CANLI DEĞİL** (§13.17.2): başlıkta "güncelleme / sıradaki" yazıyor. Bu olmadan
 *     oyuncu puanını artırıp sırasının değişmemesini hata sanar.
 *
 * ⚠️ Ekrana **kural anlatan bilgi metni konulmaz** (kullanıcı kararı 2026-07-28): puanın nasıl
 * hesaplandığı gibi açıklamalar **Yardım** sayfasında toplanacak.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LEVEL_BASED } from '@mobiwar/catalog';
import {
  useOverview, useRankings, type NamedType, type Overview, type RankingKind,
} from '../lib/queries.ts';
import { fmt } from '../lib/hooks.ts';
import { Badge, Button, CatalogIcon, Empty, Panel, Res, Skeleton, Td, Th } from '../components/ui.tsx';
import { Tooltip } from '../components/Tooltip.tsx';

export function CommandScreen(): React.ReactElement {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onRankings = pathname.startsWith('/command/rankings');

  return (
    <div className="space-y-2">
      {/* Sekme = ROTA: geri tuşu çalışsın ve "sıralamada gör" gibi kısayollar bağlanabilsin. */}
      <Tabs
        value={onRankings ? 'rankings' : 'overview'}
        onChange={(v) => navigate(v === 'rankings' ? '/command/rankings' : '/command')}
        items={[['overview', 'Genel Durum'], ['rankings', 'Sıralamalar']]}
      />
      {onRankings ? <Rankings /> : <Overview />}
    </div>
  );
}

/* ═══ Genel Durum ═══════════════════════════════════════════════════════════ */

function Overview(): React.ReactElement {
  const q = useOverview();
  const d = q.data;

  if (!d) {
    return (
      <Panel title="Hükümdarlık">
        <div className="space-y-2 p-3">
          <Skeleton w="12rem" /><Skeleton w="8rem" /><Skeleton w="16rem" />
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-2">
      <Realm d={d} />
      <CityTable d={d} />
    </div>
  );
}

/** Orijinalin "Hükümdarlık" paneli: solda künye, sağda teknik seviyeleri (`scr_web05`). */
function Realm({ d }: { d: Overview }): React.ReactElement {
  const p = d.player;
  return (
    <Panel title="Hükümdarlık" right={snapshotNote(d.ranking)}>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <dl className="space-y-1 bg-surface px-3 py-3 text-[13px]">
          <Line label="Puan" value={fmt(p.score)} strong />
          <Line label="Sıra" value={p.rank == null ? '—' : `${fmt(p.rank)} / ${fmt(p.totalPlayers)}`} />
          <Line label="Sıra Değişim" value={changeMark(p.rankChange)} tone={changeTone(p.rankChange)} />
          <Line label="İttifak Adı" value={p.alliance ?? '-'} />
          <Line label="İttifak Sırası" value={p.allianceRank == null ? '-' : fmt(p.allianceRank)} />
          <Line label="İttifak Sıra Değişim" value={changeMark(p.allianceRankChange)}
            tone={changeTone(p.allianceRankChange)} />
        </dl>

        <dl className="grid grid-cols-2 gap-x-3 bg-surface px-3 py-3 text-[13px] sm:grid-cols-1">
          {d.techs.map((t) => (
            <Line key={t.id} label={t.name} value={String(t.level)}
              tone={t.level === 0 ? 'muted' : 'ink'} />
          ))}
        </dl>
      </div>
    </Panel>
  );
}

function Line({
  label, value, tone = 'ink', strong = false,
}: {
  label: string; value: string; tone?: 'ink' | 'muted' | 'success' | 'danger'; strong?: boolean;
}): React.ReactElement {
  const toneClass = {
    ink: 'text-ink', muted: 'text-muted', success: 'text-success', danger: 'text-danger',
  }[tone];
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-muted">{label}</dt>
      <dd className={`tnum shrink-0 ${toneClass} ${strong ? 'text-base font-semibold' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Şehirler tablosu — orijinaldeki gibi **satır = kalem, sütun = şehir**, bölüm başlıklarıyla
 * (Kaynaklar · Baraka · Savunma). Boş hücre orijinaldeki gibi `-`.
 */
function CityTable({ d }: { d: Overview }): React.ReactElement {
  const units = d.unitTypes.filter((t) => (d.totals.units[t.id] ?? 0) > 0);
  const defenses = d.defenseTypes.filter((t) => (d.totals.defenses[t.id] ?? 0) > 0);

  return (
    <Panel title="Şehirler" right={`${d.cities.length} şehir`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
              <Th className="min-w-[7rem]"> </Th>
              {/**
                * ⚠️ `normal-case` **iç `span`'de**: `Th`'nin `uppercase`'i Tailwind sıralamasında
                * kardeş sınıfı yeniyor, ama `text-transform` MİRAS alındığı için çocukta yazmak
                * kesin sonuç veriyor. Şehir adı oyuncunun yazdığı metindir, büyük harfe çevrilmez.
                */}
              {d.cities.map((c) => (
                <Th key={c.id} className="min-w-[5.5rem] text-center">
                  <Tooltip label={`${c.name} · ${c.coordinates.k}:${c.coordinates.d}:${c.coordinates.s}`}>
                    <span className="cursor-help truncate normal-case">
                      {c.name}{c.isCapital ? ' ★' : ''}
                    </span>
                  </Tooltip>
                </Th>
              ))}
              <Th className="w-20 text-center">Toplam</Th>
            </tr>
          </thead>
          <tbody>
            <SectionRow title="Kaynaklar" span={d.cities.length + 2} />
            <tr className="border-b border-border">
              <Td className="text-muted"><Res kind="gold" value="Altın" size={16} /></Td>
              {d.cities.map((c) => (
                <Td key={c.id} className="tnum text-center text-ink">{fmt(c.resources.gold)}</Td>
              ))}
              <Td className="tnum text-center font-semibold text-ink">{fmt(d.totals.gold)}</Td>
            </tr>
            <tr className="border-b border-border bg-row-alt">
              <Td className="text-muted"><Res kind="food" value="Yemek" size={16} /></Td>
              {d.cities.map((c) => (
                <Td key={c.id} className="tnum text-center text-ink">{fmt(c.resources.food)}</Td>
              ))}
              <Td className="tnum text-center font-semibold text-ink">{fmt(d.totals.food)}</Td>
            </tr>

            <ItemRows title="Baraka" art="units" types={units} cities={d.cities}
              totals={d.totals.units} pick="units" empty="Henüz savaşçınız yok." />
            <ItemRows title="Savunma" art="defenses" types={defenses} cities={d.cities}
              totals={d.totals.defenses} pick="defenses" empty="Henüz savunma biriminiz yok." />
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/**
 * ⭐ BÖLÜM ŞERİDİ — Kaynaklar / Baraka / Savunma tablolarını birbirinden ayırır.
 *
 * ⚠️ Bir ara `bg-raised` ile çiziliyordu; satır zeminleriyle neredeyse aynı tondaydı ve üç
 * tablo tek tablo gibi görünüyordu (kullanıcı bildirdi 2026-07-29). Artık panel başlığının
 * kendi dokusunu ve rengini kullanıyor (`tex-header` + `bg-panel-header`) — yani ekranda zaten
 * "bu bir başlıktır" anlamına gelen görsel dil, ikinci bir renk uydurmadan.
 */
function SectionRow({ title, span }: { title: string; span: number }): React.ReactElement {
  return (
    <tr className="tex-header border-y-2 border-strong bg-panel-header text-on-panel-header">
      <Td colSpan={span}
        className="display py-1.5 text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </Td>
    </tr>
  );
}

function ItemRows({
  title, art, types, cities, totals, pick, empty,
}: {
  title: string;
  art: 'units' | 'defenses';
  types: NamedType[];
  cities: Overview['cities'];
  totals: Record<string, number>;
  pick: 'units' | 'defenses';
  empty: string;
}): React.ReactElement {
  return (
    <>
      <SectionRow title={title} span={cities.length + 2} />
      {types.length === 0 ? (
        <tr className="border-b border-border">
          <Td colSpan={cities.length + 2} className="py-3 text-center text-muted">{empty}</Td>
        </tr>
      ) : types.map((t, i) => (
        <tr key={t.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
          <Td className="text-ink">
            <span className="flex items-center gap-1.5">
              <CatalogIcon kind={art} id={t.id} size={24} alt="" />
              <span className="truncate">{t.name}</span>
            </span>
          </Td>
          {cities.map((c) => (
            <Td key={c.id} className="tnum text-center">
              {c[pick][t.id] ? amount(t.id, c[pick][t.id]!) : <span className="text-muted">-</span>}
            </Td>
          ))}
          <Td className="tnum text-center font-semibold text-ink">
            {/* Sur/Kalkan SEVİYE taşır → şehirler arası toplanamaz. */}
            {LEVEL_BASED.has(t.id) ? '-' : fmt(totals[t.id] ?? 0)}
          </Td>
        </tr>
      ))}
    </>
  );
}

/* ═══ Sıralamalar ═══════════════════════════════════════════════════════════ */

/** Sekme adları orijinalin kısaltılmış web sürümünden (`images/scr_web02`). */
const KINDS: [RankingKind, string][] = [
  ['player', 'Oyuncu'], ['alliance', 'İttifak'], ['hero', 'Kahraman'],
];

function Rankings(): React.ReactElement {
  const [kind, setKind] = useState<RankingKind>('player');
  const [page, setPage] = useState(1);
  const q = useRankings(kind, page);
  const d = q.data;

  const pick = (k: RankingKind): void => { setKind(k); setPage(1); };
  const cols = kind === 'hero' ? 5 : 6;

  return (
    <div className="space-y-2">
      <Tabs value={kind} onChange={pick} items={KINDS} />

      <Panel title="Sıralama" right={d ? snapshotNote(d) : null}>
        {/* ⭐ Sayfalayıcı ÜSTTE ve "Sayfa: 1 / 159" biçiminde — orijinaldeki yeri ve dili. */}
        <div className="flex items-center justify-center gap-2 border-b border-border px-2 py-1.5">
          <Button size="sm" variant="ghost" disabled={!d || d.page <= 1}
            onClick={() => setPage((d?.page ?? 1) - 1)} title="Önceki">◀</Button>
          <span className="tnum text-xs text-muted">
            Sayfa: <b className="text-ink">{d?.page ?? 1}</b> / {d?.pages ?? 1}
          </span>
          <Button size="sm" variant="ghost" disabled={!d || d.page >= d.pages}
            onClick={() => setPage((d?.page ?? 1) + 1)} title="Sonraki">▶</Button>
          {d?.myPage ? (
            <Button size="sm" variant="ghost" className="ml-2"
              onClick={() => setPage(d.myPage!)}>
              Beni göster ({fmt(d.myRank ?? 0)})
            </Button>
          ) : null}
        </div>

        {d?.unavailable ? (
          <Empty>{d.unavailable}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                  <Th className="w-12 text-center">Sıra</Th>
                  <Th>{kind === 'hero' ? 'Kahraman' : 'Oyuncu'}</Th>
                  {kind === 'hero'
                    ? <><Th className="w-16 text-center">Seviye</Th><Th className="w-24 text-right">Tecrübe</Th></>
                    : <><Th className="w-24 text-right">Puan</Th><Th className="w-16 text-center">Değişim</Th>
                      <Th className="w-28">İttifak</Th></>}
                  <Th className="w-10 text-center"> </Th>
                </tr>
              </thead>
              <tbody>
                {!d
                  ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={`sk${i}`} className="h-8 border-b border-border">
                      <Td className="text-center"><Skeleton w="1.5rem" /></Td>
                      <Td><Skeleton w="8rem" /></Td>
                      <Td><Skeleton w="4rem" /></Td>
                      <Td><Skeleton w="2rem" /></Td>
                      <Td><Skeleton w="3rem" /></Td>
                      <Td><Skeleton w="1rem" /></Td>
                    </tr>
                  ))
                  : d.rows.map((r, i) => (
                    <tr key={r.id}
                      className={`h-8 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''} ${
                        r.isMine ? 'text-accent' : 'text-ink'}`}>
                      <Td className="tnum text-center font-semibold">{fmt(r.rank)}</Td>
                      <Td className="max-w-[12rem] truncate">
                        {r.name}
                        {kind === 'hero' ? (
                          <span className="ml-1 text-[11px] text-muted">{r.owner}</span>
                        ) : null}
                        {r.dead ? <span className="ml-1"><Badge tone="danger">ölü</Badge></span> : null}
                      </Td>
                      {kind === 'hero' ? (
                        <>
                          <Td className="tnum text-center">{fmt(r.level ?? 0)}</Td>
                          <Td className="tnum text-right">{fmt(r.xp ?? 0)}</Td>
                        </>
                      ) : (
                        <>
                          <Td className="tnum text-right">{fmt(r.score ?? 0)}</Td>
                          <Td className={`tnum text-center text-[11px] ${
                            changeTone(r.change) === 'success' ? 'text-success'
                              : changeTone(r.change) === 'danger' ? 'text-danger' : 'text-muted'}`}>
                            {changeMark(r.change)}
                          </Td>
                          <Td className="max-w-[7rem] truncate text-muted">{r.alliance ?? '-'}</Td>
                        </>
                      )}
                      <Td className="text-center">
                        <MessageButton name={kind === 'hero' ? r.owner ?? r.name : r.name}
                          disabled={r.isMine} />
                      </Td>
                    </tr>
                  ))}
                {d && !d.unavailable && d.rows.length === 0 ? (
                  <tr>
                    <Td colSpan={cols} className="py-4 text-center text-muted">
                      Bu sıralamada henüz kayıt yok.
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * Satır sonundaki mesaj düğmesi — orijinalde sıralama satırının menüsünde **Mesaj** vardı
 * (`g.java` case 106: *Mesaj · Dünyada Bul · İttifağa Davet*).
 *
 * ⚠️ DM (§13.12) henüz açılmadı; düğme yerini şimdiden tutuyor ve **sebebini söylüyor** — gizli
 * bir düğmeyi sonradan keşfettirmektense kapalı olduğunu göstermek doğru.
 */
function MessageButton({ name, disabled }: { name: string; disabled: boolean }) {
  if (disabled) return <span className="text-muted">—</span>;
  return (
    <Tooltip label={`${name} oyuncusuna mesaj — özel mesaj henüz açılmadı`}>
      <button type="button" disabled aria-label={`${name} oyuncusuna mesaj`}
        className="inline-flex cursor-not-allowed items-center opacity-45">
        <img src="/assets/menu/mesaj.png" alt="" aria-hidden width={20} height={20}
          className="icon-shadow h-5 w-5 object-contain" />
      </button>
    </Tooltip>
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
    <Tooltip
      placement="left"
      label="Sıralama günde üç kez donar: 00:00 · 08:00 · 16:00 (oyun saati, UTC)."
    >
      <span className="cursor-help">
        {r.takenAt
          ? `güncelleme ${hhmm(r.takenAt)} · sıradaki ${hhmm(r.nextAt)}`
          : `ilk güncelleme ${hhmm(r.nextAt)}`}
      </span>
    </Tooltip>
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

/** Orijinalde değişim sütunu sayıdır (0, 2, -1). Yönü okunur kılmak için ok ekliyoruz. */
function changeMark(change: number | null | undefined): string {
  if (change == null) return '-';
  if (change === 0) return '0';
  return change > 0 ? `▲${change}` : `▼${-change}`;
}
