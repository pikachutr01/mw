/**
 * ŞEHİR EKRANLARI — Yapılar · Baraka · Savunma · Akademi (§10).
 *
 * ⭐ Maliyet, **süre**, ön-şartlar ve sıralama SUNUCUDAN gelir (`/cities/:id/catalog`).
 *
 * ⭐ **SÜREN İŞ, KALEMİN KENDİ SATIRINDA** (kullanıcı kararı 2026-07-28). Eskiden ekranın
 * tepesinde ayrı bir "Sürüyor" paneli vardı; oyuncu neyin ilerlediğini bulmak için gözünü iki
 * yere gezdiriyordu. Artık ilerleme çubuğu + geri sayım + iptal, ilerleyen kalemin **kendi
 * satırının altında** karşıdan karşıya duruyor.
 *
 * ⭐ **İptal onaydan geçer** ve onay metni iade KURALINI yazar — kaleme göre değişiyor
 * (yapı/teknik süreye göre, savaşçı bir birim eksik), oyuncunun bunu ezberlemesi beklenemez.
 * ⚠️ **Tutar YAZMAZ** (kullanıcı, 2026-08-03): gerçek iade sunucuda onay anında hesaplanıyor,
 * ekranda gösterilen tahmin aradan geçen saniyelerle ayrışıyordu.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { caveRepairSeconds, wallCurrentIntegrity } from '@mobilwar/catalog';
import { nameOf } from '../lib/names.ts';
import { BUILDING_INFO } from '../lib/info-texts.ts';
import { fmt, formatDuration, gameNow, remaining, useTick } from '../lib/hooks.ts';
import {
  useCancelCaveJob, useCancelQueue, useCatalog, useCity, useEnqueue, useMoveQueue,
  type CatalogBuilding, type CatalogUnit, type CityDetail, type QueueRow, type TechQueueRow,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import {
  AmountInput, Button, CatalogIcon, Empty, ErrorBox, Panel, Requirements, Res,
} from '../components/ui.tsx';
import { Popover, PopoverRow } from '../components/Popover.tsx';
import { useConfirm } from '../components/Modal.tsx';
import { CaveModal } from './cave-modal.tsx';

function CityFrame({ children }: { children: (city: CityDetail) => React.ReactNode }) {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);
  useTick();

  if (!city.data || !catalog.data) return <Empty>Şehir yükleniyor…</Empty>;
  return <div className="space-y-3">{children(city.data)}</div>;
}

export const BuildingsScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Buildings city={c} />}</CityFrame>;
export const BarracksScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Trainable city={c} kind="unit" />}</CityFrame>;
export const DefenseScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Trainable city={c} kind="defense" />}</CityFrame>;
export const AcademyScreen = (): React.ReactElement =>
  <CityFrame>{(c) => <Techs city={c} />}</CityFrame>;

/** Kale bütçesi çubuğu — Kale detay modalı için duruyor, şu an hiçbir ekranda çizilmiyor. */
export function Budget({ label, used, total, hint }: { label: string; used: number; total: number; hint: string }) {
  const none = total <= 0;
  const pct = none ? 0 : Math.min(100, (used / total) * 100);
  const full = !none && used >= total;
  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between">
        <span className="text-muted">{label}</span>
        {none ? <span className="text-muted">yok</span> : (
          <span className={`tnum ${full ? 'font-semibold text-danger' : 'text-ink'}`}>
            {fmt(used)} / {fmt(total)}
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-border bg-raised">
        <div className={`h-full transition-all ${full ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Ortak parçalar ─────────────────────────────────────────────────────────── */

/**
 * Ad + parantez içinde seviye/adet (kullanıcı kararı): "Çiftlik (20)" · "Cüce (302)".
 *
 * ⭐ `info` verilirse **seviyenin hemen sağında** küçük bir `i` düğmesi çıkar ve tıklanınca
 * açıklama kutusu açılır (kullanıcı, 2026-08-08: *"parantez içindeki seviyesinin sağ tarafında
 * ufak ikon olacak ve tıklayınca açılıp tekrar tıklayınca kapanacak"*).
 *
 * ⚠️ Açıklama neden `Tooltip` DEĞİL: bunlar iki-üç cümlelik kalıcı metinler. Hover balonu
 * fare çekilince kaybolur, dokunmatikte okunurken kapanır ve içindeki metin seçilemez.
 * `Popover` tıklamayla açılır ve okuyucu isteyene kadar durur — ayrımın gerekçesi orada yazılı.
 *
 * ⚠️ `onClick` ile bilgi düğmesi **birlikte** yaşayabiliyor: Mağara satırı hem tıklanabilir
 * (doldurma modalı) hem açıklamalı. Eskiden Mağara bu bileşeni KOPYALAMIŞTI ve ona eklenen her
 * şey Mağara'yı atlıyordu — kopya kaldırıldı.
 */
function ItemName({
  name, value, onClick, right, info,
}: {
  name: string;
  value: number | string;
  onClick?: () => void;
  right?: React.ReactNode;
  info?: React.ReactNode;
}) {
  const nameNode = <span className="font-semibold text-ink">{name}</span>;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-tight">
      <span>
        {onClick ? (
          /* Noktalı altçizgi = "burada tıklanacak bir şey var" işareti; bu ekranda tek
             tıklanabilir ad Mağara ve işaret olmadan tıklanabilirliği görünmüyor. */
          <button type="button" onClick={onClick}
            className="text-left underline decoration-dotted underline-offset-2 hover:text-accent">
            {nameNode}
          </button>
        ) : nameNode}
        <span className="tnum ml-1.5 text-accent">({value})</span>
      </span>
      {info ? <Popover label={`${name} hakkında bilgi`}>{info}</Popover> : null}
      {right}
    </div>
  );
}

/**
 * ⭐ §verify — "doğrulanmamış hesap burada duruyor" satırı.
 *
 * ⚠️ `Requirements` ile AYNI görsel dilde (küçük, uyarı rengi, satırın altında): oyuncu için
 * ikisi de "bu düğme neden pasif" sorusunun cevabı, ayrı bir dil öğrenmesi gerekmemeli.
 */
function VerifyCap({ max, what = 'Yükseltme' }: { max: number; what?: string }) {
  return (
    <div className="mt-0.5 text-[11px] text-warning">
      {what} için e-posta doğrulaması gerekli (en fazla sv {max}).
    </div>
  );
}

/**
 * ⭐ BARAKA ↔ ASKER, AKADEMİ ↔ TEKNİK KİLİDİNİN SEBEBİ (§13.11.5a, kullanıcı 2026-08-06).
 *
 * Sunucu da reddediyor (`queue.service.ts` → `assertBuildingIdle`); buradaki tek amaç
 * oyuncunun düğmeye BASTIKTAN sonra değil basmadan önce görmesi — ön-şart ve §verify
 * uyarılarıyla aynı yer, aynı ton.
 */
function LockNote({ text }: { text: string }) {
  return <div className="mt-0.5 text-[11px] text-warning">{text}</div>;
}

function CostLine({ gold, food, seconds }: { gold: number; food: number; seconds: number | null }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
      <Res kind="gold" value={fmt(gold)} size={14} />
      <Res kind="food" value={fmt(food)} size={14} />
      {seconds != null ? (
        <span className="tnum inline-flex items-center gap-1" title="Süre">⏳ {formatDuration(seconds)}</span>
      ) : null}
    </div>
  );
}

/**
 * ⭐ SATIR İÇİ İLERLEME — çubuk + geri sayım + iptal. Kalemin kendi satırının altında,
 * karşıdan karşıya. `extra` savaşçı kuyruğunun "üretilen / toplam" bilgisini taşır.
 */
function ProgressRow({
  startedAt, finishAt, label, onCancel, canCancel = true, cancelling = false, right,
}: {
  startedAt: string;
  finishAt: string;
  label?: React.ReactNode;
  onCancel?: () => void;
  canCancel?: boolean;
  cancelling?: boolean;
  right?: React.ReactNode;
}) {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishAt);
  /**
   * ⚠️ `gameNow()` — `serverNow()` DEĞİL. `startedAt`/`finishAt` OYUN saatinde tutuluyor
   * (`queue.service.ts`), dolayısıyla çubuk da o ölçekte hesaplanmalı. Eskiden burada
   * `serverNow()` vardı: **çubuk gerçek saatte, hemen yanındaki yazı oyun saatinde** koşuyordu
   * ve kısa kuyruklarda çubuk %100'e vardığında yazı hâlâ süre gösteriyordu.
   */
  const pct = Math.min(100, Math.max(0, ((gameNow() - start) / Math.max(1, end - start)) * 100));
  return (
    <div className="mt-1.5 border-t border-border pt-1.5">
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        <span className="tnum font-semibold text-warning">{remaining(finishAt) ?? 'birazdan biter…'}</span>
        {label ? <span className="min-w-0 flex-1 truncate text-muted">{label}</span> : <span className="flex-1" />}
        {right}
        {canCancel && onCancel ? (
          <Button size="sm" variant="danger" disabled={cancelling} onClick={onCancel}>İptal et</Button>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full border border-border bg-raised">
        <div className="h-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * ⭐ SUR ONARILIYOR satırı (§13.21.2, kullanıcı 2026-07-30).
 *
 * `ProgressRow`dan ayrı, çünkü buradaki yüzde ZAMANIN değil BÜTÜNLÜĞÜN yüzdesi: sur onarım
 * başındaki orandan 1'e doğrusal yürür (`wallCurrentIntegrity`) ve savaş gelirse o anki
 * değerle savaşır — çubuk oyuncuya tam da o savaş-değerini gösteriyor. İptal edilemez.
 */
function WallRepairRow({ repair }: { repair: { integrity: number; from: string | null; until: string } }) {
  useTick();
  /**
   * ⚠️⚠️ `gameNow()` ŞART. `repair.from`/`repair.until` oyun saatinde yazılıyor
   * (`battle.handlers.ts`); `serverNow()` ile okumak bütünlüğü dünyanın toplam duraklama
   * süresi kadar İLERİDEN gösteriyordu. Ve bu sayı süs değil: hemen yanında *"saldırı gelirse
   * bu oranla savaşır"* yazıyor — yani oyuncu savaş kararını yanlış sayıya bakarak veriyordu.
   */
  const now = new Date(gameNow());
  const current = wallCurrentIntegrity(
    repair.integrity, repair.from ? new Date(repair.from) : null, new Date(repair.until), now,
  );
  return (
    <div className="mt-1.5 border-t border-border pt-1.5">
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        <span className="text-warning">Sur onarılıyor</span>
        <span className="tnum font-semibold text-warning">{remaining(repair.until) ?? 'birazdan biter…'}</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          bütünlük <b className="tnum text-ink">%{Math.round(current * 100)}</b> — saldırı gelirse bu oranla savaşır
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full border border-border bg-raised">
        <div className="h-full bg-warning transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(current * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * İptal onayı — **geri alınamayacak tutarı** hesaplayıp gösterir.
 * Kural katalogdan (`cancelRefund`): yapı/teknik **süreye göre**, adetli kalem **bir birim eksik**.
 */
function useCancelWithConfirm(): (q: {
  id: number; label: string; count: number | null;
}) => Promise<void> {
  const confirm = useConfirm();
  const cancel = useCancelQueue();

  return async (q) => {
    /**
     * ⚠️ RAKAM YOK (kullanıcı, 2026-08-03): *"Ekranda görünen değerle iptal onayını verildiği
     * anda farklılık olur. Sadece bilgilendirme olması yeterli."*
     *
     * Burada `cancelRefund` istemcide çalıştırılıp "geri alamayacağın kaynak" ve "iade
     * edilecek" kutuları çiziliyordu. Gerçek iade **sunucuda, onay anında** yeniden
     * hesaplanıyor (`queue.service.ts`) ve arada geçen saniyeler ilerlemeyi değiştirdiği için
     * iki sayı kaçınılmaz olarak ayrışıyordu. Kural cümlesi kalıyor, tahmin gidiyor.
     */
    const ok = await confirm({
      title: `${q.label} iptal edilsin mi?`,
      danger: true,
      confirmLabel: 'İptal et',
      body: (
        <p className="text-sm">
          {q.count != null
            ? 'Üretimi biten birimler şehirde kalır. Kalan siparişin bedeli iade edilir; '
              + 'iadeden bir birimin bedeli düşülür.'
            : 'Harcanan kaynağın tamamlanmamış kısmı iade edilir; geçen süreye karşılık gelen '
              + 'kısım geri verilmez.'}
        </p>
      ),
    });
    if (ok) cancel.mutate(q.id);
  };
}

/** Bir kalem için o şehirde süren kuyruk satırı (varsa). */
const queueFor = (city: CityDetail, category: string, itemType: string): QueueRow | undefined =>
  city.queues.find((q) => q.category === category && q.itemType === itemType);

/*
 * ⚠️ Burada `spentOf()` vardı — iptal onayında "kaybedilecek kaynak" hesabı için. 2026-08-03'te
 * onay metninden rakamlar kaldırılınca (kullanıcı: *"ekranda görünen değerle iptal onayı
 * verildiği anda farklılık olur"*) tek çağıranı kalmadı ve silindi. İadenin gerçek hesabı
 * zaten hep sunucudaydı: `queue.service.ts` → `cancelRefund`.
 */

/* ── Yapılar ────────────────────────────────────────────────────────────────── */

/**
 * Bir yapının bilgi kutusu: açıklama metni + (üreten yapılarda) saatlik üretim.
 *
 * ⚠️ Üretim rakamları SUNUCUDAN (`b.production`) — istemcide hesaplanmıyor. Oranlar panelden
 * ayarlanabiliyor ve dünyanın kaynak çarpanı var; ikinci bir hesap yeri açmak, yönetici oranı
 * değiştirdiği anda ekranın yalan söylemesi demekti (`city.controller.ts`teki aynı kural).
 *
 * ⚠️ Açıklaması olmayan yapı için `null` döner ve `ItemName` o satırda hiç düğme çizmez —
 * boş bir kutu açan bir düğmeden iyidir.
 */
function BuildingInfo({ b }: { b: CatalogBuilding }): React.ReactElement | null {
  const text = BUILDING_INFO[b.id];
  const p = b.production;
  if (!text && !p) return null;

  const unit = b.id === 'farm' ? 'yemek' : 'altın';
  return (
    <>
      {text ? <span className="block">{text}</span> : null}
      {p ? (
        <span className="mt-2 block space-y-0.5 border-t border-border pt-1.5">
          <PopoverRow label={`Şu an (sv ${b.level})`} value={`${fmt(p.perHour)} ${unit} / saat`} />
          {/* Tavandaki yapıda "sonraki seviye" yok — satırı hiç çizme, «—» yazma. */}
          {p.nextPerHour != null ? (
            <PopoverRow label={`Sonraki seviye (sv ${b.level + 1})`}
              value={`${fmt(p.nextPerHour)} ${unit} / saat`} />
          ) : null}
        </span>
      ) : null}
    </>
  );
}

function Buildings({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const askCancel = useCancelWithConfirm();
  const busy = city.queues.some((q) => q.category === 'building');
  const [caveOpen, setCaveOpen] = useState(false);
  const cancelCave = useCancelCaveJob(cityId);
  const cave = city.cave;
  /**
   * ⭐ MAĞARA MEŞGULSE seviye ilerletilemez (§13.20): onarımdaysa ya da içine/dışına asker
   * taşınıyorsa. Sunucu da reddediyor; düğmeyi burada da kapatmak oyuncuyu hata mesajıyla
   * karşılaşmadan bilgilendiriyor (ön-şart düğmesindeki kararın aynısı).
   */
  const caveLocked = cave.repairing || cave.job != null;
  /**
   * ⭐ Karşılıklı kilidin YAPI YÖNÜ (§13.11.5a): o şehirde asker üretimi (kuyruktakiler dahil)
   * varken Baraka, araştırma varken Akademi yükseltilemez. ⚠️ `city.queues` yalnız AÇIK
   * satırları taşıyor (`openQueues`) → iptal/bitiş kilidi kendiliğinden çözer.
   */
  const unitBusy = city.queues.some((q) => q.category === 'unit');
  const techBusy = city.queues.some((q) => q.category === 'tech');
  const mutexOf = (id: string): string | null => {
    if (id === 'barracks' && unitBusy) return 'Asker üretimi sürerken Baraka yükseltilemez.';
    if (id === 'academy' && techBusy) return 'Araştırma sürerken Akademi yükseltilemez.';
    return null;
  };

  return (
    <Panel title="Yapılar">
      <div className="px-3 pt-2"><ErrorBox error={enqueue.error} /></div>
      <ul className="divide-y divide-border">
        {(catalog.data?.buildings ?? []).map((b, i) => {
          const maxed = b.level >= b.maxLevel;
          /**
           * ⭐ §verify — doğrulanmamış hesabın tavanı. Sunucu da reddediyor; buradaki amaç
           * oyuncuya düğmeye BASTIKTAN sonra değil, basmadan ÖNCE söylemek.
           * ⚠️ `>=` (sunucudaki kuralın aynısı): tavana ulaşan ilerleyemez.
           */
          const capped = catalog.data?.verify != null && b.level >= catalog.data.verify.maxBuildingLevel;
          const cost = b.nextCost;
          const afford = !!cost && city.resources.gold >= cost.gold && city.resources.food >= cost.food;
          const unmet = (b.requirementNames ?? []).some((r) => {
            const have = r.kind === 'building' ? (city.buildings[r.id] ?? 0) : (city.techs[r.id] ?? 0);
            return have < r.level;
          });
          const q = queueFor(city, 'building', b.id);
          const mutex = mutexOf(b.id);
          return (
            <li key={b.id} className={`px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <CatalogIcon kind="buildings" id={b.id} alt={b.name} />
                <div className="min-w-0 flex-1">
                  {/* ⭐ Mağara adı TIKLANABİLİR: doldurma/boşaltma modalının girişi burasıdır
                      (doküman: "Yapılar menüsünde … mağaraya asker doldurma"). Bu ekranda
                      tıklanabilir tek ad odur; `ItemName` kopyalanmıyor, tek bileşen. */}
                  <ItemName
                    name={b.name} value={b.level}
                    onClick={b.id === 'cave' && b.level > 0 ? () => setCaveOpen(true) : undefined}
                    info={<BuildingInfo b={b} />}
                    right={b.id === 'cave' && b.level > 0 ? (
                      <span className="tnum text-[11px] text-muted">
                        {fmt(cave.usedArea)} / {fmt(cave.capacity)} alan
                      </span>
                    ) : undefined}
                  />
                  {cost ? <CostLine gold={cost.gold} food={cost.food} seconds={b.nextSeconds} /> : null}
                  <Requirements requirementNames={b.requirementNames}
                    buildings={city.buildings} techs={city.techs} />
                  {capped ? <VerifyCap max={catalog.data!.verify!.maxBuildingLevel} /> : null}
                  {mutex ? <LockNote text={mutex} /> : null}
                </div>
                {/* ⚠️ Ön-şart eksikse düğme PASİF — hata mesajıyla karşılaşmadan görülmeli. */}
                <Button size="sm"
                  disabled={maxed || capped || busy || !afford || unmet || enqueue.isPending
                    || (b.id === 'cave' && caveLocked) || mutex != null}
                  onClick={() => enqueue.mutate({ category: 'building', type: b.id })}>
                  {maxed ? '—' : `sv ${b.level + 1}`}
                </Button>
              </div>
              {/* ⭐ Mağaranın taşıma ve onarım geri sayımları da tam burada — seviye ilerletme
                  çubuğuyla AYNI yerde, çünkü oyuncu "mağara ne yapıyor" sorusunu tek noktaya
                  bakarak cevaplayabilmeli. İkisi de İPTAL EDİLEMEZ. */}
              {b.id === 'cave' && cave.job ? (
                <ProgressRow
                  startedAt={cave.job.startedAt} finishAt={cave.job.finishAt}
                  cancelling={cancelCave.isPending}
                  onCancel={() => cancelCave.mutate()}
                  label={cave.job.direction === 'store'
                    ? `mağaraya girecek · ${fmt(cave.job.area)} alan`
                    : `mağaradan çıkacak · ${fmt(cave.job.area)} alan`}
                />
              ) : null}
              {b.id === 'cave' && cave.repairing && cave.repairUntil ? (
                <ProgressRow
                  /* Onarımın BAŞLANGICI saklanmıyor (gereksiz sütun): bitişten toplam süreyi
                     geri sayarak türetiliyor — çubuk böylece gerçek ilerlemeyi gösteriyor. */
                  startedAt={new Date(
                    Date.parse(cave.repairUntil) - caveRepairSeconds(cave.level) * 1000,
                  ).toISOString()}
                  finishAt={cave.repairUntil}
                  canCancel={false} label="mağara onarılıyor"
                />
              ) : null}
              {q ? (
                <ProgressRow
                  startedAt={q.startedAt} finishAt={q.finishAt}
                  label={`seviye ${q.targetLevel}`}
                  onCancel={() => void askCancel({
                    id: q.id, label: b.name, count: null,
                  })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {caveOpen ? (
        <CaveModal city={city} cave={cave} onClose={() => setCaveOpen(false)} />
      ) : null}
    </Panel>
  );
}

/* ── Baraka: üstteki "Sürüyor" paneli ───────────────────────────────────────── */

/**
 * ⭐ Katlama durumu **cihaz hafızasında** (kullanıcı kararı): tek anahtar, tüm şehirler için
 * geçerli. Şehir başına saklamak "bir şehirde kapattım, diğerinde yine açık" sürtünmesi yaratırdı.
 */
const COLLAPSE_KEY = 'mw-barracks-collapsed';

function useCollapsed(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  return [v, (next: boolean) => {
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    setV(next);
  }];
}

/**
 * ⭐ ÜRETİM BANDININ İSTEMCİDE TÜRETİLMESİ (2026-07-28, kullanıcının bildirdiği hata)
 *
 * **Hata neydi:** bir askerin üretimi bitince çubuk %100'de donuyor, geri sayım "birazdan"da
 * kalıyor ve **bir sonraki sunucu okumasına kadar** yenilenmiyordu. Yoklama 5 sn'den 60 sn'ye
 * indirildiği için bu kusur bir anlık takılmadan **bir dakikalık donmaya** dönüştü.
 *
 * **Neden WS ile çözülmedi:** üretim **tembeldir** (§3, tick YOK). Sunucu bir askerin üretildiğini
 * ancak şehir okunduğunda "fark eder"; bu yüzden asker başına olay yayınlayabilmesi için her aktif
 * kuyruğa bir zamanlayıcı koymak, yani mimarinin temel kararını geri almak gerekirdi.
 *
 * **Neden asker başına fetch de değil:** 9 sn'lik Cüce siparişinde dakikada ~7 istek, yüksek
 * Baraka'da 1 sn'lik birimde **dakikada 60 istek** ederdi.
 *
 * **Çözüm — sıfır maliyet:** bant **tamamen deterministik**. `startedAt` ve `perUnitSeconds`
 * biliniyorsa k'ıncı asker `startedAt + k × perUnit` anında biter. İstemci sunucunun kullandığı
 * FORMÜLÜN AYNISINI çalıştırıyor; hiçbir istek atmadan, saniyesi saniyesine.
 * (Kaynak sayacındaki ekstrapolasyon kararının aynısı.)
 *
 * ⚠️ `q.done`/`q.remaining` **kullanılmıyor**: onlar sunucunun son okuma anındaki hâli, yani
 * tanımı gereği bayat. Çıpa `startedAt` — o hiç bayatlamaz.
 */
interface UnitProgress {
  /** Şimdiye kadar üretilmiş adet. */
  produced: number;
  /** Kalan sipariş. */
  remaining: number;
  /** Sıradaki tek askerin penceresi (ms). */
  unitStart: number;
  unitEnd: number;
  /** Siparişin tamamı bitti (sunucudaki bitiş görevi birazdan satırı kapatacak). */
  finished: boolean;
}

function unitProgress(q: QueueRow, now: number): UnitProgress | null {
  const perMs = (q.perUnitSeconds ?? 0) * 1000;
  const count = q.count ?? 0;
  if (perMs <= 0 || count <= 0) return null;
  const start = Date.parse(q.startedAt);
  const produced = Math.min(count, Math.max(0, Math.floor((now - start) / perMs)));
  const unitStart = start + produced * perMs;
  return {
    produced,
    remaining: count - produced,
    unitStart,
    unitEnd: unitStart + perMs,
    finished: produced >= count,
  };
}

/**
 * Barakadaki **toplam** adet (satırlardaki "Elf (407)") yalnız sunucudan gelir; onu da türetmek
 * ordu göndermek gibi kararların dayandığı sayıyı tahmine çevirirdi.
 *
 * Bunun yerine: bir asker sınırı geçildiğinde **kısılmış** bir tazeleme tetiklenir. Kısıt şart —
 * 1 sn'lik birimlerde dakikada 60 istek çıkardı. `MIN_SYNC_MS` ile en fazla 5 saniyede bir
 * istenir, yani eski kör yoklamayla aynı üst sınır ama **yalnız gerçekten üretim varken** ve
 * yalnız bant ekrandayken.
 */
const MIN_SYNC_MS = 5000;

function useProductionSync(producedTotal: number): void {
  const qc = useQueryClient();
  const last = useRef({ produced: producedTotal, at: 0 });
  useEffect(() => {
    if (producedTotal === last.current.produced) return;
    last.current.produced = producedTotal;
    const now = Date.now();
    if (now - last.current.at < MIN_SYNC_MS) return;
    last.current.at = now;
    void qc.invalidateQueries({ queryKey: ['city'] });
  }, [producedTotal, qc]);
}

/**
 * ⭐ TEK ÜRETİM BANDI paneli — verilen emirler sırayla listelenir.
 *
 * Sayaç **tek bir askerin** süresidir (kullanıcı kararı): dolunca o asker barakaya eklenir,
 * kalan adet bir azalır, çubuk baştan başlar. Toplam süre hiçbir yerde geri saymaz — fabrika
 * bandını izliyorsun, siparişin tamamını değil.
 *
 * Bekleyen emirler **saymaz**: bant boşalana kadar "sırada" yazar ve ne zaman başlayacağını
 * söyler.
 */
function ProductionPanel({
  city, queues, onCancel, onMove, noun = 'asker', limit, art = 'units',
}: {
  city: CityDetail;
  queues: QueueRow[];
  onCancel: (q: QueueRow) => void;
  onMove: (queueId: number, direction: 'up' | 'down') => void;
  /** Savunmada "asker" değil "birim" denir — aynı bant, farklı kelime. */
  noun?: string;
  limit: number;
  /** ⚠️ Görsel klasörü: savunma birimlerinin resmi `assets/defenses/` altında. */
  art?: 'units' | 'defenses';
}) {
  const [collapsed, setCollapsed] = useCollapsed();
  /**
   * ⚠️⚠️ `gameNow()` — burada `serverNow()` vardı ve **canlıda görünen bir hataydı**.
   * `q.startedAt` oyun saatinde; `unitProgress` üretilen adedi `(now − start) / perUnit` ile
   * sayıyor. Gerçek saatle okununca her sayaç dünyanın toplam duraklama süresi kadar ileri
   * gidiyordu (canlıda ~196 sn) → `perUnitSeconds` bundan küçük olan birimlerde bant
   * **kalıcı olarak "sipariş tamamlandı"** gösteriyor, üstelik `useProductionSync` sunucuyla
   * çelişen bir sayı görüp boşuna tazeleme tetikliyordu.
   */
  const now = gameNow();

  // Süren emirlerin toplam üretimi — değiştiği anda (kısılmış) tazeleme tetikler.
  const progress = new Map<number, UnitProgress | null>();
  // Bantta BEKLEYEN emir sayısı (üretimi süren hariç) — sıralama oklarının koşulu.
  const waiting = queues.filter((q) => (q.position ?? 1) !== 1).length;
  let producedTotal = 0;
  for (const q of queues) {
    const p = (q.position ?? 1) === 1 ? unitProgress(q, now) : null;
    progress.set(q.id, p);
    if (p) producedTotal += p.produced;
  }
  useProductionSync(producedTotal);

  if (queues.length === 0) return null;

  return (
    <Panel
      title="Üretim bandı"
      right={
        <button onClick={() => setCollapsed(!collapsed)}
          className="text-[11px] text-on-panel-header/85 hover:text-on-panel-header">
          {queues.length}/{limit} emir · {collapsed ? 'göster ▾' : 'gizle ▴'}
        </button>
      }
    >
      {collapsed ? null : (
        <ul className="divide-y divide-border">
          {queues.map((q, i) => {
            const active = (q.position ?? 1) === 1;
            const p = progress.get(q.id) ?? null;
            // ⭐ Kalan adet TÜRETİLİR; `q.remaining` sunucunun son okuma anındaki bayat hâli.
            const remaining = p ? p.remaining : (q.remaining ?? q.count ?? 0);
            return (
              <li key={q.id} className={`px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                {/* ⭐ MOBİL: kontroller sığmazsa alt satıra sağa yaslı iner (flex-wrap). */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <CatalogIcon kind={art} id={q.itemType} size={40} alt={q.itemType} />
                  <div className="min-w-0 flex-1 basis-32">
                    <ItemName name={nameOf(q.itemType)} value={fmt(remaining)} />
                    <div className="text-[11px] text-muted">
                      {active
                        ? <>sırada üretiliyor · <span className="tnum">{remaining}</span> {noun} kaldı</>
                        : <>bant boşalınca başlar · <span className="tnum">{remaining}</span> {noun}</>}
                    </div>
                  </div>
                  {/**
                    * ⭐ Sıralama okları YALNIZ **en az iki bekleyen** emir varken görünür
                    * (kullanıcı, 2026-07-29). Tek bekleyen emirde zaten gidecek başka yer yok;
                    * ok göstermek "bir işe yarar" izlenimi verip tıklayınca hiçbir şey
                    * yapmıyordu.
                    */}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {!active && waiting > 1 ? (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <span className="tnum mr-1 text-[11px] text-muted">sıra {q.position}</span>
                        <Button size="sm" variant="ghost" title="Yukarı"
                          onClick={() => onMove(q.id, 'up')}>↑</Button>
                        <Button size="sm" variant="ghost" title="Aşağı"
                          onClick={() => onMove(q.id, 'down')}>↓</Button>
                      </span>
                    ) : !active ? (
                      <span className="tnum shrink-0 text-[11px] text-muted">sıra {q.position}</span>
                    ) : null}
                    <Button size="sm" variant="danger" onClick={() => onCancel(q)}>İptal et</Button>
                  </span>
                </div>

                {active && p ? (
                  <UnitTicker start={p.unitStart} end={p.unitEnd} finished={p.finished} noun={noun} />
                ) : (
                  <div className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-muted">
                    Başlıyor: <span className="tnum">{remaining_(q.startedAt)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** "Şu an" geçmişse boş dönmesin diye küçük sarmalayıcı. */
const remaining_ = (iso: string): string => remaining(iso) ?? 'birazdan';

/**
 * TEK BİR ASKERİN sayacı + çubuğu.
 *
 * ⚠️ Pencere artık **istemcide türetiliyor** (bkz. `unitProgress`): asker bitince sayaç sunucuyu
 * beklemeden sıfırlanıp bir sonrakine geçer. Eskiden sunucudan gelen `unitStartedAt/FinishAt`
 * kullanılıyordu ve iki okuma arasında çubuk %100'de donuyordu.
 *
 * ⭐ Çubuk yeni askere geçerken **animasyon kapatılır** (`transition-none`): %100'den %0'a
 * yumuşak geçiş, dolmuş çubuğun geri sarması gibi görünüyordu.
 */
function UnitTicker({ start, end, finished, noun = 'asker' }: {
  start: number; end: number; finished: boolean; noun?: string;
}) {
  // ⚠️ `start`/`end` `unitProgress`ten geliyor, o da oyun saatindeki `startedAt`ten türüyor →
  // burada da OYUN saati. `serverNow()` ile okunduğunda sayaç hep sıfır çıkıyordu.
  const now = gameNow();
  const pct = finished ? 100 : Math.min(100, Math.max(0, ((now - start) / Math.max(1, end - start)) * 100));
  const left = Math.max(0, (end - now) / 1000);
  // Yeni pencerenin ilk saniyesinde çubuk geri sarmasın diye geçiş kapatılır.
  const resetting = !finished && now - start < 1200;
  return (
    <div className="mt-1.5 border-t border-border pt-1.5">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted">sıradaki {noun}</span>
        <span className="tnum font-semibold text-warning">
          {finished ? 'sipariş tamamlandı' : formatDuration(left)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full border border-border bg-raised">
        <div className={`h-full bg-accent ${
          resetting ? 'transition-none' : 'transition-[width] duration-1000 ease-linear'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Baraka / Savunma ───────────────────────────────────────────────────────── */

function Trainable({ city, kind }: { city: CityDetail; kind: 'unit' | 'defense' }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const move = useMoveQueue();
  const askCancel = useCancelWithConfirm();
  const [counts, setCounts] = useState<Record<string, string>>({});

  const list: CatalogUnit[] = (kind === 'unit' ? catalog.data?.units : catalog.data?.defenses) ?? [];
  const have = kind === 'unit' ? city.units : city.defenses;
  /**
   * ⚠️ Ön-şartta geçen "yapı" seviyesi `buildings` + **seviye taşıyan savunma yapıları**.
   * Sur `defenses` tablosunda yaşıyor ama ön-şartta bir YAPI olarak yazılı; yalnız `buildings`e
   * bakmak Sur'u daima 0 gösteriyordu ve Sur ön-şartlı her savunma birimi kilitli kalıyordu
   * (sunucu tarafındaki ikiziyle aynı hata — `queue.service.ts:structureLevels`).
   */
  const structureLevels: Record<string, number> = {
    ...city.buildings,
    wall: city.defenses['wall'] ?? 0,
    magic_shield: city.defenses['magic_shield'] ?? 0,
  };
  /**
   * ⭐ SAVUNMADA DA İKİ ŞERİT (§13.21.3, kullanıcı isteği 2026-07-29).
   *
   * `target_level` taşıyan satırlar **Sur / Büyü Kalkanı** yükseltmesidir: kendi satırlarında
   * ilerler ve birim üretiminden BAĞIMSIZ akar. Kalanlar Baraka'dakiyle aynı **tek banda**
   * girer ve üstteki panelde sırayla listelenir.
   */
  const all = city.queues.filter((q) => q.category === kind);
  const structureQueues = all.filter((q) => q.targetLevel != null);
  const queues = all.filter((q) => q.targetLevel == null)
    .sort((a, b) => (a.position ?? 1) - (b.position ?? 1));

  // Sur onarımı sürüyor mu? (sv butonu kilidi + satır içi gösterge)
  // ⚠️ `gameNow()`: `until` oyun saatinde. `serverNow()` ile kilit erken açılıyor, oyuncu
  // «sv.» düğmesine basıyor ve sunucu reddediyordu — istemci ile sunucu aynı fikirde olmalı.
  const wallRepairing = kind === 'defense' && city.wallRepair != null
    && Date.parse(city.wallRepair.until) > gameNow();

  /**
   * ⭐ Karşılıklı kilidin ÜRETİM YÖNÜ (§13.11.5a): bu şehirde Baraka yükseltiliyorsa savaşçı
   * üretilemez. ⚠️ Yalnız `kind === 'unit'` — savunma birimlerinin ön-şartı Sur/Kale, Baraka
   * değil, dolayısıyla Baraka yükseltmesi onları HİÇ etkilemez (sunucudaki kararın aynısı).
   */
  const barracksUpgrading = kind === 'unit'
    && city.queues.some((q) => q.category === 'building' && q.itemType === 'barracks');

  // Emir sınırı: savaşçıda Baraka, savunma biriminde Sur (savunma birimleri surda yaşar).
  const bandLimit = Math.max(1, kind === 'unit'
    ? (city.buildings['barracks'] ?? 1)
    : (city.defenses['wall'] ?? 1));
  const slotsFull = queues.length >= bandLimit;

  return (
    <>
      {/* ⭐ Süren birim emirleri ÜSTTEKİ panelde, tek bant sırasıyla (kullanıcı kararı). */}
      {queues.length > 0 ? (
        <ProductionPanel
          city={city}
          queues={queues}
          noun={kind === 'unit' ? 'asker' : 'birim'}
          art={kind === 'unit' ? 'units' : 'defenses'}
          limit={bandLimit}
          onMove={(queueId, direction) => move.mutate({ queueId, direction })}
          onCancel={(q) => {
            const u = list.find((x) => x.id === q.itemType);
            void askCancel({ id: q.id, label: u?.name ?? q.itemType, count: q.count });
          }}
        />
      ) : null}

    <Panel
      title={kind === 'unit' ? 'Baraka' : 'Savunma'}
      right={`${queues.length}/${bandLimit} emir`}
    >
      <div className="px-3 pt-2">
        <ErrorBox error={enqueue.error} />
        {/* Kilit BÜTÜN satırları kapsıyor → uyarı satır satır tekrarlanmaz, panelin başında. */}
        {barracksUpgrading ? (
          <LockNote text="Baraka yükseltiliyor; bitene kadar asker üretilemez." />
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {list.map((u, i) => {
          const n = Number(counts[u.id] ?? '') || 0;
          const levelBased = u.levelBased === true;
          const total = levelBased
            ? { gold: u.cost.gold, food: u.cost.food, seconds: u.seconds }
            : { gold: u.cost.gold * n, food: u.cost.food * n, seconds: (u.seconds ?? 0) * n };
          const afford = city.resources.gold >= total.gold && city.resources.food >= total.food;
          const unmet = (u.requirementNames ?? []).some((r) => {
            const lv = r.kind === 'building' ? (structureLevels[r.id] ?? 0) : (city.techs[r.id] ?? 0);
            return lv < r.level;
          });
          /**
           * ⭐ §verify — savunmada İKİ AYRI kural (sunucudakinin aynısı):
           *   • Sur / Büyü Kalkanı (`levelBased`) → seviye tavanı
           *   • adetli savunma birimi           → **tamamen** yasak (kullanıcı şartı)
           * Savaşçı tarafında (`kind === 'unit'`) tavan TOPLAM sayıya bağlı; onu istemcide
           * hesaplamıyoruz (mağara + yoldaki + kuyruk toplamı sunucuda) → sunucu reddi kalıyor.
           */
          const caps = catalog.data?.verify ?? null;
          const capped = caps != null && kind === 'defense'
            && (levelBased ? (have[u.id] ?? 0) >= caps.maxDefenseLevel : true);

          return (
            <li key={u.id} className={`px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              {/* ⭐ MOBİL (kullanıcı 2026-07-30): satır dar ekranda İKİ KATLI — üstte ikon +
                  ad/maliyet, altta sağa yaslı adet + Üret. `sm:`de eski tek satır düzeni. */}
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
                <CatalogIcon kind={kind === 'unit' ? 'units' : 'defenses'} id={u.id} alt={u.name} />
                <div className="min-w-0 flex-1">
                  <ItemName name={u.name} value={levelBased ? `sv ${have[u.id] ?? 0}` : fmt(have[u.id] ?? 0)} />
                  {/* ⭐ Orijinal Baraka kartında birimin MAĞARADAKİ adedi de yazıyor
                      (`images/scr_web01`: "Mağarada : 0"). Yalnız 0'dan büyükse çizilir —
                      mağarası olmayan oyuncunun her satırında sıfır görmesi gürültü olurdu. */}
                  {!levelBased && (city.cave.units[u.id] ?? 0) > 0 ? (
                    <div className="text-[11px] text-muted">
                      Mağarada: <b className="tnum text-ink">{fmt(city.cave.units[u.id]!)}</b>
                    </div>
                  ) : null}
                  <CostLine gold={u.cost.gold} food={u.cost.food} seconds={u.seconds ?? null} />
                  <Requirements requirementNames={u.requirementNames}
                    buildings={structureLevels} techs={city.techs} />
                  {capped ? (
                    levelBased
                      ? <VerifyCap max={caps!.maxDefenseLevel} />
                      : (
                        <div className="mt-0.5 text-[11px] text-warning">
                          E-posta doğrulaması gerekli.
                        </div>
                      )
                  ) : null}
                </div>
                <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
                  {levelBased ? null : (
                    <AmountInput min={1} placeholder="adet"
                      value={counts[u.id] ?? ''}
                      onChange={(e) => setCounts({ ...counts, [u.id]: e.target.value })} />
                  )}
                  <Button size="sm"
                    disabled={unmet || slotsFull || enqueue.isPending || capped
                      || barracksUpgrading
                      || (!levelBased && (n <= 0 || !afford)) || (levelBased && !afford)
                      /* ⭐ Onarımdaki Sur yükseltilemez (kullanıcı, 2026-07-30). */
                      || (u.id === 'wall' && wallRepairing)}
                    onClick={() => enqueue.mutate(
                      { category: kind, type: u.id, ...(levelBased ? {} : { count: n }) },
                      // ⭐ Emir kabul edilince adet kutusu boşalır (kullanıcı, 2026-07-29):
                      //    kalan sayı "hâlâ bir şey seçili" izlenimi veriyor ve yanlışlıkla
                      //    ikinci kez üretmeye davet ediyordu. Hata olursa değer KORUNUR.
                      { onSuccess: () => setCounts((c) => ({ ...c, [u.id]: '' })) },
                    )}>
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

              {/* ⚠️ Adetli birimlerin ilerlemesi SATIRDA DEĞİL üstteki "Üretim bandı" panelinde:
                  tek bant sırayla işlediği için sıralı tek liste doğru yer. Satır içi ilerleme
                  yalnız SEVİYE taşıyan Sur / Büyü Kalkanı'nda kalıyor — onlar banda girmez ve
                  birim üretimiyle paralel akar (§13.21.3). */}
              {/* ⭐ SUR ONARIMI (§13.21.2): geri sayım + progress bar + o anki bütünlük.
                  Onarım İPTAL EDİLEMEZ → iptal butonu yok; süre dolunca sur tam sağlam. */}
              {u.id === 'wall' && city.wallRepair ? (
                <WallRepairRow repair={city.wallRepair} />
              ) : null}
              {levelBased ? structureQueues.filter((q) => q.itemType === u.id).map((q) => (
                <ProgressRow
                  key={q.id}
                  startedAt={q.startedAt} finishAt={q.finishAt}
                  label={q.count ? <span className="tnum">{fmt(q.count)} adet</span> : `seviye ${q.targetLevel}`}
                  onCancel={() => void askCancel({
                    id: q.id, label: u.name, count: q.count,
                  })}
                />
              )) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
    </>
  );
}

/* ── Akademi ────────────────────────────────────────────────────────────────── */

function Techs({ city }: { city: CityDetail }) {
  const { cityId } = useActiveCity();
  const catalog = useCatalog(cityId);
  const enqueue = useEnqueue(cityId);
  const askCancel = useCancelWithConfirm();
  const busyHere = city.queues.some((q) => q.category === 'tech');
  /**
   * ⭐ Karşılıklı kilidin ARAŞTIRMA YÖNÜ (§13.11.5a): bu şehirde Akademi yükseltiliyorsa
   * araştırma açılamaz. ⚠️ `city.queues` bu ŞEHRİN kuyruğu — başka şehrin akademisi
   * yükseltilirken buradan araştırma açmak serbest (kullanıcının şartı şehir başına).
   */
  const academyUpgrading = city.queues.some(
    (q) => q.category === 'building' && q.itemType === 'academy',
  );

  /** Hangi teknik nerede araştırılıyor — TÜM şehirler (Akademiler ortak). */
  const byTech = new Map<string, TechQueueRow>();
  for (const q of city.techQueues ?? []) byTech.set(q.itemType, q);

  return (
    <Panel title="Akademi">
      <div className="px-3 pt-2">
        <ErrorBox error={enqueue.error} />
        {/* Kilit BÜTÜN tekniklere işliyor → uyarı satır satır değil, panelin başında. */}
        {academyUpgrading ? (
          <LockNote text="Akademi yükseltiliyor; bitene kadar teknik araştırılamaz." />
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {(catalog.data?.techs ?? []).map((t, i) => {
          const afford = city.resources.gold >= t.nextCost.gold && city.resources.food >= t.nextCost.food;
          const unmet = (t.requirementNames ?? []).some((r) => {
            const lv = r.kind === 'building' ? (city.buildings[r.id] ?? 0) : (city.techs[r.id] ?? 0);
            return lv < r.level;
          });
          const q = byTech.get(t.id);
          // İptal YALNIZ araştırmayı başlatan şehirden (kullanıcı kuralı).
          const mineHere = q?.cityId === city.id;
          const caps = catalog.data?.verify ?? null;
          const capped = caps != null && t.level >= caps.maxTechLevel;   // §verify, «≥»
          return (
            <li key={t.id} className={`px-3 py-2 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <CatalogIcon kind="techs" id={t.id} alt={t.name} />
                <div className="min-w-0 flex-1">
                  <ItemName name={t.name} value={t.level} />
                  <CostLine gold={t.nextCost.gold} food={t.nextCost.food} seconds={t.nextSeconds} />
                  <Requirements requirementNames={t.requirementNames}
                    buildings={city.buildings} techs={city.techs} />
                  {capped ? <VerifyCap max={caps.maxTechLevel} what="Araştırma" /> : null}
                </div>
                <Button size="sm"
                  disabled={busyHere || academyUpgrading || !!q || !afford || unmet
                    || enqueue.isPending || capped}
                  onClick={() => enqueue.mutate({ category: 'tech', type: t.id })}>
                  sv {t.level + 1}
                </Button>
              </div>
              {q ? (
                <ProgressRow
                  startedAt={q.startedAt} finishAt={q.finishAt}
                  label={<>seviye {q.targetLevel}{mineHere ? '' : ` · ${q.cityName}`}</>}
                  canCancel={mineHere}
                  onCancel={() => void askCancel({
                    id: q.id, label: t.name, count: null,
                  })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
