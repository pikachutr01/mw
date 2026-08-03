/**
 * ⭐ DÜNYA HEDEF MODALI — oyunun **tek görev başlatma kapısı**.
 *
 * Doküman (DÜNYA): *"tüm görev seçenekleri de (saldırı, nakliye, casusluk, destek, şehir kurma
 * ve teleport) yalnızca dünya menüsünden yapılabilir"*. Bu yüzden akış tek modalda çözülüyor:
 *
 *   1. **Seçenek listesi** — hedefin türüne göre sunucudan gelir (`GET /missions/options`).
 *      İstemci "kime ne gönderilebilir"i KENDİ hesaplamaz; hesaplasaydı kural iki yerde yaşar
 *      ve kaçınılmaz olarak kayardı (maliyet/süre kuralıyla aynı ilke).
 *   2. **Görev formu** — seçilen tipe göre ordu ve/veya kargo seçimi, mesafe/süre önizlemesi.
 *      Geri düğmesiyle 1. adıma dönülür; modal kapanmaz.
 *
 * Kapalı seçenek **gizlenmez**, sebebiyle gösterilir — oyuncu neden yapamadığını görmeli.
 */
import { useState } from 'react';
import { armySpeed, route, travelSeconds } from '@mobilwar/engine';
import { fmt, formatDuration, remaining, useTick } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useOpenChat } from '../lib/chat-context.tsx';
import {
  useAlliance, useAllianceInvite, useCatalog, useCity, useMissionOptions, useSendMission,
  useTemple, type MissionOption, type WorldSlot,
} from '../lib/queries.ts';
import { AmountInput, Badge, Button, Empty, ErrorBox, MissionIcon } from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';

/**
 * Görev tipi → ekranda görünen ad ve simge (§13.14: İngilizce id görünmez).
 *
 * ⚠️ **Açıklama metinleri KALDIRILDI** (kullanıcı, 2026-07-28): kural anlatan uzun paragraflar
 * formu boğuyordu. Kuralların ayrıntısı ayrı bir yardım sayfasına gelecek; formda yalnız
 * oyuncunun O AN karar vermek için ihtiyaç duyduğu **sayı** var (ör. kalan saldırı hakkı).
 * Seçenek listesinde ise `hint` kısa bir tanıtım cümlesi olarak duruyor.
 */
const MISSION_INFO: Record<string, { title: string; hint: string; icon: string }> = {
  attack: { title: 'Saldırı', icon: 'attack', hint: 'Orduyu hedefe gönder.' },
  spy: { title: 'Casusluk', icon: 'spy_out', hint: 'Casus kuşlarla bilgi topla.' },
  transport: { title: 'Nakliye', icon: 'transport_out', hint: 'Altın ve yemek gönder.' },
  support: { title: 'Destek', icon: 'support_out', hint: 'Birlikleri kalıcı olarak taşı.' },
  found_city: { title: 'Şehir Kur', icon: 'found_city', hint: 'Buraya yeni bir şehir kur.' },
  teleport: { title: 'Teleport', icon: 'teleport', hint: 'Anlık transfer, kaynak taşınmaz.' },
};

export function TargetModal({
  slot, coords, initialType, onClose,
}: {
  slot: WorldSlot;
  coords: { k: number; d: number };
  /** Dünya tablosundaki görev simgesinden gelindiyse doğrudan o formla açılır. */
  initialType?: string;
  onClose: () => void;
}) {
  const { cityId } = useActiveCity();
  const openChat = useOpenChat();
  const target = { k: coords.k, d: coords.d, s: slot.s };
  const options = useMissionOptions(cityId, target);
  const [picked, setPicked] = useState<string | null>(initialType ?? null);

  const data = options.data;
  const title = slot.city
    ? `${slot.city.name} (${target.k}:${target.d}:${target.s})`
    : `Boş şehir (${target.k}:${target.d}:${target.s})`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="lg"
      footer={picked
        ? <Button variant="ghost" onClick={() => setPicked(null)}>← Seçeneklere dön</Button>
        : <Button variant="ghost" onClick={onClose}>Kapat</Button>}
    >
      <div>
        <div className="border-b border-border px-3 py-1.5 text-xs text-muted">
          {slot.city ? (
            <>
              Oyuncu: <b className="text-ink">{slot.city.username}</b>
              {slot.city.alliance ? <> · İttifak: <b className="text-ink">{slot.city.alliance}</b></> : ''}
              {slot.city.isCapital ? ' · başkent' : ''}
              {slot.city.isOwn ? ' · senin şehrin' : ''}
            </>
          ) : (
            'Bu koordinatta şehir yok — iskâna açık.'
          )}
        </div>

        {/* ⭐ MESAJ (kullanıcı 2026-07-31): DM'nin İLK giriş noktası — orijinalde de dünya
            menüsündeydi (`g.java:1440` case 12: Saldırı · Casusluk · Nakliye · Destek · Mesaj).
            ⚠️ `InviteRow`'un İÇİNE konmaz: o, yetkisi olmayanda `null` döner ve mesaj düğmesi
            de kaybolurdu. Onay sorulmaz (kullanıcı: "emin misiniz" gereksiz). */}
        {slot.city && !slot.city.isOwn ? (
          <div className="border-b border-border px-3 py-1.5">
            <Button size="sm" variant="ghost"
              onClick={() => {
                const c = slot.city!;
                onClose();                      // modal kapanır, sohbet penceresi açılır
                openChat(c.playerId, c.username);
              }}>Mesaj</Button>
          </div>
        ) : null}

        {/* ⭐ İTTİFAĞA DAVET (doküman: "dünya ekranında İttifak Daveti seçeneği") — yalnız
            Konsey+Lider görür ve hedef ittifaksızsa (orijinal q>1 kapısı, g.java:1447). */}
        {slot.city && !slot.city.isOwn && !slot.city.hasAlliance ? (
          <InviteRow targetPlayerId={slot.city.playerId} targetName={slot.city.username} />
        ) : null}

        {options.isLoading ? <Empty>Seçenekler yükleniyor…</Empty> : null}
        <ErrorBox error={options.error} />

        {data?.activeCity ? (
          <div className="px-3 py-4 text-sm text-muted">
            Bu <b className="text-ink">şu anki aktif şehrin</b>. Kendine görev gönderemezsin;
            başka bir şehrini seçersen nakliye, destek ve teleport açılır.
          </div>
        ) : null}

        {data && !data.activeCity && !picked ? (
          <OptionList options={data.options} onPick={setPicked}
            teleportReadyAt={data.teleportReadyAt ?? null} />
        ) : null}

        {picked ? (
          <MissionForm
            type={picked}
            target={target}
            /* ⭐ Yetki kararı SUNUCUDAN gelen seçeneğe bakar. Dünya tablosundaki kısayol
               simgesi listeyi atlayıp doğrudan forma girdiği için bu kontrol ŞART:
               acemi korumasındaki oyuncuya saldırı formu açılabilir ama gönderilemez. */
            option={data?.options.find((o) => o.type === picked) ?? null}
            attacksLeft={data?.attacksLeft ?? null}
            onDone={onClose}
          />
        ) : null}
      </div>
    </Modal>
  );
}

/** İttifağa Davet satırı — davet yetkisi (Konsey+Lider) yoksa hiç çizilmez. */
function InviteRow({ targetPlayerId, targetName }: { targetPlayerId: number; targetName: string }) {
  const my = useAlliance(0);
  const invite = useAllianceInvite();
  const confirm = useConfirm();
  const role = my.data?.alliance?.myRole ?? 0;
  if (role < 2) return null;
  return (
    <div className="border-b border-border px-3 py-1.5">
      <Button size="sm" variant="ghost" disabled={invite.isPending}
        onClick={() => {
          void confirm({
            title: `${targetName} → ${my.data?.alliance?.name}`,
            body: 'Oyuncuya ittifak daveti gönderilecek. Emin misiniz!',
          }).then((ok) => { if (ok) invite.mutate({ playerId: targetPlayerId }); });
        }}>İttifağa Davet</Button>
      {invite.isSuccess ? <span className="ml-2 text-[11px] text-success">Davet gönderildi.</span> : null}
      <ErrorBox error={invite.error} />
    </div>
  );
}

/* ── 1. adım: seçenek listesi ───────────────────────────────────────────────── */

function OptionList({ options, onPick, teleportReadyAt }: {
  options: MissionOption[];
  onPick: (t: string) => void;
  /** Teleport beklemedeyse hazır olacağı an — sebebin altına geri sayım düşer. */
  teleportReadyAt: string | null;
}) {
  useTick();
  if (options.length === 0) return <Empty>Bu hedefe gönderilebilecek görev yok.</Empty>;
  return (
    <ul className="divide-y divide-border">
      {options.map((o) => {
        const info = MISSION_INFO[o.type];
        return (
          <li key={o.type}>
            <button
              disabled={!o.enabled}
              onClick={() => onPick(o.type)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                o.enabled ? 'hover:bg-raised' : 'cursor-not-allowed opacity-60'
              }`}
            >
              {/* ⚠️ `MissionIcon` kullanılıyor: `teleport.png` henüz YOK ve ham `<img>` kırık
                  resim kutusu gösteriyordu. Bileşen eksik ikonu emojiye düşürüyor. */}
              <MissionIcon id={info?.icon ?? 'attack'} size={44} />
              <span className="min-w-0 flex-1">
                <span className="display block text-sm font-semibold text-ink">
                  {info?.title ?? o.label}
                </span>
                {/* Kapalıysa SEBEBİ yazar; sessizce gizlemek oyuncuyu şaşırtıyordu. */}
                <span className={`block text-[11px] ${o.enabled ? 'text-muted' : 'text-danger'}`}>
                  {o.enabled ? info?.hint ?? '' : o.reason}
                </span>
                {/* ⭐ Teleport beklemesi: "hazır değil" yetmez, NE KADAR kaldığı lazım
                    (kullanıcı, 2026-08-03). Süre oyun saatinde işliyor. */}
                {o.type === 'teleport' && !o.enabled && teleportReadyAt ? (
                  <span className="tnum block text-[11px] text-warning">
                    Hazır olmasına {remaining(teleportReadyAt) ?? 'birazdan'}
                  </span>
                ) : null}
              </span>
              {o.enabled ? <span aria-hidden className="shrink-0 text-muted">›</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ── 2. adım: görev formu ───────────────────────────────────────────────────── */

/**
 * Hangi görevde ne seçilir — tek tabloda, dallanma formun içine dağılmasın diye.
 *
 * ⭐ `all` = casus kuş DAHİL her savaşçı (kullanıcı, 2026-08-03). Destek ve teleport bunu
 * kullanıyor, çünkü ikisi de **kendi şehrine** birlik taşıyor — savaşa sokmuyor.
 * ⚠️ Asıl gerekçe bir çıkmazdı: şehir terk etmek barakanın ve tapınağın TAMAMEN boş olmasını
 * istiyor (`city.service.ts` `abandonBlockers`), ama casus kuş yalnız casusluğa
 * katılabildiği için şehirden ÇIKARILAMIYORDU — yani kuşu olan şehir hiç terk edilemiyordu.
 */
const FORM_RULES: Record<string, { units: 'warriors' | 'spy' | 'all' | 'none'; cargo: boolean }> = {
  attack: { units: 'warriors', cargo: false },
  spy: { units: 'spy', cargo: false },
  transport: { units: 'warriors', cargo: true },
  support: { units: 'all', cargo: true },
  found_city: { units: 'warriors', cargo: false },
  teleport: { units: 'all', cargo: false },
};

/**
 * ⭐ KAHRAMAN GÖNDERİLEBİLEN GÖREVLER (kullanıcı, 2026-08-03).
 *
 * ⚠️ Sunucu bunların ÜÇÜNÜ DE zaten destekliyordu (`march()` → `reserveHeroes`, teleport da
 * kahraman taşıyor) — eksik olan tek şey formun hiç kahraman seçtirmemesi ve istemcinin daima
 * `heroIds: []` göndermesiydi. Yani özellik aylardır yazılıydı ve **ulaşılamıyordu**.
 *
 * ⚠️ Nakliye ve casusluk DIŞARIDA: nakliye kaynak taşır (kahramanın işi değil), casuslukta
 * yalnız kuş gider.
 */
const HERO_MISSIONS = new Set(['attack', 'support', 'teleport', 'found_city']);

/**
 * Şehirdeki kahramanlardan sefere katılacakları seçtirir.
 *
 * ⚠️ Yalnız `in_city` olanlar listelenir: ölü, dirilen, seferde ya da dönüş yolundaki bir
 * kahraman seçilirse sunucu `hero_unavailable` ile reddeder ve oyuncu formu doldurduktan
 * SONRA hatayı görür — reddi önce söylemek daha dürüst (aynı kalıp görev seçeneklerinde de var).
 */
function HeroPicker({ cityId, picked, onChange }: {
  cityId: number | null;
  picked: number[];
  onChange: (ids: number[]) => void;
}) {
  const temple = useTemple(cityId);
  const list = (temple.data?.heroes ?? []).filter((h) => h.state === 'in_city');
  if (list.length === 0) return null;

  const toggle = (id: number): void => {
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  };

  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">Kahraman (isteğe bağlı)</div>
      <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
        {list.map((h) => (
          <li key={h.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-raised">
              <input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggle(h.id)} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{h.name}</span>
              <span className="tnum shrink-0 text-xs text-muted">sv {h.level}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissionForm({
  type, target, option, attacksLeft, onDone,
}: {
  type: string;
  target: { k: number; d: number; s: number };
  option: MissionOption | null;
  attacksLeft: number | null;
  onDone: () => void;
}) {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);
  const send = useSendMission();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [heroIds, setHeroIds] = useState<number[]>([]);
  const [gold, setGold] = useState('');
  const [food, setFood] = useState('');

  const rule = FORM_RULES[type] ?? { units: 'warriors' as const, cargo: false };
  const info = MISSION_INFO[type];

  const units: Record<string, number> = {};
  for (const [id, raw] of Object.entries(picked)) {
    const n = Math.trunc(Number(raw) || 0);
    if (n > 0) units[id] = n;
  }
  const hasUnits = Object.keys(units).length > 0;

  /**
   * ⭐ Önizleme motorun AYNI `travel.ts`'ini kullanır; otorite yine sunucudur.
   *
   * ⚠️ Harita sabitleri **sunucudan** geliyor (`city.map`), `DEFAULT_MAP_CONFIG`ten değil:
   * o sabitler artık panelden dünya başına ayarlanabiliyor ve varsayılanı kullansaydık
   * panelde bir sayı değişir değişmez ekranda yazan süre gerçek varış anından sapardı.
   */
  const origin = city.data?.coordinates;
  const mapCfg = city.data?.map;
  const leg = origin ? route(origin, target, mapCfg) : null;
  const D = leg?.distance ?? 0;
  // ⚠️ Kahraman sayısı da geçiliyor: kahraman orduyu yavaşlatabilir (`travel.ts` `armySpeed`).
  //    Geçmezsek "9 kuş + 1 kahraman" önizlemesi 52 sn yazar, sunucu ise 26 dk hesaplar.
  const speed = hasUnits ? armySpeed(units, HERO_MISSIONS.has(type) ? heroIds.length : 0) : null;
  const cartography = city.data?.techs['cartography'] ?? 0;
  // Dünya hız çarpanı sunucu hesabıyla AYNI olmalı — yoksa gösterilen süre hızlı dünyada
  // çarpan katı kadar yanlış çıkar.
  const speedMultiplier = city.data?.speed?.travel ?? 1;
  const eta = type === 'teleport' ? 0
    : speed && leg
      ? travelSeconds({ ...leg, speed, cartography, speedMultiplier }, mapCfg)
      : null;

  // Taşıma kapasitesi ordudan gelir → oyuncu ne kadar yükleyebileceğini ANINDA görür.
  const capacity = Object.entries(units).reduce((sum, [id, n]) => {
    const u = catalog.data?.units.find((x) => x.id === id);
    return sum + (u?.carry ?? 0) * n;
  }, 0);
  const cargo = { gold: Math.max(0, Math.trunc(Number(gold) || 0)), food: Math.max(0, Math.trunc(Number(food) || 0)) };
  const cargoTotal = cargo.gold + cargo.food;
  const cargoFits = cargoTotal <= capacity;
  const affordCargo = (city.data?.resources.gold ?? 0) >= cargo.gold
    && (city.data?.resources.food ?? 0) >= cargo.food;

  const list = (catalog.data?.units ?? []).filter((u) => {
    if (rule.units === 'spy') return u.id === 'spy_bird';
    if (rule.units === 'warriors') return u.id !== 'spy_bird';
    if (rule.units === 'all') return true;
    return false;
  });

  // ⭐ Sunucu bu görevi kapattıysa form gönderilemez (acemi koruması, teleport bekleme süresi…).
  const blocked = option != null && !option.enabled;

  // Nakliyede kargo ZORUNLU (boş nakliyenin anlamı yok), destekte isteğe bağlı.
  const canSend = cityId != null
    && !blocked
    && hasUnits
    && (!rule.cargo || (cargoFits && affordCargo))
    && (type !== 'transport' || cargoTotal > 0)
    && !send.isPending;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2.5">
        <MissionIcon id={info?.icon ?? 'attack'} size={36} />
        <b className="display text-base text-ink">{info?.title ?? type}</b>
        {/* Süre seçilen ordunun EN YAVAŞ birimine göre canlı hesaplanır. */}
        <span className="tnum ml-auto text-xs text-muted">
          Süre: <b className="text-ink">
            {type === 'teleport' ? 'anlık' : eta ? formatDuration(eta) : '—'}
          </b>
        </span>
      </div>

      {blocked ? (
        <div role="alert"
          className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
          {option?.reason ?? 'Bu görev şu anda gönderilemez.'}
        </div>
      ) : null}

      {/* ⭐ Kural anlatmak yerine SAYI: oyuncu kaç hakkı kaldığını görür. */}
      {type === 'attack' && attacksLeft != null && !blocked ? (
        <div className={`rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${
          attacksLeft > 0 ? 'border-border text-muted' : 'border-danger text-danger'
        }`}>
          Bu şehre bugün kalan saldırı hakkın: <b className="tnum">{attacksLeft}</b>
        </div>
      ) : null}

      {/* ── Ordu seçimi ── */}
      {rule.units !== 'none' ? (
        <>
          <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
            {list.map((u) => {
              const have = city.data?.units[u.id] ?? 0;
              if (have <= 0) return null;
              // ⭐ Parantezdeki sayı ŞEHİRDE KALAN adet: input arttıkça canlı azalır, böylece
              //    oyuncu "kaç tanesi evde kalıyor" sorusunu ayrıca hesaplamak zorunda kalmaz.
              const left = Math.max(0, have - (units[u.id] ?? 0));
              return (
                <li key={u.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <img src={`/assets/units/${u.id}.png`} alt="" width={36} height={36}
                    className="icon-shadow h-9 w-9 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1 text-sm text-ink">
                    {u.name} <span className="tnum text-muted">({fmt(left)})</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <AmountInput min={0} max={have} placeholder="0"
                      value={picked[u.id] ?? ''}
                      onChange={(e) => setPicked({ ...picked, [u.id]: e.target.value })} />
                    <Button size="sm" variant="ghost"
                      onClick={() => setPicked({ ...picked, [u.id]: String(have) })}>
                      hepsi
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {list.every((u) => (city.data?.units[u.id] ?? 0) <= 0) ? (
            <Empty>
              {rule.units === 'spy'
                ? 'Şehrinde Casus Kuş yok. Önce Baraka\'dan üret.'
                : 'Şehrinde savaşçı yok. Önce Baraka\'dan üret.'}
            </Empty>
          ) : null}
        </>
      ) : null}

      {HERO_MISSIONS.has(type) ? (
        <HeroPicker cityId={cityId} picked={heroIds} onChange={setHeroIds} />
      ) : null}

      {/**
        * ⭐ SABİT ALT BÖLÜM (kullanıcı 2026-07-30): kargo + hata + başlat düğmesi modalın
        * scroll'una KARIŞMAZ — birim listesi uzun olsa da hep görünür. `sticky bottom-0`
        * modalın tek scroll gövdesi içinde alta yapışır; negatif kenar boşlukları paneli
        * modal kenarlarına dayar.
        */}
      <div className="sticky bottom-0 -mx-3 -mb-3 space-y-2 border-t-2 border-strong bg-surface p-3">
        {rule.cargo ? (
          <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-border p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">Gönderilecek kaynak</span>
              <span className={`tnum ${cargoFits ? 'text-muted' : 'font-semibold text-danger'}`}>
                {fmt(cargoTotal)} / {fmt(capacity)} kapasite
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1.5">
              <label>
                <span className="mb-0.5 block text-[11px] text-muted">Altın</span>
                <AmountInput min={0} placeholder="0"
                  value={gold} onChange={(e) => setGold(e.target.value)} />
              </label>
              <label>
                <span className="mb-0.5 block text-[11px] text-muted">Yemek</span>
                <AmountInput min={0} placeholder="0"
                  value={food} onChange={(e) => setFood(e.target.value)} />
              </label>
              {!affordCargo ? (
                <span className="pb-1 text-[11px] text-danger">Şehrinin kaynağı yetmiyor.</span>
              ) : type === 'support' ? (
                <span className="pb-1 text-[11px] text-muted">Kaynak göndermek isteğe bağlı.</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <ErrorBox error={send.error} />

        <Button
          className="w-full"
          disabled={!canSend}
          onClick={() => {
            send.mutate(
              {
                type,
                originCityId: cityId!,
                target,
                units,
                ...(HERO_MISSIONS.has(type) && heroIds.length > 0 ? { heroIds } : {}),
                ...(rule.cargo ? { cargo } : {}),
              },
              { onSuccess: onDone },
            );
          }}
        >
          {send.isPending ? 'Gönderiliyor…' : `${info?.title ?? type} başlat`}
        </Button>
      </div>
    </div>
  );
}

/** Dünya listesindeki satır rozetleri. */
export function SlotBadges({ slot }: { slot: WorldSlot }) {
  if (!slot.city) return null;
  return (
    <>
      {slot.city.isOwn ? <Badge tone="success">senin</Badge> : null}
      {slot.city.protection === 'beginner' ? <Badge>acemi koruması</Badge> : null}
      {slot.city.protection === 'vacation' ? <Badge>tatilde</Badge> : null}
    </>
  );
}
