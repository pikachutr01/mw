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
import { armySpeed, distance, travelSeconds } from '@mobiwar/engine';
import { fmt, formatDuration } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import {
  useCatalog, useCity, useMissionOptions, useSendMission,
  type MissionOption, type WorldSlot,
} from '../lib/queries.ts';
import { Badge, Button, Empty, ErrorBox, Input, MissionIcon } from '../components/ui.tsx';
import { Modal } from '../components/Modal.tsx';

/** Görev tipi → ekranda görünen ad ve açıklama (§13.14: İngilizce id görünmez). */
const MISSION_INFO: Record<string, { title: string; hint: string; icon: string }> = {
  attack: {
    title: 'Saldırı', icon: 'attack',
    hint: 'Birlikler yola çıkarken şehirden düşer. Bir şehre 24 saatte en fazla 3 saldırı yapılabilir.',
  },
  spy: {
    title: 'Casusluk', icon: 'spy_out',
    hint: 'Yalnız Casus Kuş gider. Kuş sayısı ikinin kuvvetiyle bilgi kademesini artırır: '
      + '8 kuş = +3 seviye. Casusluk tekniğin zayıfsa kuşlar vurulabilir.',
  },
  transport: {
    title: 'Nakliye', icon: 'transport_out',
    hint: 'Kaynak yola çıkarken düşer, varınca teslim edilir; ordu boş döner. '
      + 'Taşınabilecek miktar ordunun taşıma kapasitesiyle sınırlıdır.',
  },
  support: {
    title: 'Destek', icon: 'support_out',
    hint: 'TEK YÖNLÜ: birlikler hedef şehrin barakasına, kahramanlar tapınağına yerleşir. '
      + 'İstersen kaynak da gönderebilirsin.',
  },
  found_city: {
    title: 'Şehir Kur', icon: 'found_city',
    hint: 'Ordu varınca şehri kurar ve garnizonu olur. Yer bu arada dolarsa ordu geri döner.',
  },
  teleport: {
    title: 'Teleport', icon: 'teleport',
    hint: 'ANLIK transfer — kendi şehirlerin arasında. Kaynak taşınmaz. '
      + 'Kullanımdan sonra Teleport binası bekleme süresine girer.',
  },
};

export function TargetModal({
  slot, coords, onClose,
}: {
  slot: WorldSlot;
  coords: { k: number; d: number };
  onClose: () => void;
}) {
  const { cityId } = useActiveCity();
  const target = { k: coords.k, d: coords.d, s: slot.s };
  const options = useMissionOptions(cityId, target);
  const [picked, setPicked] = useState<string | null>(null);

  const data = options.data;
  const title = slot.city
    ? `${slot.city.name} (${target.k}:${target.d}:${target.s})`
    : `Boş yuva (${target.k}:${target.d}:${target.s})`;

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
              {slot.city.isCapital ? ' · başkent' : ''}
              {slot.city.isOwn ? ' · senin şehrin' : ''}
            </>
          ) : (
            'Bu koordinatta şehir yok — iskâna açık.'
          )}
        </div>

        {options.isLoading ? <Empty>Seçenekler yükleniyor…</Empty> : null}
        <ErrorBox error={options.error} />

        {data?.activeCity ? (
          <div className="px-3 py-4 text-sm text-muted">
            Bu <b className="text-ink">şu anki aktif şehrin</b>. Kendine görev gönderemezsin;
            başka bir şehrini seçersen nakliye, destek ve teleport açılır.
          </div>
        ) : null}

        {data && !data.activeCity && !picked ? (
          <OptionList options={data.options} onPick={setPicked} />
        ) : null}

        {picked ? (
          <MissionForm type={picked} target={target} slot={slot} onDone={onClose} />
        ) : null}
      </div>
    </Modal>
  );
}

/* ── 1. adım: seçenek listesi ───────────────────────────────────────────────── */

function OptionList({ options, onPick }: { options: MissionOption[]; onPick: (t: string) => void }) {
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

/** Hangi görevde ne seçilir — tek tabloda, dallanma formun içine dağılmasın diye. */
const FORM_RULES: Record<string, { units: 'warriors' | 'spy' | 'none'; cargo: boolean }> = {
  attack: { units: 'warriors', cargo: false },
  spy: { units: 'spy', cargo: false },
  transport: { units: 'warriors', cargo: true },
  support: { units: 'warriors', cargo: true },
  found_city: { units: 'warriors', cargo: false },
  teleport: { units: 'warriors', cargo: false },
};

function MissionForm({
  type, target, slot, onDone,
}: {
  type: string;
  target: { k: number; d: number; s: number };
  slot: WorldSlot;
  onDone: () => void;
}) {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);
  const send = useSendMission();
  const [picked, setPicked] = useState<Record<string, string>>({});
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

  // ⭐ Önizleme motorun AYNI `travel.ts`'ini kullanır; otorite yine sunucudur.
  const origin = city.data?.coordinates;
  const D = origin ? distance(origin, target) : 0;
  const speed = hasUnits ? armySpeed(units) : null;
  const cartography = city.data?.techs['cartography'] ?? 0;
  const eta = type === 'teleport' ? 0
    : speed ? travelSeconds({ distance: D, speed, cartography }) : null;

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
    return false;
  });

  // Nakliyede kargo ZORUNLU (boş nakliyenin anlamı yok), destekte isteğe bağlı.
  const canSend = cityId != null
    && hasUnits
    && (!rule.cargo || (cargoFits && affordCargo))
    && (type !== 'transport' || cargoTotal > 0)
    && !send.isPending;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-border bg-raised px-2.5 py-2">
        <MissionIcon id={info?.icon ?? 'attack'} size={36} />
        <div className="text-[11px] text-muted">
          <b className="display block text-sm text-ink">{info?.title ?? type}</b>
          {info?.hint}
        </div>
      </div>

      <div className="tnum grid grid-cols-3 gap-2 text-xs">
        <Stat label="Mesafe" value={fmt(D)} />
        <Stat label="Ordu hızı" value={speed ? String(speed) : '—'} />
        <Stat label="Süre" value={type === 'teleport' ? 'anlık' : eta ? formatDuration(eta) : '—'} />
      </div>

      {slot.city?.protection ? (
        <div className="rounded-[var(--radius-sm)] border border-warning px-3 py-2 text-xs text-warning">
          Bu oyuncu {slot.city.protection === 'beginner' ? 'acemi koruması' : 'tatil modu'} altında.
        </div>
      ) : null}

      {/* ── Ordu seçimi ── */}
      {rule.units !== 'none' ? (
        <>
          <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
            {list.map((u) => {
              const have = city.data?.units[u.id] ?? 0;
              if (have <= 0) return null;
              return (
                <li key={u.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <img src={`/assets/units/${u.id}.png`} alt="" width={36} height={36}
                    className="icon-shadow h-9 w-9 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1 text-sm text-ink">
                    {u.name}
                    <span className="ml-1 text-[11px] text-muted">
                      {fmt(have)} hazır{u.carry ? ` · taşır ${fmt(u.carry)}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Input type="number" min={0} max={have} inputMode="numeric"
                      className="tnum w-20 py-1" placeholder="0"
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

      {/* ── Kargo ── */}
      {rule.cargo ? (
        <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-border p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">Gönderilecek kaynak</span>
            <span className={`tnum ${cargoFits ? 'text-muted' : 'font-semibold text-danger'}`}>
              {fmt(cargoTotal)} / {fmt(capacity)} kapasite
            </span>
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="mb-0.5 block text-[11px] text-muted">Altın</span>
              <Input type="number" min={0} inputMode="numeric" className="tnum py-1"
                value={gold} onChange={(e) => setGold(e.target.value)} placeholder="0" />
            </label>
            <label className="flex-1">
              <span className="mb-0.5 block text-[11px] text-muted">Yemek</span>
              <Input type="number" min={0} inputMode="numeric" className="tnum py-1"
                value={food} onChange={(e) => setFood(e.target.value)} placeholder="0" />
            </label>
          </div>
          {!affordCargo ? (
            <div className="text-[11px] text-danger">Şehrinin kaynağı yetmiyor.</div>
          ) : null}
          {type === 'support' ? (
            <div className="text-[11px] text-muted">Destekte kaynak göndermek isteğe bağlıdır.</div>
          ) : null}
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
              ...(rule.cargo ? { cargo } : {}),
            },
            { onSuccess: onDone },
          );
        }}
      >
        {send.isPending ? 'Gönderiliyor…' : `${info?.title ?? type} başlat`}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border px-2 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm text-ink">{value}</div>
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
