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
import {
  AmountInput, Badge, Button, Empty, ErrorBox, MissionIcon, UserText,
} from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';
import {
  ARMY_OPTIONAL, attackHasEscort, HERO_MISSIONS, hasCrew, missionSentToast,
} from '../lib/mission-rules.ts';
import { canInviteToAlliance } from '../lib/chat-moderation.ts';
import { useToast } from '../components/Toaster.tsx';

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
  found_city: { title: 'Şehir Kur', icon: 'found_city',
    hint: 'Buraya yeni bir şehir kur; yanında kaynak da götürebilirsin.' },
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
  /**
   * ⭐ BAŞLIKTA **AD YOK, KOORDİNAT VAR** (kullanıcı, 2026-08-11). Ad aşağıdaki gövde
   * bloğunda büyük puntoyla duruyor; ikisinde birden yazmak yer harcardı.
   *
   * ⚠️ Asıl sebep başka: `Modal` başlığı `text-sm uppercase tracking-wider` çiziyor. Oyuncunun
   * seçtiği bir adı BÜYÜK HARFE çevirmek hem küçültür hem Türkçede bozar (`i` → `I`). Modalın
   * genel başlık üslubunu tek ekran için değiştirmek yerine adı üsluba tabi olmayan yere aldık.
   */
  const title = slot.city
    ? <>Şehir ({target.k}:{target.d}:{target.s})</>
    : <>Boş şehir ({target.k}:{target.d}:{target.s})</>;

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
        {/*
          ⭐ ŞEHİR ADI — ekranın en belirgin metni (kullanıcı, 2026-08-11). Dünya tablosunda ad
          artık mobilde hiç görünmüyor, bu yüzden "hangi şehre bakıyorum" sorusunun tek cevabı
          burası. `break-words`: ad 10 karaktere kadar olabiliyor ve dar ekranda kutudan taşmasın.
        */}
        {slot.city ? (
          <div className="border-b border-border px-3 pt-2.5 pb-1.5">
            <h3 className="display text-lg leading-tight font-semibold break-words text-ink">
              <UserText>{slot.city.name}</UserText>
            </h3>
          </div>
        ) : null}

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

        {/* ⭐ OYUNCU EYLEMLERİ — Mesaj ve İttifağa Davet AYNI SATIRDA (kullanıcı, 2026-08-08:
            *"alt alta tek satır şeklinde yapmayalım, tek buton koca bir satırı kaplıyor"*).

            ⚠️ Eskiden ikisi ayrı `border-b`li blok halindeydi ve her biri kendi tam genişlikte
            şeridini açıyordu — iki düğme için modalın üçte biri gidiyordu. Artık tek şerit,
            yan yana, `flex-wrap` ile dar ekranda kendiliğinden alt satıra iniyor.
            ⚠️ Sarmalayıcı ancak İÇİNDE bir şey varsa çizilir: davet yetkisi olmayan birinde
            `InviteRow` `null` döner ve boş bir çizgi kalırdı. */}
        {slot.city && !slot.city.isOwn ? (
          <PlayerActions city={slot.city} onClose={onClose} openChat={openChat} />
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

/**
 * Hedef oyuncuyla ilgili eylemler — **tek şerit, yan yana**.
 *
 * ⭐ MESAJ (kullanıcı 2026-07-31): DM'nin İLK giriş noktası — orijinalde de dünya menüsündeydi
 * (`g.java:1440` case 12: Saldırı · Casusluk · Nakliye · Destek · Mesaj). Onay sorulmaz
 * (kullanıcı: *"emin misiniz gereksiz"*).
 * ⭐ İTTİFAĞA DAVET (doküman: *"dünya ekranında İttifak Daveti seçeneği"*) — yalnız Konsey+Lider
 * görür ve hedef ittifaksızsa (orijinal `q>1` kapısı, `g.java:1447`).
 *
 * ⚠️ Davet düğmesi mesajla AYNI bileşende ama kendi koşuluyla: yetkisi olmayan oyuncuda yalnız
 * o düğme düşer, Mesaj kalır. Eskiden davet ayrı bir bileşendi ve `null` dönünce kendi şeridi
 * de gidiyordu — doğruydu ama iki ayrı şerit demekti.
 */
function PlayerActions({
  city, onClose, openChat,
}: {
  city: NonNullable<WorldSlot['city']>;
  onClose: () => void;
  openChat: (playerId: number, username: string) => void;
}) {
  /**
   * ⭐ İTTİFAK SORGUSU **KOŞULLU** (2026-08-11). Eskiden her yabancı şehre tıklanışta
   * `/api/v1/alliance?page=0` gidiyordu — tek bir sayı (`myRole`) için tam üye listesi,
   * çevrimiçilik ve ünvanlar dâhil. Hedefin zaten bir ittifağı varsa davet düğmesi hiç
   * çizilmiyor, yani o istek **tamamen boşa** gidiyordu.
   *
   * ⚠️ Kapı ile kural aynı fonksiyondan besleniyor (`canInviteToAlliance`): ayrı yazılsalardı
   * biri "düğmeyi göster" derken diğeri veriyi çekmemiş olur ve düğme sessizce kaybolurdu.
   */
  const my = useAlliance(0, city.hasAlliance !== true);
  const invite = useAllianceInvite();
  const confirm = useConfirm();
  const canInvite = canInviteToAlliance({
    myRole: my.data?.alliance?.myRole, targetHasAlliance: city.hasAlliance,
  });

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost"
          onClick={() => {
            onClose();                          // modal kapanır, sohbet penceresi açılır
            openChat(city.playerId, city.username);
          }}>Mesaj</Button>
        {canInvite ? (
          <Button size="sm" variant="ghost" disabled={invite.isPending}
            onClick={() => {
              void confirm({
                title: <><UserText>{city.username}</UserText> → <UserText>{my.data?.alliance?.name}</UserText></>,
                body: 'Oyuncuya ittifak daveti gönderilecek. Emin misiniz!',
              }).then((ok) => { if (ok) invite.mutate({ playerId: city.playerId }); });
            }}>İttifağa Davet</Button>
        ) : null}
        {invite.isSuccess ? <span className="text-[11px] text-success">Davet gönderildi.</span> : null}
      </div>
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
  /**
   * ⭐ ŞEHİR KURMA (kullanıcı, 2026-08-07): `warriors` → `all` ve `cargo` açıldı.
   * ⚠️ `all` casus kuşu da listeye sokuyor — kuş artık şehir kurmaya katılabiliyor ve TEK
   *    BAŞINA gidebiliyor (sunucuda `allowSpyBird`).
   * ⚠️ `cargo: true` kapasite sayacını ve altın/yemek kutularını açıyor. Kod zaten yazılıydı;
   *    kapalı olan tek şey bu bayraktı — üstelik Yük Arabası listede seçilebildiği için
   *    oyuncu kaynak taşıyacağını sanıp hiçbir şey taşıyamıyordu.
   */
  found_city: { units: 'all', cargo: true },
  teleport: { units: 'all', cargo: false },
};


/**
 * Şehirdeki kahramanlardan sefere katılacakları seçtirir.
 *
 * ⚠️ Yalnız `in_city` olanlar listelenir: ölü, dirilen, seferde ya da dönüş yolundaki bir
 * kahraman seçilirse sunucu `hero_unavailable` ile reddeder ve oyuncu formu doldurduktan
 * SONRA hatayı görür — reddi önce söylemek daha dürüst (aynı kalıp görev seçeneklerinde de var).
 *
 * ⭐ Mağara durumları (2026-08-11) bu süzgece **kendiliğinden** takılıyor: mağaradaki kahraman
 * `in_cave`, mağaraya girmek üzere işaretlenmiş olan ise `entering_cave` — ikisi de `in_city`
 * değil. Yani "mağara emrindeki kahraman başka göreve gidemez" kuralı için ekrana ayrı bir
 * süzgeç yazmak gerekmedi; durum adı kuralı zaten taşıyor.
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
      {/* ⚠️ «(isteğe bağlı)» eki KALDIRILDI (kullanıcı, 2026-08-21) — mobil başlıkla aynı. */}
      <div className="mb-1 text-[11px] text-muted">Kahraman</div>
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
  const toast = useToast();
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
  /**
   * ⚠️ Kahraman sayısı da geçiliyor: kahraman orduyu yavaşlatabilir (`travel.ts` `armySpeed`).
   * Geçmezsek "9 kuş + 1 kahraman" önizlemesi 52 sn yazar, sunucu ise 26 dk hesaplar.
   *
   * ⚠️ «Önce ordu var mı» kapısı 2026-08-07'de KALKTI: kahraman tek başına gidebiliyor ve
   * `armySpeed({}, 1)` zaten `HERO_SPEED`i (200) döndürüyor. Ordu da kahraman da yoksa
   * fonksiyon kendiliğinden `null` veriyor, ayrı bir dala gerek yok.
   */
  /* ⚠️ `mapCfg` hız hesabına da giriyor (2026-08-21): Yük Arabası muafiyeti
     (`map.cargoIgnoresSpeed`) dünya ayarı ve önizleme sunucuyla aynı kuralı görmeli, yoksa
     araba içeren kafilede yazan süre ile gerçekleşen süre ayrışır. */
  const speed = armySpeed(units, HERO_MISSIONS.has(type) ? heroIds.length : 0, mapCfg);
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

  /**
   * ⭐⭐ SERBEST ORDU = baraka − mağaraya söz verilenler (kullanıcı kuralı 2026-08-11).
   *
   * Kullanıcının örneği: 50 Cüce var, 30'u mağaraya işaretli → sefere en çok 20 Cüce çıkabilir.
   * Sunucu bunu `reserveUnits` içinde zorluyor; burası aynı sayıyı **ekranda** gösteriyor ki
   * oyuncu reddedilecek bir emri hiç kuramasın.
   * ⚠️ Yalnız `store` yönü düşülür — `withdraw` emrindeki askerler mağaradadır, zaten barakada
   * görünmezler; onları da düşmek aynı askeri iki kez saymak olurdu.
   */
  const freeUnits: Record<string, number> = { ...(city.data?.units ?? {}) };
  const caveJob = city.data?.cave?.job;
  if (caveJob?.direction === 'store') {
    for (const [id, n] of Object.entries(caveJob.units)) {
      freeUnits[id] = Math.max(0, (freeUnits[id] ?? 0) - n);
    }
  }

  // ⭐ Sunucu bu görevi kapattıysa form gönderilemez (acemi koruması, teleport bekleme süresi…).
  const blocked = option != null && !option.enabled;

  /**
   * ⭐ Bazı görevlerde ordu İSTEĞE BAĞLI: yalnız kahraman da gidebilir (`lib/mission-rules.ts`).
   * ⚠️ İkisi de yoksa gönderilemez — sunucu da aynı kuralı `no_units` ile uyguluyor.
   */
  const crewOk = hasCrew(type, Object.keys(units).length, heroIds.length);

  /* «Tüm ordu» düğmesinin iki sorusu: seçilebilecek asker var mı, hepsi seçilmiş mi.
     ⚠️ Adedi 0 olan birim «seçilmiş» sayılıyor — yoksa şehirde hiç Elf yokken düğme asla
     «Temizle»ye dönmezdi. */
  const hasAnyUnit = list.some((u) => (freeUnits[u.id] ?? 0) > 0);
  const allPicked = list.every((u) => {
    const have = freeUnits[u.id] ?? 0;
    return have <= 0 || Number(picked[u.id] ?? 0) >= have;
  });

  // Nakliyede kargo ZORUNLU (boş nakliyenin anlamı yok), destek ve şehir kurmada isteğe bağlı.
  /* ⭐ Saldırıda savaşan birim şartı (2026-08-21) — sunucudaki kapının aynası
     (`mission.service.ts` · `sendAttack`). Gerekçe `attackHasEscort`da. */
  const escortOk = attackHasEscort(type, Object.keys(units));

  const canSend = cityId != null
    && !blocked
    && crewOk
    && escortOk
    && (!rule.cargo || (cargoFits && affordCargo))
    && (type !== 'transport' || cargoTotal > 0)
    && !send.isPending;

  return (
    <div className="space-y-3 p-3">
      {/**
        * ⭐ SABİT ÜST BÖLÜM (kullanıcı, 2026-08-19): *"süreyi dinamik hesaplayan gösterge de
        * scroll içinde olmasın, seçilen askere göre anlık görünemiyor. Sağ üstte header da
        * görünsün."* Süre her birim seçiminde değişiyor ve kayan bir başlıkta oyuncu tam da
        * değiştiği anda onu göremiyordu. `sticky bottom-0` alt bölümün aynadaki hâli.
        */}
      <div className="sticky top-0 z-10 -mx-3 -mt-3 flex items-center gap-2.5
        border-b-2 border-strong bg-surface p-3">
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
          {/**
            * ⭐ TÜM ORDU (kullanıcı, 2026-08-19): *"Hepsini ayrı ayrı hepsi seçmek yerine
            * komple tek seferde seçsin."*
            *
            * ⚠️ Düğme **çift yönlü** ve etiketi ne yapacağını yazıyor: tek yönlü olsaydı
            * yanlışlıkla basan oyuncunun geri dönüşü, satır satır kutuları sıfırlamak olurdu.
            * ⚠️ Yalnız gerçekten asker VARSA çiziliyor — boş şehirde işlevsiz bir düğme.
            */}
          {hasAnyUnit ? (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost"
                onClick={() => setPicked(allPicked ? {} : Object.fromEntries(
                  list.filter((u) => (freeUnits[u.id] ?? 0) > 0)
                    .map((u) => [u.id, String(freeUnits[u.id])]),
                ))}>
                {allPicked ? 'Temizle' : 'Tüm ordu'}
              </Button>
            </div>
          ) : null}
          <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
            {list.map((u) => {
              /**
               * ⭐ SERBEST adet gösterilir, ham mevcut değil (2026-08-11): mağaraya girmek üzere
               * işaretli askerler hâlâ barakadadır ama **söz verilmiştir** ve sunucu onlarla
               * sefere çıkmayı reddeder. Ham sayıyı göstermek oyuncuya sunucunun kabul etmeyeceği
               * bir seçim yaptırırdı — tam da kaçınmak istediğimiz sürpriz.
               */
              const have = freeUnits[u.id] ?? 0;
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
          {list.every((u) => (freeUnits[u.id] ?? 0) <= 0) ? (
            <Empty>
              {/*
                ⚠️ «kahraman tek başına da gidebilir» eki KALDIRILDI (kullanıcı, 2026-08-21:
                *"Kahramanın tek başına gidebileceği bilgisini buraya yazmaya gerek yok"*).
                Kural DEĞİŞMEDİ — kahraman hâlâ tek başına gidebiliyor (`ARMY_OPTIONAL`);
                yalnız boş ordu kutusu artık bunu duyurmuyor. Kahraman seçici zaten hemen
                altında ve gönder düğmesi kahramanla açılıyor, yani bilgi ekranda duruyor.
                ⚠️ Metin mobildekiyle BİREBİR aynı (`mission_form.dart` · `_bosOrduMetni`).
              */}
              {rule.units === 'spy'
                ? 'Şehrinde Casus Kuş yok. Önce Baraka\'dan üret.'
                : ARMY_OPTIONAL.has(type)
                  ? 'Şehrinde savaşçı veya kahraman yok.'
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
              ) : capacity === 0 && cargoTotal > 0 ? (
                /* ⚠️ Sunucunun `carry_capacity` reddini forma TAŞIMADAN söylüyoruz: yalnız
                   kahraman ya da yalnız kuş seçildiğinde kapasite 0 ve sebebi görünmüyordu. */
                <span className="pb-1 text-[11px] text-danger">
                  Seçtiğin orduda kaynak taşıyabilecek birim yok — Yük Arabası ekle.
                </span>
              ) : type === 'support' || type === 'found_city' ? (
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
              {
                /* ⭐ EMİR ONAYI (kullanıcı, 2026-08-21). ⚠️ Toast ÖNCE, kapatma sonra:
                   `onDone` bu modalı söküyor ve söküldükten sonra `toast()` çağırmak
                   sökülmüş bir ağaçtan durum güncellemesi olurdu. Sağlayıcı `App`ta,
                   yani toast modal kapansa da ayakta kalıyor.
                   ⚠️ `url: '/armies'` — onayın tek doğal devamı orduyu yolda görmek. */
                onSuccess: () => {
                  toast({
                    title: missionSentToast(type),
                    body: `Hedef ${target.k}:${target.d}:${target.s}`,
                    url: '/armies',
                    category: 'report',
                  });
                  onDone();
                },
              },
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
