/**
 * ⭐ MAĞARA MODALI (§13.20.5) — Yapılar ekranındaki **Mağara** adına tıklayınca açılır.
 *
 * Doküman: *"Yapılar menüsünde … mağaraya asker doldurma veya dolu mağaradaki ünitelerin
 * boşaltılması işlemleri de yapılabilir."* Orijinalde de giriş noktası burasıdır.
 *
 * Ekranın üç kuralı:
 *  1. **Kapasite ALAN cinsindendir**, adet değil. Seçim değiştikçe alan **canlı** hesaplanır;
 *     tür fark etmez, tek şart toplamın kapasiteyi aşmaması.
 *  2. **Emir asker taşımaz, sayaç kurar.** Askerler süre boyunca yerinde durur; doldurma
 *     beklerken şehirdedirler ve gelen saldırıya **katılırlar**. Bu yüzden iptal serbesttir ve
 *     hiçbir telafi hesabı gerektirmez — geri alınacak bir taşıma yok.
 *  3. **Onarımdayken hiçbir işlem yapılamaz**; modal açılır ama sebebini ve kalan süreyi yazar.
 *
 * ⭐⭐ **KAHRAMAN DA BURADAN** (kullanıcı, 2026-08-11): *"Kahramanın ve askerlerin mağara
 * doldurma ekranları aynı olsun, sadece asker ve kahraman şeklinde bölünebilirler."* Orijinal
 * istemci de böyleydi — mağara ekranı birim listesinin ardına kahraman satırlarını ekliyor ve
 * ikisini **tek istekte** gönderiyordu (`docs/JAVA_ROENTGEN.md` §6.2). Ayrı bir "kahramanı
 * sakla" ekranı açmak hem oyunun kendi akışından hem tek-emir kuralından sapardı.
 */
import { useState } from 'react';
import { HERO_AREA, UNITS_BY_ID, WARRIOR_ORDER, caveTransferSeconds } from '@mobilwar/catalog';
import type { CaveState, CityDetail, HeroRow } from '../lib/queries.ts';
import { useCancelCaveJob, useCaveJob, useTemple } from '../lib/queries.ts';
import { fmt, formatDuration, remaining, useTick } from '../lib/hooks.ts';
import { nameOf } from '../lib/names.ts';
import { Modal } from '../components/Modal.tsx';
import { AmountInput, Button, CatalogIcon, Empty, ErrorBox } from '../components/ui.tsx';

type Tab = 'store' | 'withdraw';

export function CaveModal({
  city, cave, onClose,
}: { city: CityDetail; cave: CaveState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('store');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickedHeroes, setPickedHeroes] = useState<number[]>([]);
  const job = useCaveJob(city.id);
  const cancel = useCancelCaveJob(city.id);
  /**
   * ⚠️ Kahraman listesi `CityDetail`de yok, tapınak sorgusunda. Doldurmada **yalnız `in_city`**
   * olanlar seçilebilir — Java'nın kuralının birebiri (`i.java:846`, `u == 2` "Şehirde"):
   * seferdeki, ölü, dirilen ve zaten mağarayla işi olan kahraman listeye hiç girmez.
   */
  const temple = useTemple(city.id);

  /**
   * ⚠️ Aşağıda iki geri sayım çiziliyor (onarım ve süren iş) ama saniyelik tetik YOKTU:
   * modal açıkken sayaçlar donuk kalıyor, yalnız üst sorgu tazelendiğinde (60 sn / 5 dk)
   * sıçrıyordu. Tetik yalnız gösterilecek bir şey varken çalışır — boş modalde zamanlayıcı
   * açmanın anlamı yok.
   */
  useTick(cave.repairing || cave.job != null);

  // Kaynak liste sekmeye göre değişir: doldururken BARAKA, boşaltırken MAĞARA.
  const source = tab === 'store' ? city.units : cave.units;
  /**
   * ⚠️ Sıra **katalogdan** (`WARRIOR_ORDER`), alfabetik DEĞİL. Bir ara `localeCompare(id)`
   * ile sıralanıyordu; id'ler İngilizce olduğu için ekranda "Yük Arabası, Süvari, Kaos…"
   * gibi anlamsız bir dizilim çıkıyordu (§13.14: ekranda İngilizce iz kalmaz).
   * ⭐ Casus Kuş da listede: katalogda `kind: 'warrior'`, alanı 1 — saklanabilir.
   */
  const rows = WARRIOR_ORDER
    .filter((id) => (source[id] ?? 0) > 0)
    .map((id) => [id, source[id]!] as [string, number]);

  const units: Record<string, number> = {};
  for (const [id, raw] of Object.entries(picked)) {
    const n = Math.trunc(Number(raw) || 0);
    const have = source[id] ?? 0;
    if (n > 0) units[id] = Math.min(n, have);
  }

  /** Sekmeye göre seçilebilir kahramanlar: doldururken ŞEHİRDEKİLER, boşaltırken MAĞARADAKİLER. */
  const heroPool: { id: number; name: string; level: number }[] = tab === 'store'
    ? (temple.data?.heroes ?? []).filter((h: HeroRow) => h.state === 'in_city')
      .map((h: HeroRow) => ({ id: h.id, name: h.name, level: h.level }))
    : cave.heroes;
  const heroIds = pickedHeroes.filter((id) => heroPool.some((h) => h.id === id));

  const area = Object.entries(units).reduce((s, [id, n]) => s + areaOf(id) * n, 0)
    + HERO_AREA * heroIds.length;
  const hasPick = Object.keys(units).length > 0 || heroIds.length > 0;

  // Doldurmada boş alanı aşmak yasak; boşaltmada böyle bir sınır yok.
  const fits = tab === 'withdraw' || area <= cave.freeArea;
  const seconds = estimateSeconds(area, cave.level);
  const blocked = cave.repairing || cave.job != null;
  const canSend = hasPick && fits && !blocked && !job.isPending;

  const switchTab = (t: Tab): void => { setTab(t); setPicked({}); setPickedHeroes([]); };
  const toggleHero = (id: number): void => setPickedHeroes(
    (prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  );

  return (
    <Modal
      title={`Mağara — seviye ${cave.level}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Kapat</Button>
          {cave.job ? (
            <Button variant="danger" disabled={cancel.isPending}
              onClick={() => cancel.mutate()}>
              İşlemi iptal et
            </Button>
          ) : null}
          <Button disabled={!canSend}
            onClick={() => job.mutate({ direction: tab, units, heroIds }, { onSuccess: onClose })}>
            {tab === 'store' ? 'Mağaraya gönder' : 'Şehre çağır'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-3">
        <CapacityBar cave={cave} pendingArea={tab === 'store' ? area : -area} />

        {cave.repairing ? (
          <Notice tone="danger">
            Mağara yıkıldı ve onarılıyor. Onarım bitene kadar içine asker konulamaz, içinden
            asker çıkarılamaz. <b className="tnum">{remaining(cave.repairUntil) ?? 'birazdan biter…'}</b>
          </Notice>
        ) : null}

        {cave.job ? (
          <Notice tone="warning">
            {cave.job.direction === 'store' ? 'Mağaraya asker giriyor' : 'Mağaradan asker çıkıyor'}:
            {' '}<b className="tnum">{remaining(cave.job.finishAt) ?? 'birazdan biter…'}</b>.
            {' '}Bitmeden yeni emir verilemez; iptal edersen askerler bulundukları yerde kalır.
          </Notice>
        ) : null}

        <div className="flex gap-1">
          {([['store', 'Mağara Doldur'], ['withdraw', 'Mağara Boşalt']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => switchTab(id)}
              className={`flex-1 rounded-[var(--radius-sm)] border-2 px-2 py-1.5 text-xs ${
                tab === id
                  ? 'border-strong bg-accent text-on-accent'
                  : 'border-border bg-surface text-muted hover:bg-raised'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <ErrorBox error={job.error} />
        <ErrorBox error={cancel.error} />

        {rows.length === 0 && heroPool.length === 0 ? (
          <Empty>
            {tab === 'store'
              ? 'Şehrinde saklanacak savaşçı ya da kahraman yok.'
              : 'Mağara boş.'}
          </Empty>
        ) : null}

        {rows.length > 0 ? (
          <>
            <SectionTitle>Askerler</SectionTitle>
            <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
            {rows.map(([id, have]) => {
              const left = Math.max(0, have - (units[id] ?? 0));
              return (
                <li key={id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <CatalogIcon kind="units" id={id} size={32} alt="" />
                  <div className="min-w-0 flex-1 text-sm text-ink">
                    {nameOf(id)}
                    {/* Parantezdeki sayı KALAN adet: input arttıkça canlı azalır. */}
                    <span className="tnum ml-1 text-muted">({fmt(left)})</span>
                    <span className="tnum ml-2 text-[11px] text-muted">{areaOf(id)} alan/birim</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <AmountInput min={0} max={have} placeholder="0"
                      value={picked[id] ?? ''}
                      onChange={(e) => setPicked({ ...picked, [id]: e.target.value })} />
                    <Button size="sm" variant="ghost"
                      onClick={() => setPicked({ ...picked, [id]: String(have) })}>
                      hepsi
                    </Button>
                  </div>
                </li>
              );
            })}
            </ul>
          </>
        ) : null}

        {heroPool.length > 0 ? (
          <>
            <SectionTitle>Kahramanlar</SectionTitle>
            <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
              {heroPool.map((h) => {
                const on = heroIds.includes(h.id);
                return (
                  <li key={h.id}>
                    {/*
                      ⚠️ Kahraman ADET değil VARLIK: `AmountInput` yerine onay kutusu. Satırın
                      tamamı tıklanabilir — mobilde 32px'lik kutuyu hedeflemek zor.
                    */}
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5">
                      <input type="checkbox" checked={on} onChange={() => toggleHero(h.id)}
                        className="size-4 shrink-0 accent-[var(--color-accent)]" />
                      <div className="min-w-0 flex-1 text-sm text-ink">
                        {h.name}
                        <span className="tnum ml-1 text-muted">(seviye {h.level})</span>
                        <span className="tnum ml-2 text-[11px] text-muted">{HERO_AREA} alan</span>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {hasPick ? (
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-sm)]
            border px-2.5 py-2 text-[12px] ${fits ? 'border-border text-muted' : 'border-danger text-danger'}`}>
            <span>Seçilen alan: <b className="tnum text-ink">{fmt(area)}</b></span>
            <span>Süre: <b className="tnum text-ink">{formatDuration(seconds)}</b></span>
            {!fits ? <span className="font-semibold">Kapasite yetmiyor.</span> : null}
          </div>
        ) : null}

<p className="text-[11px] text-muted">
          Askerler ve kahramanlar süre dolana kadar bulundukları yerde kalır: mağaraya girmeyi
          bekleyenler şehirdedir ve <b>gelen saldırıya katılırlar</b> — savaşta eksilirlerse emir
          kalanlarla tamamlanır, iptal olmaz. Emirdeki asker ve kahramanlar <b>başka bir göreve
          gönderilemez</b>. Mağaradakiler savaşa katılmaz, casus kuşlar onları göremez.
        </p>
      </div>
    </Modal>
  );
}

/** Kapasite çubuğu — seçim yapıldıkça "olacak" doluluk açık renkle önden gösterilir. */
function CapacityBar({ cave, pendingArea }: { cave: CaveState; pendingArea: number }) {
  const after = Math.max(0, Math.min(cave.capacity, cave.usedArea + pendingArea));
  const usedPct = cave.capacity > 0 ? (cave.usedArea / cave.capacity) * 100 : 0;
  const afterPct = cave.capacity > 0 ? (after / cave.capacity) * 100 : 0;
  const over = cave.usedArea + pendingArea > cave.capacity;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">Kapasite (alan)</span>
        <span className={`tnum ${over ? 'font-semibold text-danger' : 'text-ink'}`}>
          {fmt(cave.usedArea)} / {fmt(cave.capacity)}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full border border-border bg-raised">
        <div className={`absolute inset-y-0 left-0 ${over ? 'bg-danger/40' : 'bg-accent/40'}`}
          style={{ width: `${afterPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

/** İki bölümü ayıran başlık — «asker» ve «kahraman» tek ekranda ama karışmadan dursun. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'danger' | 'warning'; children: React.ReactNode }) {
  const cls = tone === 'danger'
    ? 'border-danger bg-danger/10 text-danger'
    : 'border-warning bg-warning/10 text-warning';
  return (
    <div role="status" className={`rounded-[var(--radius-sm)] border px-2.5 py-2 text-xs ${cls}`}>
      {children}
    </div>
  );
}

/**
 * ⚠️ **ÖNİZLEME** — otorite sunucudur ama formül İKİ KEZ YAZILMAZ: motorun kendi
 * `caveTransferSeconds`'ı çağrılıyor (sefer süresi önizlemesindeki kararın aynısı, §3).
 * İki formül kaçınılmaz olarak birbirinden kayardı.
 */
function estimateSeconds(area: number, level: number): number {
  return caveTransferSeconds(area, level);
}

/** Birim alanı katalogdan — istemci kendi tablosunu TUTMAZ (§13.14). */
const areaOf = (id: string): number => UNITS_BY_ID[id]?.area ?? 0;
