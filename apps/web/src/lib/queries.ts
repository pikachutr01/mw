/**
 * Sunucu durumu (TanStack Query). Her yanıtta `serverNow` yakalanır → geri sayımlar sunucu
 * saatinden çizilir (§7).
 *
 * ⭐ **YOKLAMA BİR EMNİYET AĞIDIR, VERİ YOLU DEĞİL** (2026-07-28). Ekranı güncel tutan asıl yol
 * WebSocket'tir (`realtime.ts` → `INVALIDATES`); buradaki aralıklar yalnız "WS kopuk kaldığı bir
 * pencerede ekran tamamen donmasın" diye var. Bu yüzden hepsi tek sabitten (`SAFETY_NET_MS`)
 * besleniyor: aralığı düşürmek istemek, aslında WS eşlemesinde bir konunun eksik olduğunun
 * habercisidir — çözüm yoklamayı sıklaştırmak değil, olayı eklemektir.
 */
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
  type UseInfiniteQueryResult, type UseQueryResult,
} from '@tanstack/react-query';
import type { MapConfig } from '@mobilwar/engine';
import { api } from './api.ts';
import { noteServerTime, useSession } from './hooks.ts';
import { useConnection } from './realtime.ts';

async function get<T>(path: string): Promise<T> {
  const r = await api<T>(path);
  // ⚠️ İKİ alan da geçiliyor: `gameNow` olmadan geri sayımlar oyun saatindeki damgaları
  // gerçek saatle karşılaştırır ve dünyanın duraklama toplamı kadar sapar (bkz. `hooks.ts`).
  const t = r as { serverNow?: string; gameNow?: string } | null;
  noteServerTime(t?.serverNow, t?.gameNow);
  return r;
}

/**
 * ⭐ OTURUM KAPISI — misafir modunun (§10.x) sessiz taşıyıcısı.
 *
 * ⚠️ Buradaki sorguların **hiçbiri oturumsuz çalışmaz**; kapısız kaldıklarında misafir
 * ekranında dakikada ~10 adet 401 üretiyorlardı (7 anahtar, çoğu 60 sn yoklamalı, hepsi
 * `retry: 1` ile ikiye katlanıyor). Sağlayıcıları mount etmemek bunu çözüyor gibi görünse de
 * kırılgan: misafire açık bir ekrana yanlışlıkla konan tek bir kanca sorunu geri getirir.
 * Kapı sorgunun kendisinde olunca bu bütün bir hata sınıfı kapanıyor.
 *
 * ⚠️ Kapı ayrıca **girişte tazelemeyi de üstleniyor**: `useSession()` reaktif olduğu için
 * `enabled` false → true döndüğünde TanStack her şeyi kendiliğinden çekiyor. Giriş artık
 * sayfa yenilemediğinden (router oturum dalının üstünde) bu şart.
 */
const useAuthed = (): boolean => useSession() != null;

export interface CitySummary {
  id: number;
  name: string;
  coordinates: { k: number; d: number; s: number };
  isCapital: boolean;
}

export interface QueueRow {
  id: number;
  category: 'building' | 'unit' | 'defense' | 'tech';
  itemType: string;
  targetLevel: number | null;
  count: number | null;
  startedAt: string;
  finishAt: string;
  /** Savaşçı kuyruğu: üretilmiş adet · bir birimin süresi · sıradaki yer (1 = üretimi süren). */
  done?: number;
  perUnitSeconds?: number | null;
  position?: number;
  /** Kalan sipariş adedi (üretilenler düşülmüş). */
  remaining?: number | null;
  /** SIRADAKİ TEK BİRİMİN penceresi — ekrandaki sayaç ve çubuk bunu kullanır. */
  unitStartedAt?: string | null;
  unitFinishAt?: string | null;
}

/** Başka şehirde sürüyor olabilen teknik araştırması (Akademiler ortak). */
export interface TechQueueRow {
  id: number;
  itemType: string;
  targetLevel: number | null;
  cityId: number;
  cityName: string;
  startedAt: string;
  finishAt: string;
}

export interface BudgetStatus {
  used: number;
  total: number;
  free: number;
  fits: boolean;
}

export interface CityDetail {
  id: number;
  name: string;
  coordinates: { k: number; d: number; s: number };
  isCapital: boolean;
  resources: { gold: number; food: number };
  /** ⚠️ Tatil modunda ikisi de **0** — bilgi çubuğundaki sayaç böylece kendiliğinden donuyor. */
  production: { goldPerHour: number; foodPerHour: number };
  /**
   * ⭐ §tatil modu. Ayrı alan, çünkü «0/sa ⇒ tatilde» çıkarımı YANLIŞ olurdu: madeni
   * olmayan yeni bir şehrin de üretimi 0'dır.
   */
  onVacation?: boolean;
  /** Dünya hız çarpanları (1 = klasik). Bilgi çubuğundaki ⚡ rozeti bunu okur. */
  speed?: { resource: number; travel: number; training?: number; construction?: number };
  /**
   * ⭐ Harita/sefer sabitleri — **sunucudan** gelir, istemcide sabit tutulmaz.
   * Dünya ekranındaki süre önizlemesi bunu `travelSeconds`e verir; panelden ayarlanabildiği
   * için varsayılana güvenmek önizlemeyi gerçek varış anından saptırırdı.
   */
  map?: MapConfig;
  buildings: Record<string, number>;
  units: Record<string, number>;
  defenses: Record<string, number>;
  techs: Record<string, number>;
  queues: QueueRow[];
  /** Oyuncunun TÜM şehirlerindeki açık teknik araştırmaları. */
  techQueues: TechQueueRow[];
  capacity: { castle: BudgetStatus; defense: BudgetStatus };
  /** ⭐ Mağara (§13.20) — Yapılar ekranı geri sayımı ve modalı bundan çiziyor. */
  cave: CaveState;
  /**
   * ⭐ Sur onarımı sürüyorsa penceresi (§13.21.2). `integrity` onarım BAŞLARKENki oran;
   * o anki değer `wallCurrentIntegrity` ile türetilir. Onarım yokken null.
   */
  wallRepair: { integrity: number; from: string | null; until: string } | null;
  /** Bu şehirde diriltilmekte olan kahraman var mı? (menü aktivite noktası) */
  heroReviving: boolean;
  gameNow: string;
  serverNow: string;
}

export interface CaveState {
  level: number;
  /** Kapasite ALAN cinsinden (adet değil). */
  capacity: number;
  usedArea: number;
  freeArea: number;
  /** Mağaranın İÇİNDEKİLER — yalnız sahibi görür (casus göremez). */
  units: Record<string, number>;
  repairUntil: string | null;
  repairing: boolean;
  /** Süren doldurma/boşaltma. ⚠️ İptal edilemez. */
  job: {
    missionId: number;
    direction: 'store' | 'withdraw';
    units: Record<string, number>;
    area: number;
    startedAt: string;
    finishAt: string;
  } | null;
}

export interface Requirement {
  buildings?: Record<string, number>;
  techs?: Record<string, number>;
}

/** Ön-şart adı TÜRKÇE olarak sunucudan gelir (§13.14) — istemci eşleme tablosu tutmaz. */
export interface NamedRequirement {
  id: string;
  name: string;
  level: number;
  kind: 'building' | 'tech';
}

export interface CatalogEntry {
  id: string;
  name: string;
  requirements: Requirement;
  requirementNames: NamedRequirement[];
}

export interface CatalogBuilding extends CatalogEntry {
  level: number;
  maxLevel: number;
  nextCost: { gold: number; food: number } | null;
  /** Bir sonraki seviyenin süresi (saniye) — **dünya hız çarpanı uygulanmış**. Tavandaysa null. */
  nextSeconds: number | null;
  /**
   * ⭐ Çarpansız (1x) süre — yalnız `nextSeconds`ten FARKLIYSA dolu (2026-08-08).
   * Arayüz bunu üstü çizili "indirim etiketi" olarak gösteriyor; eşitken hiç çizmiyor.
   * ⚠️ İstemci hesaplamaz: bölme `queue.service`teki `scaled` ile aynı olmak zorunda.
   */
  baseSeconds: number | null;
  /**
   * ⭐ Saatlik üretim — yalnız üreten yapılarda (Çiftlik/Maden), diğerlerinde `null`.
   * ⚠️ Sunucudan geliyor: oran ve dünya çarpanı panelden ayarlanabiliyor, istemcide
   * hesaplamak ekranın yanılması demekti (aynı gerekçe `nextCost` için de geçerli).
   */
  production: { perHour: number; nextPerHour: number | null } | null;
}

export interface CatalogUnit extends CatalogEntry {
  area: number;
  speed?: number;
  /** Ganimet taşıma kapasitesi — nakliye/destek formunun tavanı (§NAKLİYE). */
  carry?: number;
  cost: { gold: number; food: number };
  /** Bir birimin üretim süresi (saniye), dünya çarpanı uygulanmış; adetle çarpılır. */
  seconds: number;
  /** Çarpansız süre — yalnız `seconds`ten farklıysa dolu. Bkz. `CatalogBuilding.baseSeconds`. */
  baseSeconds: number | null;
  levelBased?: boolean;
  current?: number;
}

export interface CatalogTech extends CatalogEntry {
  level: number;
  nextCost: { gold: number; food: number };
  /** Dünya `construction` çarpanı uygulanmış süre. */
  nextSeconds: number;
  /** Çarpansız süre — yalnız farklıysa dolu. Bkz. `CatalogBuilding.baseSeconds`. */
  baseSeconds: number | null;
}

/**
 * ⭐ §verify — doğrulanmamış hesabın tavanları. `null` = kısıt yok.
 *
 * ⚠️ Sayılar SUNUCUDAN geliyor (panelden ayarlanabilir); istemcide sabit yazmak, yönetici
 * tavanı değiştirdiğinde ekranın yalan söylemesi demekti.
 */
export interface VerifyCaps {
  maxBuildingLevel: number;
  maxTechLevel: number;
  maxDefenseLevel: number;
  maxWarriors: number;
}

export interface CityCatalog {
  verify: VerifyCaps | null;
  buildings: CatalogBuilding[];
  units: CatalogUnit[];
  defenses: CatalogUnit[];
  techs: CatalogTech[];
}

export interface Coords {
  k: number;
  d: number;
  s: number;
}

/**
 * Bir ordu hareketi. Arayüz bunu **çıpa şehrin** (`cityId`) kale simgesi altına asar.
 * `direction`: `out` benim gönderdiğim · `in` bana gelen (yabancı) · `own` kendi ordumun dönüşü.
 */
export interface Movement {
  key: string;
  id: number;
  type: string;
  direction: 'out' | 'in' | 'own';
  /** Simge dosyası adı (`/assets/missions/<icon>.png`). */
  icon: string;
  cityId: number;
  startedAt: string;
  executeAt: string;
  origin: Coords | null;
  originPlayer: string | null;
  target: Coords | null;
  targetPlayer: string | null;
  /** Dönüş bacağında hangi görevden dönüldüğü (`attack` · `spy` · `transport` …). */
  returnOf: string | null;
  /** Dönüş, görev iptalinden mi doğdu? */
  canceled: boolean;
  /** Bu hareket iptal edilebilir mi (yalnız kendi, henüz işlenmemiş görevlerim)? */
  canCancel: boolean;
  /**
   * ⭐ HER harekette dolu (kullanıcı 2026-07-31): gelen saldırıda da hangi birimden kaç tane
   * geldiği görünür. Boş nesne yalnız "tüm askerler öldü, kahraman dönüyor" hâlinde olur.
   */
  units: Record<string, number>;
  /** Görevdeki kahramanlar — ad + seviye. Statlar sunucuda BİLEREK verilmez. */
  heroes: { name: string; level: number }[];
  /**
   * Taşınan yük: nakliye/destekte kargo, dönüşte ganimet. Saldırı/casusluk GİDİŞİNDE `null`
   * (payload'da yok) → savunan savaştan önce kaynak bilgisi görmez.
   */
  cargo?: { gold: number; food: number } | null;
}

export interface MessageRow {
  id: number;
  kind: string;
  side: string | null;
  battleId: number | null;
  missionId: number | null;
  subject: string;
  at: string;
  readAt: string | null;
  /**
   * ⚠️ `body` BU TİPTE YOK — liste ucu artık gövde taşımıyor (2026-08-03). Gövde modal
   * açılınca `useMessageBody(id)` ile geliyor; gerekçe `battle.controller.ts`'te.
   */
}

export interface WorldSlot {
  s: number;
  city: {
    id: number;
    name: string;
    playerId: number;
    username: string;
    score: number;
    isCapital: boolean;
    isOwn: boolean;
    /** Dünya sırası — canlı değil, son anlık görüntüden (§13.16). Hiç alınmadıysa `null`. */
    rank: number | null;
    /**
     * ⭐ Sıranın alındığı anlık görüntüdeki PUAN — `rank` ile aynı satırdan gelir, bu yüzden
     * ikisi daima aynı ana ait. ⚠️ Yukarıdaki `score` (canlı puan) ile karıştırma: onu `rank`
     * ile yan yana yazmak birbirini tutmayan bir çift üretir.
     * ⚠️ İsteğe bağlı: eski bir API sürümüne bakan istemci `undefined` görür ve yalnız sırayı yazar.
     */
    rankScore?: number | null;
    /** İttifak adı (ittifaksızsa null). */
    alliance: string | null;
    /**
     * ⭐ Benimle AYNI ittifakta mı (kendi şehirlerim hariç — sunucu `isOwn` olanları eler).
     * ⚠️ İsteğe bağlı: eski bir API sürümüne bakan istemci `undefined` görür ve rozet çizilmez.
     */
    isAlly?: boolean;
    /** Davet butonu için: hedef zaten bir ittifakta mı? */
    hasAlliance?: boolean;
    protection: 'beginner' | 'vacation' | null;
  } | null;
}

export const useCities = (): UseQueryResult<{ cities: CitySummary[] }> => useQuery({
  queryKey: ['cities'],
  queryFn: () => get<{ cities: CitySummary[] }>('/api/v1/cities'),
  enabled: useAuthed(),
});

export interface AccountInfo { email: string | null; emailVerified: boolean }

/**
 * ⭐ HESAP KÜNYESİ — e-posta + doğrulama durumu.
 *
 * ⚠️ Ayrı bir sorgu olmasının sebebi §verify: doğrulanmamış hesap artık gerçekten kısıtlı
 * (saldırı/nakliye/mesaj yok, seviye ve savaşçı tavanı var) ve ekranın bunu **düğmeyi
 * sunmadan önce** bilmesi gerekiyor. Üç bileşen (`VerifyBanner`, `AccountPanel`,
 * `ChatWindow`) aynı bilgiyi istiyor; üçü ayrı `fetch` yapıyordu — tek anahtarda toplandı.
 *
 * ⚠️ Yoklama YOK: doğrulama tek yönlü ve nadir bir olay. Doğrulama ekranından dönen oyuncu
 * için `queryClient.invalidateQueries(['account'])` yeterli.
 */
export const useAccount = (): UseQueryResult<AccountInfo> => useQuery({
  queryKey: ['account'],
  queryFn: () => get<AccountInfo>('/api/v1/auth/me'),
  staleTime: 5 * 60_000,
  enabled: useAuthed(),
});

/* ═══ TATİL MODU (§tatil modu) ════════════════════════════════════════════════ */

export interface VacationStatus {
  onVacation: boolean;
  since: string | null;
  /** Planlanmış otomatik çıkış (30 gün). */
  until: string | null;
  /** 48 saat dolmadan çıkılamaz. */
  canLeaveAt: string | null;
  endedAt: string | null;
  /**
   * Girişi engelleyen sebeplerin TAM listesi (tatildeyken boş). Dizi, tek boolean değil:
   * oyuncu "neden olmuyor" diye tahmin yürütmesin.
   */
  blockers: string[];
  rules: { minHours: number; maxDays: number; cooldownDays: number };
}

/**
 * ⚠️ **Yoklama YOK ama `staleTime` de yok.** Engel listesi hızla eskiyor: oyuncu bir kuyruk
 * başlatıp Seçenekler'e dönerse panel "girebilirsin" demeye devam etmemeli. Ekran her
 * açılışta tazeleniyor; sürekli yoklamaya gerek yok çünkü panel nadir ziyaret ediliyor.
 */
export const useVacation = (): UseQueryResult<VacationStatus> => useQuery({
  queryKey: ['vacation'],
  queryFn: () => get<VacationStatus>('/api/v1/vacation'),
  enabled: useAuthed(),
});

/**
 * ⭐ **EMNİYET AĞI ARALIĞI** — 5 sn → 60 sn (2026-07-28, kullanıcının sorusu üzerine incelendi).
 *
 * Şehir sorgusu bir zamanlar 5 saniyede bir yoklanıyordu ve gerekçesi *"kaynak sayacı canlı
 * görünsün"*di. İncelemede bunun **iki kez yanlış** olduğu çıktı:
 *
 *  1. Sayaç zaten yoklamayla çizilmiyor: bilgi çubuğu `production` hızıyla istemcide
 *     **ekstrapolasyon** yapıyor (`useTick`, saniyede bir). Yoklama sayacı akıtmıyor, yalnız
 *     çıpayı tazeliyordu — ki 60 saniyede bir tazelemek de aynı işi görüyor.
 *  2. Gerçekten kritik olan değişiklikler (kuyruk bitişi, savaş, gelen ordu, nakliye varışı)
 *     WS ile **anında** geliyor. Bu turda WS'te eksik olan iki konu da kapatıldı
 *     (`city:changed`, `city:founded`) — yani 5 saniyelik yoklama gerçek bir boşluğu örtüyordu.
 *
 * Ayrıca 5 saniyelik yoklama açık modallarda ölçülebilir bir **kullanıcı deneyimi hatası**
 * üretiyordu: her yeniden çizim modalın odak etkisini yeniden koşturuyor ve yazılan inputtan
 * odağı çalıyordu. Asıl kusur modaldaydı (düzeltildi) ama tetikleyici buydu.
 */
const SAFETY_NET_MS = 60_000;

/**
 * ⭐ **WS BAĞLIYKEN EMNİYET AĞI SEYREKLEŞİR** (kullanıcı, 2026-08-03).
 *
 * Kullanıcı ağ sekmesinde dakikada 7 eşzamanlı istek gördü ve haklı olarak sordu: madem
 * WS kuruldu, neden hâlâ bu kadar yoklama var? Cevap yukarıdaki mantığın devamı — emniyet
 * ağı **tanımı gereği WS'in çalışmadığı durum içindir.** Soket bağlıyken 60 saniyede bir
 * dönmesinin bir gerekçesi yok: kritik değişikliklerin hepsi olayla geliyor.
 *
 * ⚠️ **Neden sıfır değil de 5 dakika:** "bağlı" olmak "her olay eşlendi" demek değil. Bu
 * projede yazılıp eşlenmemiş olay üç kez yaşandı (`city:incoming_spy`, `city:changed`,
 * `vacation:ended`). Dördüncüsünün olmadığının garantisi yok; 5 dakika, böyle bir boşluğun
 * ekranı SÜRESİZ dondurmasını engelleyen ucuz bir sigorta.
 *
 * ⚠️ Değer bir **kanca**dan geliyor: bağlantı koptuğunda bileşen yeniden render olur ve
 * TanStack yeni aralığı alır. Sabit bir sayı olsaydı durum değişimine tepki veremezdi.
 * Yeniden bağlanmada `realtime.ts` zaten tüm sorguları bir kez tazeliyor.
 */
const WS_IDLE_MS = 300_000;

const useSafetyNet = (): number =>
  (useConnection() === 'online' ? WS_IDLE_MS : SAFETY_NET_MS);

/**
 * ⚠️⚠️ **KANCA `&&`'İN SAĞINA YAZILMAZ.** `enabled: cityId != null && useAuthed()` yazmak
 * kancayı KOŞULLU çağırır: `cityId` null iken `&&` kısa devre yapıp `useAuthed()`i atlar,
 * dolunca çağırır → kanca sırası değişir → React bileşeni çökertir ve **ekran bembeyaz kalır**
 * (2026-08-02'de tam olarak bu oldu; `SideMenu` "change in the order of Hooks" attı).
 * Bu yüzden kanca önce, koşul sonra.
 */
export const useCity = (cityId: number | null): UseQueryResult<CityDetail> => {
  const authed = useAuthed();
  return useQuery({
    queryKey: ['city', cityId],
    queryFn: () => get<CityDetail>(`/api/v1/cities/${cityId}`),
    /* ⚠️ `cityId` `localStorage['mw-active-city']`ten geliyor ve ÇIKIŞTAN SONRA DA duruyor —
       tek başına `cityId != null` misafirde 401 üretiyordu. */
    enabled: cityId != null && authed,
    refetchInterval: useSafetyNet(),
  });
};

export const useCatalog = (cityId: number | null): UseQueryResult<CityCatalog> => {
  const authed = useAuthed();
  return useQuery({
    queryKey: ['catalog', cityId],
    queryFn: () => get<CityCatalog>(`/api/v1/cities/${cityId}/catalog`),
    enabled: cityId != null && authed,
  });
};

export const useMovements = (): UseQueryResult<{ movements: Movement[] }> =>
  useQuery({
    queryKey: ['missions'],
    queryFn: () => get<{ movements: Movement[] }>('/api/v1/missions'),
    /**
     * ⚠️ Yoklama 10 sn → **60 sn**. Görev başlama/bitişi artık WebSocket ile anında geliyor
     * (`realtime.ts` bu sorguyu tazeliyor); 10 saniyelik yoklama aynı işi ikinci kez yapıp
     * boşuna istek üretiyordu. 60 sn **emniyet ağı** olarak duruyor: WS kopuk kaldığı bir
     * pencerede ekran tamamen donmasın.
     */
    refetchInterval: useSafetyNet(),
    enabled: useAuthed(),
  });

/**
 * ⭐ ORDULAR ROZETİ (kullanıcı, 2026-07-28) — sayı **tüm hareketlerin toplamı**, renk ise
 * "ekrana bakmadan ne bekliyorum" sorusunun cevabı:
 *   🔴 en az bir **bize gelen saldırı/casusluk** varsa (tehdit her şeyi ezer)
 *   🟢 tehdit yok ama **bizim başlattığımız** bir hareket varsa (dönüşler dahil)
 *   🟡 yalnızca **bize gelen nakliye/destek** varsa
 *
 * ⭐ Mağara işleri (§13.20) `direction: 'in'` taşır ve saldırı/casusluk olmadıkları için
 * doğal olarak **sarı** düşer; oyuncunun kendi seferi varsa yeşil onu ezer — kullanıcının
 * istediği sıra zaten bu kuralın içinde, ayrı bir özel durum yazmaya gerek kalmadı.
 */
export function armiesBadge(
  movements: Movement[],
): { count: number; tone: 'danger' | 'success' | 'warning' } | null {
  if (movements.length === 0) return null;
  const threat = movements.some((m) => m.direction === 'in' && (m.type === 'attack' || m.type === 'spy'));
  if (threat) return { count: movements.length, tone: 'danger' };
  const mine = movements.some((m) => m.direction === 'out' || m.direction === 'own');
  return { count: movements.length, tone: mine ? 'success' : 'warning' };
}

/**
 * ⭐ 15 sn → **emniyet ağı** (60 sn). Posta kutusuna satır yazan HER yol artık `message:written`
 * olayını da yazıyor (`writeMessage` içinde, çağıranlara bırakılmadı) → okunmamış rozeti WS ile
 * anında güncelleniyor. Yoklama yalnız "WS kopuk kaldığı pencerede ekran tamamen donmasın" diye
 * duruyor; mesajlar zaten kalıcı kayıtta, kaçan olay bir sonraki tazelemede görünür (§1 outbox).
 */
export interface MessagePage {
  unread: number;
  page: number;
  pageSize: number;
  /** Süzgeçli toplam — sayfa sayısı bundan hesaplanır. */
  total: number;
  counts: {
    reports: number; messages: number; unreadReports: number; unreadMessages: number;
  };
  items: MessageRow[];
}

/**
 * ⭐ SUNUCU TARAFLI SAYFALAMA (kullanıcı, 2026-08-01).
 *
 * ⚠️ Öncesinde tek bir `['messages']` anahtarı vardı, uç en fazla 100 satır döndürüyordu ve
 * istemci `slice` ile "sayfalıyordu" — yani sayfalama görsel bir yanılsamaydı. Anahtar artık
 * `kind` ve `page` taşıyor; sekme ya da sayfa değişince gerçekten yeni bir istek gidiyor.
 *
 * ⚠️ Rozetler için kullanılan yer (`Shell`) parametresiz çağırıyor ve `unread`i okuyor —
 * o yol bozulmadı, süzgeçsiz çağrı hâlâ genel sayacı veriyor.
 */
export const useMessages = (
  opts: { kind?: 'reports' | 'messages'; page?: number; pageSize?: number } = {},
): UseQueryResult<MessagePage> => useQuery({
  queryKey: ['messages', opts.kind ?? 'all', opts.page ?? 0, opts.pageSize ?? 20],
  queryFn: () => get<MessagePage>(
    `/api/v1/messages?kind=${opts.kind ?? 'all'}&page=${opts.page ?? 0}&limit=${opts.pageSize ?? 20}`,
  ),
  refetchInterval: useSafetyNet(),
  /** ⚠️ Sayfa değişince liste boşalıp zıplamasın — önceki sayfa yerinde kalır. */
  placeholderData: (prev) => prev,
  enabled: useAuthed(),
});

/**
 * ⭐ BAKIM DURUMU (admin Faz 2) — perdenin İLK YÜKLEMEDEKİ kaynağı.
 *
 * WS olayı (`world:maintenance`) yalnız **değişim anını** taşır; bakım sürerken sayfayı açan
 * oyuncu onu kaçırmış olur. Bu sorgu o boşluğu kapatır.
 *
 * ⚠️ Emniyet ağı burada **kopukken 30 sn** — diğerlerinin yarısı. Gerekçe: bakımın BİTTİĞİNİ
 * kaçırmak, başladığını kaçırmaktan daha can sıkıcı. Bakım bittiğinde WS olayı gelir ama tam
 * o anda soketi kopuk olan oyuncu, perde kalkana kadar oyunun kapalı olduğunu sanır. Sunucu
 * tarafı bu isteği **bellekten** karşılıyor (sorgu yok), yani sıklaştırmanın DB maliyeti sıfır.
 *
 * ⚠️ **Bağlıyken diğerleriyle aynı** (5 dk): sıklaştırmanın tek gerekçesi soketin KOPUK olduğu
 * pencereydi; bağlıyken `world:maintenance` olayı zaten dünya geneli yayınla geliyor ve
 * (istisnai olarak) yükü de taşıyor. `refetchOnWindowFocus` ayrıca duruyor.
 */
export interface WorldMaintenance {
  paused: boolean;
  state: string;
  notice: string | null;
  eta: string | null;
  pausedAt: string | null;
}

/**
 * ⭐ AÇIK DÜNYALAR — giriş/kayıt formundaki seçici (2026-08-03).
 *
 * ⚠️ **`enabled` kapısı YOK, bilerek**: bu sorgu tam olarak oturumu OLMAYAN oyuncu için var.
 * Sunucu ucu da guard'sız (`worlds-public.controller.ts`) ve bellekten karşılıyor.
 *
 * ⚠️ `staleTime` uzun: dünya listesi neredeyse hiç değişmiyor, form her açıldığında
 * yeniden çekmenin anlamı yok.
 */
export const useWorlds = (): UseQueryResult<{ worlds: Array<{ id: number; name: string }> }> =>
  useQuery({
    queryKey: ['worlds'],
    queryFn: () => get<{ worlds: Array<{ id: number; name: string }> }>('/api/v1/worlds'),
    staleTime: 600_000,
  });

export const useWorldState = (): UseQueryResult<WorldMaintenance> => useQuery({
  queryKey: ['world-state'],
  queryFn: () => get<WorldMaintenance>('/api/v1/world/state'),
  refetchInterval: useConnection() === 'online' ? WS_IDLE_MS : 30_000,
  // Sekmeye dönen oyuncu perdeyi anında doğru görsün.
  refetchOnWindowFocus: true,
  /* ⚠️ `/world/state` AuthGuard arkasında → misafir bakım perdesini zaten göremez (§10.x). */
  enabled: useAuthed(),
});

/* ── Aktif cihazlar (§admin Faz 3) ─────────────────────────────────────────── */

export interface DeviceRow {
  chainId: string;
  platform: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
  current: boolean;
}

/**
 * ⚠️ Emniyet ağı yoklaması **yok**: cihaz listesi yalnız Seçenekler ekranı açıkken görünür ve
 * kendiliğinden değişmez. Sürekli yoklamak, hiç kimsenin bakmadığı bir listeyi tazelemek olurdu.
 */
export const useDevices = (): UseQueryResult<{ items: DeviceRow[] }> => useQuery({
  queryKey: ['devices'],
  queryFn: () => get<{ items: DeviceRow[] }>('/api/v1/auth/sessions'),
});

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chainId: string) =>
      api(`/api/v1/auth/sessions/${chainId}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['devices'] }); },
  });
}

export function useRevokeOtherDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api('/api/v1/auth/sessions/revoke-others', { method: 'POST', body: {} }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['devices'] }); },
  });
}

export const useWorld = (k: number, d: number, enabled = true): UseQueryResult<{ slots: WorldSlot[] }> => useQuery({
  queryKey: ['world', k, d],
  queryFn: () => get<{ slots: WorldSlot[] }>(`/api/v1/world/${k}/${d}`),
  // ⭐ Açılışta aktif şehrin diyarı bilinene kadar BEKLENİR (1:1 parlamasın diye).
  enabled,
  // Diyar listesi nadiren değişir; şehir kurulunca `cities:changed` zaten tazeliyor.
  refetchInterval: useSafetyNet(),
});

/* ── Komuta Merkezi ────────────────────────────────────────────────────────── */

export interface NamedType {
  id: string;
  name: string;
}

export interface OverviewCity {
  id: number;
  name: string;
  coordinates: Coords;
  isCapital: boolean;
  resources: { gold: number; food: number };
  production: { goldPerHour: number; foodPerHour: number };
  buildings: Record<string, number>;
  units: Record<string, number>;
  defenses: Record<string, number>;
}

export interface Overview {
  player: {
    username: string;
    /**
     * ⚠️ **DONMUŞ** puan — anlık görüntüden (00/08/16), canlı `players.score`ten değil.
     * Sıralamalar sayfasındaki sayıyla birebir aynı olmalı; ayrışırlarsa sunucu tarafında
     * biri yanlış sütunu okuyor demektir (`command.controller.ts` · `/overview`).
     */
    score: number;
    rank: number | null;
    prevRank: number | null;
    /** Pozitif = yukarı çıktı. Önceki anlık görüntü yoksa `null`. */
    rankChange: number | null;
    totalPlayers: number;
    /** ⭐ Kendi askerî ünvanı. Oyuncu kendi rozetini her zaman görür; başkalarınınki yalnız ittifak listesinde. */
    meritTier: number | null;
    meritExpiresAt: string | null;
    alliance: string | null;
    allianceRank: number | null;
    allianceRankChange: number | null;
  };
  ranking: { takenAt: string | null; nextAt: string };
  techs: { id: string; name: string; level: number }[];
  unitTypes: NamedType[];
  defenseTypes: NamedType[];
  cities: OverviewCity[];
  totals: {
    gold: number; food: number;
    units: Record<string, number>;
    defenses: Record<string, number>;
  };
  gameNow: string;
  serverNow: string;
}

export type RankingKind = 'player' | 'alliance' | 'hero';

export interface RankingRow {
  rank: number;
  prevRank: number | null;
  change: number | null;
  id: number;
  name: string;
  isMine: boolean;
  /**
   * Satırın oyuncusu. ⚠️ Kahraman sekmesinde `id` HEROID'dir — mesaj düğmesi bu alanı
   * kullanmalı, `id`'yi değil. İttifak sekmesinde yoktur.
   */
  playerId?: number;
  /** Oyuncu sekmesi. ⚠️ Şehir sayısı BİLEREK yok — orijinal tabloda da yok (`scr_web02`). */
  score?: number;
  alliance?: string | null;
  /** İttifak sekmesi (kullanıcı: Sıra · İttifak Adı · Puan · Sıra Değişimi). */
  memberCount?: number;
  /** Kahraman sekmesi. */
  owner?: string;
  level?: number;
  xp?: number;
  dead?: boolean;
}

export interface RankingPage {
  kind: RankingKind;
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  myRank: number | null;
  myPage: number | null;
  takenAt: string | null;
  nextAt: string;
  /** Dolu ise liste yerine bu sebep gösterilir (ör. ittifaklar henüz açılmadı). */
  unavailable: string | null;
  rows: RankingRow[];
}

/**
 * Genel Durum. Yoklama aralığı 30 sn: kaynak burada **karar** için değil **döküm** için
 * gösteriliyor; Şehir ekranındaki 5 saniyelik canlı sayaç bu tabloda gereksiz yük olurdu.
 */
export const useOverview = (): UseQueryResult<Overview> => useQuery({
  queryKey: ['overview'],
  queryFn: () => get<Overview>('/api/v1/command/overview'),
  refetchInterval: useSafetyNet(),
});

/**
 * Sıralama sayfası. ⚠️ Sıra günde 3 kez donuyor → yoklamaya gerek yok; `staleTime` uzun tutuldu,
 * sayfa değiştirmek dışında yeniden istek atılmaz.
 */
export const useRankings = (kind: RankingKind, page: number): UseQueryResult<RankingPage> => useQuery({
  queryKey: ['rankings', kind, page],
  queryFn: () => get<RankingPage>(`/api/v1/command/rankings?kind=${kind}&page=${page}`),
  staleTime: 5 * 60_000,
});

/**
 * Savaş raporu.
 *
 * ⭐ Rapor modalı açıldığında veri **her seferinde sunucudan** çekilir (`staleTime: 0` +
 * `refetchOnMount: 'always'`): rapor bir savaşın kanıtıdır, önbellekten bayat gösterilmesi
 * "sayılar tutmuyor" tartışması doğurur.
 */
export const useBattle = (battleId: number | null): UseQueryResult<BattleReport> => useQuery({
  queryKey: ['battle', battleId],
  queryFn: () => get<BattleReport>(`/api/v1/battles/${battleId}`),
  enabled: battleId != null,
  staleTime: 0,
  refetchOnMount: 'always',
});

/**
 * ⭐ TEK MESAJIN GÖVDESİ — liste ucundan ayrıldı (2026-08-03).
 *
 * Liste her 60 saniyede bir dönüyordu ve gövdeleri de taşıyordu; oysa gövde yalnız modal
 * açılınca gerekiyor. `useBattle` ile aynı kalıp — savaş raporu zaten böyle çalışıyordu,
 * diğer rapor türleri de artık ona katıldı.
 *
 * ⚠️ `staleTime` VARSAYILAN (2 sn) bırakıldı, `useBattle`daki gibi 0 değil: gövde savaş
 * raporunun aksine değişmiyor (yazıldığı gibi kalıyor), aynı modalı kapatıp açan oyuncuya
 * ikinci bir istek attırmaya gerek yok.
 */
export const useMessageBody = (
  id: number | null,
): UseQueryResult<{ id: number; body: Record<string, unknown> }> => useQuery({
  queryKey: ['message-body', id],
  queryFn: () => get<{ id: number; body: Record<string, unknown> }>(`/api/v1/messages/${id}`),
  enabled: id != null,
});

export interface ReportLine {
  id: string;
  name: string;
  before: number;
  after: number;
  lost: number;
  restoredByFloor?: number;
}

export interface ReportHeroLine {
  name: string;
  level: number;
  /** `false` → «Yok Edildi !» (tek etiket, 2026-08-01). Kahraman eve döner ve diriltilebilir. */
  alive: boolean;
  /** Yalnız KENDİ kahramanlarında dolu; rakipte 0 (sızdırılmaz). */
  xpGained: number;
}

export interface BattleReport {
  battleId: number;
  side: 'attacker' | 'defender';
  winner: 'attacker' | 'defender' | 'draw';
  won: boolean;
  turns: number;
  night: boolean;
  at: string;
  /**
   * Kaynak (saldıran) → Hedef (savunan). Eski kayıtlarda null olabilir.
   * `name` savaş ANINDAKİ şehir adı, `owner` o anki oyuncu adı; ikisi de eski savaşlarda
   * yok (§13.10.1). Ekran `owner` varsa onu yazar (kullanıcı, 2026-08-07).
   */
  coords: {
    origin: { k: number; d: number; s: number; name?: string; owner?: string } | null;
    target: { k: number; d: number; s: number; name?: string; owner?: string } | null;
  } | null;
  sections: { key: string; title: string; lines: ReportLine[] }[];
  heroes: {
    mine: ReportHeroLine[];
    enemy: ReportHeroLine[];
    captured: { name: string; mine: boolean } | null;
  };
  wall: { level: number | null; integrity: number | null; destroyed: boolean } | null;
  /** `escaped` yalnız savunanda dolar — mağaranın içi saldırana asla gitmez. */
  cave: {
    present: boolean;
    broken: boolean;
    required: number;
    survivingDwarves: number;
    reason: string | null;
    escaped: Record<string, number> | null;
    repairUntil: string | null;
  } | null;
  loot: { gold: number; food: number } | null;
  /** Yalnız saldıran: ortaya çıkan havuz vs fiilen taşınan. */
  lootBreakdown: {
    /** Savaşta ortaya çıkan enkaz — saldıran KAYBETSE de dolu (tamamı savunana gider). */
    revealed: { gold: number; food: number };
    /** Fiilen eve taşınan yük. Saldıran kaybettiyse `null` → «Taşınan» satırı hiç çizilmez. */
    carried: { gold: number; food: number } | null;
    /**
     * ⭐ Oranca alınabilecekken TAŞIMA KAPASİTESİNE sığmayıp şehirde kalan kısım.
     * `null` = kapasite yetti → satır hiç çizilmez.
     */
    leftBehind: { gold: number; food: number } | null;
    /** Hayatta kalan ordunun toplam taşıma kapasitesi. */
    capacity: number | null;
  } | null;
  notes: string[];
  text: string;
  provenance: { seed: number; engineVersion: string; catalogHash: string };
}

/* ── Mutasyonlar ───────────────────────────────────────────────────────────── */

/** Kuyruğa ekleme/iptal ve saldırı sonrası nelerin tazeleneceği tek yerde tanımlı. */
function useInvalidate(): (keys: string[]) => Promise<void> {
  const qc = useQueryClient();
  return async (keys) => {
    await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };
}

export function useEnqueue(cityId: number | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { category: string; type: string; count?: number }) =>
      api(`/api/v1/cities/${cityId}/queues`, { method: 'POST', body: input }),
    onSuccess: () => invalidate(['city', 'catalog']),
  });
}

export function useCancelQueue() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (queueId: number) =>
      api(`/api/v1/cities/queues/${queueId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(['city', 'cities', 'catalog']),
  });
}

/**
 * ⭐ MAĞARA emri (§13.20). Emir asker TAŞIMAZ, yalnız bir sayaç kurar; asıl taşıma süre
 * dolunca olur. Bu yüzden iptal de serbesttir ve yan etkisizdir (`useCancelCaveJob`).
 */
export function useCaveJob(cityId: number | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { direction: 'store' | 'withdraw'; units: Record<string, number> }) =>
      api<{ seconds: number; area: number; finishAt: string }>(
        `/api/v1/cities/${cityId}/cave/${input.direction}`,
        { method: 'POST', body: { units: input.units } },
      ),
    onSuccess: () => invalidate(['city', 'missions']),
  });
}

/**
 * Süren mağara emrini iptal eder — **anlık ve yan etkisiz**. Geçen/kalan süreye göre hiçbir
 * hesap yapılmaz; ortada taşınan bir şey yok, yalnız bir sayaç var (§13.20).
 */
export function useCancelCaveJob(cityId: number | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api(`/api/v1/cities/${cityId}/cave/job`, { method: 'DELETE' }),
    onSuccess: () => invalidate(['city', 'missions']),
  });
}

/** Kuyrukta bekleyen savaşçı emrini bir sıra yukarı/aşağı taşır (süren emir taşınamaz). */
export function useMoveQueue() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { queueId: number; direction: 'up' | 'down' }) =>
      api(`/api/v1/cities/queues/${input.queueId}/move`, {
        method: 'POST', body: { direction: input.direction },
      }),
    onSuccess: () => invalidate(['city']),
  });
}

/** Dünya modalının hedef başına gösterdiği seçenekler — kural SUNUCUDA yaşar. */
export interface MissionOption {
  type: string;
  label: string;
  enabled: boolean;
  reason: string | null;
}

export interface TargetOptions {
  self: boolean;
  activeCity: boolean;
  target: { cityId: number; name: string; username: string } | null;
  options: MissionOption[];
  /** Bu hedefe bugün kalan saldırı hakkı (yalnız yabancı şehirde dolu). */
  attacksLeft: number | null;
  /**
   * Teleport beklemedeyse hazır olacağı an (ISO, oyun saati). Hazırsa `null`.
   * ⚠️ Sunucu eskiden bu bilgiyi yalnız sebep metninin İÇİNDE ham ISO olarak veriyordu;
   * geri sayım çizilemiyordu.
   */
  teleportReadyAt: string | null;
}

export const useMissionOptions = (
  originCityId: number | null, target: { k: number; d: number; s: number } | null,
): UseQueryResult<TargetOptions> => useQuery({
  queryKey: ['mission-options', originCityId, target?.k, target?.d, target?.s],
  queryFn: () => get<TargetOptions>(
    `/api/v1/missions/options?originCityId=${originCityId}&k=${target!.k}&d=${target!.d}&s=${target!.s}`,
  ),
  enabled: originCityId != null && target != null,
  staleTime: 0,
});

export interface SendMissionInput {
  type: string;
  originCityId: number;
  target: { k: number; d: number; s: number };
  units: Record<string, number>;
  heroIds?: number[];
  cargo?: { gold: number; food: number };
}

/**
 * ⭐ TEK UÇ, TÜM GÖREVLER (`POST /missions/send`) — doküman: bütün görevler yalnız Dünya
 * menüsünden yapılır. Teleport ANLIKTIR: görev listesi yerine şehir verisi değişir.
 */
export function useSendMission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SendMissionInput) => api<{ instant?: boolean }>('/api/v1/missions/send', {
      method: 'POST',
      body: { heroIds: [], ...input },
    }),
    // ⚠️ `temple` de tazelenir: kahraman sefere çıkınca tapınak listesindeki durumu değişiyor.
    onSuccess: () => invalidate(['city', 'cities', 'missions', 'world', 'mission-options', 'temple']),
  });
}

/**
 * Mesajı okundu işaretler.
 *
 * ⭐ **İyimser güncelleme**: sol paneldeki okunmamış sayacı sunucu yanıtını beklemeden düşer.
 * Aksi hâlde oyuncu mesaja tıklıyor, rozet bir tur daha eski sayıyı gösteriyor ve "okundu mu
 * olmadı mı" belirsizliği doğuyordu. Hata olursa `onError` gerçek veriyi geri çeker.
 */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/api/v1/messages/${id}/read`, { method: 'POST' }),
    /**
     * ⚠️ **ÖNEK EŞLEŞMESİ ŞART** (`setQueriesData`, çoğul — 2026-08-03'te düzeltildi).
     *
     * Buradaki güncelleme uzun süredir **ölüydü**: `getQueryData(['messages'])` TAM eşleşme
     * arıyor, oysa anahtar 2026-08-01'de sayfalamayla birlikte
     * `['messages', kind, page, pageSize]` oldu. `previous` daima `undefined` dönüyordu,
     * yani yorumda anlatılan iyimser düşüş hiç gerçekleşmiyordu — rozet ancak sunucu turu
     * dönünce azalıyordu. Tip hatası da vermiyordu (generic'i biz veriyoruz), bu yüzden
     * sessizce yaşadı.
     *
     * Artık ÖNEKLE eşleşen tüm `messages` sorguları güncelleniyor: Shell'in sayaç sorgusu
     * (`pageSize: 1`) ile Mesajlar ekranının liste sorgusu ayrı anahtarlarda ve ikisi de
     * aynı anda düşmeli.
     */
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ['messages'] });
      const previous = qc.getQueriesData<MessagePage>({ queryKey: ['messages'] });

      qc.setQueriesData<MessagePage>({ queryKey: ['messages'] }, (old) => {
        if (!old) return old;
        // Satır bu sayfada olmayabilir (sayaç sorgusunda `items` tek satır) — sayaç yine düşer.
        const target = old.items.find((m) => m.id === id);
        if (target?.readAt) return old;
        return {
          ...old,
          unread: Math.max(0, old.unread - 1),
          items: old.items.map((m) =>
            (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)),
        };
      });

      return { previous };
    },
    onError: (_err, _id, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['messages'] }); },
  });
}

/**
 * ⭐ MESAJ / RAPOR SİLME — tek satır da toplu seçim de AYNI uçtan (`ids` dizisi).
 *
 * ⚠️ Silme **iyimser değil**: `useMarkRead` gibi listeyi önceden düzeltmiyoruz. Okundu
 * işareti yanlışsa bedeli bir rozet, silme yanlışsa bedeli kalıcı veri — bu yüzden liste
 * yalnız sunucu onayından sonra tazeleniyor. Sayfa 10 satır gösteriyor, gecikme fark edilmez.
 */
export function useDeleteMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      api<{ deleted: number }>('/api/v1/messages/delete', { method: 'POST', body: { ids } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['messages'] }); },
  });
}

/** Yoldaki orduyu geri çağırır. Dönüş süresi GİDİLEN yol kadardır. */
export function useCancelMission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (missionId: number) =>
      api<{ returnSeconds: number; executeAt: string }>(`/api/v1/missions/${missionId}/cancel`, {
        method: 'POST', body: {},
      }),
    onSuccess: () => invalidate(['missions', 'city']),
  });
}

/* ═══ TAPINAK / KAHRAMANLAR ═════════════════════════════════════════════════ */

export interface HeroSkills { fAtk: number; fDef: number; mAtk: number; mDef: number }

/**
 * İstemcinin kendi durum sözlüğü (`k.java`): Şehirde · Görevde · Diriltiliyor · Yok Edildi.
 *
 * ⭐ `returning` = savaşta öldü, henüz eve varmadı. Etiketi de «Yok Edildi» ama Dirilt kapalı.
 * ⚠️ `destroyed` **KALKTI** (2026-08-01): kahraman artık hiç silinmiyor.
 */
export type HeroState = 'in_city' | 'on_mission' | 'dead' | 'returning' | 'reviving';

export interface HeroRow {
  id: number;
  name: string;
  level: number;
  xp: number;
  /** Bir sonraki seviyenin eşiği — ekranda `mevcut / eşik` yazar (oyunun kendi biçimi). */
  xpForNext: number;
  skills: HeroSkills;
  pointsTotal: number;
  pointsSpent: number;

  state: HeroState;
  reviveUntil: string | null;
  /** `returning` iken şehre varış anı — geri sayım bunu gösterir. */
  returningAt: string | null;
  reviveCost: { gold: number; food: number } | null;
  reviveSeconds: number | null;
}

export interface TempleView {
  templeLevel: number;
  /** ⭐ Çıkma ihtimalinde kullanılan değer: oyuncunun TÜM şehirlerinin tapınak toplamı. */
  templeTotal: number;
  heroCount: number;
  maxHeroes: number;
  pointsPerLevel: number;
  heroes: HeroRow[];
}

export const useTemple = (cityId: number | null): UseQueryResult<TempleView> => useQuery({
  queryKey: ['temple', cityId],
  queryFn: () => get<TempleView>(`/api/v1/cities/${cityId}/temple`),
  enabled: cityId != null,
  refetchInterval: useSafetyNet(),
});

/** Kahraman aksiyonları — hepsi tapınağı ve şehri tazeler (diriltme kaynak harcar). */
function useHeroAction<TBody>(path: (id: number) => string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body?: TBody }) =>
      api(path(id), { method: 'POST', body: body as Record<string, unknown> | undefined }),
    onSuccess: () => invalidate(['temple', 'city', 'cities']),
  });
}

export const useHeroSkills = () => useHeroAction<HeroSkills>((id) => `/api/v1/heroes/${id}/skills`);
export const useHeroRename = () => useHeroAction<{ name: string }>((id) => `/api/v1/heroes/${id}/rename`);
export const useHeroRevive = () => useHeroAction<never>((id) => `/api/v1/heroes/${id}/revive`);
export const useHeroReviveCancel = () =>
  useHeroAction<never>((id) => `/api/v1/heroes/${id}/revive/cancel`);

/* ═══ İTTİFAK (§13.15b) ══════════════════════════════════════════════════════ */

export interface AllianceMember {
  playerId: number;
  username: string;
  score: number;
  /** 1 Asker · 2 Konsey Üyesi · 3 Lider (orijinal istemcinin `q` alanı). */
  role: number;
  worldRank: number | null;
  /** ⭐ Çevrimiçilik yalnız ittifak üyeleri arasında görünür — başka hiçbir uç sızdırmaz. */
  online: boolean;
  /**
   * ⭐ §tatil modu — ekranda çevrimiçi/çevrimdışı YERİNE mavi «Tatilde» yazılır.
   * ⚠️ `online`dan bağımsız: tatildeki oyuncu oyuna girip durumuna bakıyor olabilir.
   */
  onVacation: boolean;
  /**
   * ⭐ ASKERÎ ÜNVAN (1 Subay … 4 Mareşal) — **yalnız bu uçtan gelir**.
   * ⚠️ Dünya/Sıralama/Arama yanıtlarına eklenmemeli: rozet aynı zamanda "ordusu yeni kırıldı"
   * istihbaratı ve düşmana bedavaya verilmemeli (kullanıcı kuralı).
   * Sunucu süresi geçmişleri zaten `null`a çeviriyor; istemcinin ayrıca süzmesi gerekmez.
   */
  meritTier: number | null;
  meritExpiresAt: string | null;
}

export interface AllianceView {
  alliance: {
    id: number;
    name: string;
    text: string;
    leader: string;
    myRole: number;
    score: number;
    rank: number | null;
    rankChange: number | null;
    memberCount: number;
    page: number;
    pages: number;
    members: AllianceMember[];
  } | null;
  canFound?: { ok: boolean; need: number; current: number };
  pendingApplications?: number[];
}

export interface AllianceListRow {
  id: number;
  name: string;
  memberCount: number;
  score: number;
  rank: number | null;
}

export const useAlliance = (page = 0): UseQueryResult<AllianceView> => useQuery({
  queryKey: ['alliance', page],
  queryFn: () => get<AllianceView>(`/api/v1/alliance?page=${page}`),
  refetchInterval: useSafetyNet(),
  enabled: useAuthed(),
});

/**
 * ⭐ HERKESE AÇIK İTTİFAK KÜNYESİ (2026-08-09) — sıralama/arama satırına tıklayınca açılan
 * modalı besler. Üye listesi, çevrimiçilik ve askerî ünvan **gelmez**; onlar ittifak içi bilgi.
 */
export interface AllianceProfile {
  id: number;
  name: string;
  text: string;
  leader: string;
  memberCount: number;
  score: number;
  rank: number | null;
  rankChange: number | null;
  foundedAt: string;
  isMine: boolean;
  alreadyApplied: boolean;
  /** Başvuru düğmesi çizilsin mi — kararı SUNUCU verir, istemci kural bilmez. */
  canApply: boolean;
  /** `canApply` false ise sebebi; oyuncuya düğme yerine bu yazılır. */
  applyBlockedReason: string | null;
}

export const useAllianceProfile = (
  id: number | null,
): UseQueryResult<AllianceProfile> => useQuery({
  queryKey: ['alliance-profile', id],
  queryFn: () => get<AllianceProfile>(`/api/v1/alliances/${id}`),
  enabled: id != null && useAuthed(),
  staleTime: 15_000,
});

export const useAllianceSearch = (query: string): UseQueryResult<{ alliances: AllianceListRow[] }> =>
  useQuery({
    queryKey: ['alliances', query],
    queryFn: () => get<{ alliances: AllianceListRow[] }>(
      `/api/v1/alliances?query=${encodeURIComponent(query)}`),
    staleTime: 30_000,
  });

/* ═══ Arama (§13.18) ═══════════════════════════════════════════════════════════ */

/**
 * ⭐ Satır **Dünya ekranının `city` nesnesiyle aynı şekilde** — sonuç doğrudan `TargetModal`'a
 * veriliyor, ikinci bir dönüşüm yok (orijinalde de arama sonucunun menüsü dünya satırının
 * menüsüydü, `i.java:542`).
 */
export interface SearchPlayerRow {
  k: number; d: number; s: number;
  id: number; name: string; playerId: number; username: string; score: number;
  isCapital: boolean; isOwn: boolean; rank: number | null;
  alliance: string | null; hasAlliance: boolean;
  protection: 'beginner' | 'vacation' | null;
}

export interface SearchAllianceRow {
  id: number; name: string; rank: number | null; memberCount: number; score: number;
}

type PlayerQuery = { name: string } | { k: string; d: string; s: string };

export const usePlayerSearch = (
  input: PlayerQuery, enabled: boolean,
): UseQueryResult<{ items: SearchPlayerRow[]; truncated: boolean }> => {
  const params = new URLSearchParams({ kind: 'player' });
  if ('name' in input) params.set('name', input.name.trim());
  else {
    params.set('k', input.k); params.set('d', input.d);
    if (input.s !== '') params.set('s', input.s);
  }
  const qs = params.toString();
  return useQuery({
    queryKey: ['search', qs],
    queryFn: () => get<{ items: SearchPlayerRow[]; truncated: boolean }>(
      `/api/v1/command/search?${qs}`),
    enabled,
    staleTime: 30_000,
  });
};

export const useAllianceSearchTab = (
  name: string, enabled: boolean,
): UseQueryResult<{ items: SearchAllianceRow[]; truncated: boolean }> =>
  useQuery({
    queryKey: ['search', 'alliance', name],
    queryFn: () => get<{ items: SearchAllianceRow[]; truncated: boolean }>(
      `/api/v1/command/search?kind=alliance&name=${encodeURIComponent(name.trim())}`),
    enabled,
    staleTime: 30_000,
  });

/** İttifak aksiyonları — ittifak görünümü + ilgili sütunları taşıyan ekranlar tazelenir. */
function useAllianceAction<TBody>(path: (body: TBody) => string, toBody?: (b: TBody) => unknown) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: TBody) =>
      api(path(body), { method: 'POST', body: (toBody ? toBody(body) : body) as Record<string, unknown> | undefined }),
    onSuccess: () => invalidate(['alliance', 'alliances', 'overview', 'world', 'rankings', 'messages']),
  });
}

export const useAllianceFound = () =>
  useAllianceAction<{ name: string }>(() => '/api/v1/alliance');
export const useAllianceLeave = () =>
  useAllianceAction<void>(() => '/api/v1/alliance/leave', () => undefined);
export const useAllianceDisband = () =>
  useAllianceAction<void>(() => '/api/v1/alliance/disband', () => undefined);
export const useAllianceRename = () =>
  useAllianceAction<{ name: string }>(() => '/api/v1/alliance/rename');
export const useAllianceText = () =>
  useAllianceAction<{ text: string }>(() => '/api/v1/alliance/text');
export const useAllianceBroadcast = () =>
  useAllianceAction<{ text: string }>(() => '/api/v1/alliance/message');
export const useAllianceApply = () =>
  useAllianceAction<{ allianceId: number }>(() => '/api/v1/alliance/applications');
export const useAllianceInvite = () =>
  useAllianceAction<{ playerId: number }>(() => '/api/v1/alliance/invites');
export const useAllianceMemberAction = () =>
  useAllianceAction<{ playerId: number; action: 'kick' | 'promote' | 'demote' | 'transfer' }>(
    (b) => `/api/v1/alliance/members/${b.playerId}/${b.action}`, () => undefined);
/** Mesaj kutusundaki Kabul/Red — davet ve başvuru aynı uçtan karara bağlanır. */
export const useAllianceDecide = () =>
  useAllianceAction<{ inviteId: number; accept: boolean }>(
    (b) => `/api/v1/alliance/invites/${b.inviteId}/${b.accept ? 'accept' : 'reject'}`, () => undefined);

/* ── ÖZEL MESAJLAŞMA (§13.12) ──────────────────────────────────────────────────
 *
 * ⚠️ Sohbet, Mesajlar kutusundan AYRI bir veri yolu: rapor kutusu (`messages`) kalıcı ve
 * oyuncu-bazlı, sohbet anlık ve kanal-bazlı. Mesajlar ekranı ikisini tarihe göre birleştirir
 * (kullanıcı kararı 2026-07-31), ama sunucuda `messages` tablosuna DM satırı yazılmaz.
 */

export interface ChatConversation {
  channelId: number;
  playerId: number;
  username: string;
  lastMessage: string | null;
  lastFromMe: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Bu oyuncuyu BEN engelledim mi (yazma kutusu kapanır, sebebi söylenir)? */
  blocked: boolean;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  senderId: number | null;
  body: string;
  createdAt: string;
  /** İyimser balon: sunucu onayı gelene kadar soluk çizilir. */
  pending?: boolean;
}

export const useChatConversations = (): UseQueryResult<{ items: ChatConversation[]; unread: number }> =>
  useQuery({
    queryKey: ['chat'],
    queryFn: () => get<{ items: ChatConversation[]; unread: number }>('/api/v1/chat/conversations'),
    refetchInterval: useSafetyNet(),
    enabled: useAuthed(),
  });

/**
 * Sohbet geçmişi — **keyset sayfalama** (projede ilk `useInfiniteQuery`).
 * Sunucu en YENİ mesajı önce döner; `before` bir sonraki sayfanın imleci (en eski görünen id).
 */
export const useChatHistory = (
  channelId: number | null,
): UseInfiniteQueryResult<{ pages: { items: ChatMessage[]; hasMore: boolean }[] }, Error> =>
  useInfiniteQuery({
    queryKey: ['chat-history', channelId],
    enabled: channelId != null,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => get<{ items: ChatMessage[]; hasMore: boolean }>(
      `/api/v1/chat/conversations/${channelId}/messages${pageParam ? `?before=${pageParam}` : ''}`,
    ),
    getNextPageParam: (last) => (last.hasMore && last.items.length > 0
      ? last.items[last.items.length - 1]!.id
      : undefined),
  });

/** Sohbeti aç (yoksa yaratır) → kanal kimliği. */
export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (playerId: number) =>
      api<{ channelId: number }>('/api/v1/chat/conversations', {
        method: 'POST', body: { withPlayerId: playerId },
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['chat'] }); },
  });
}

/**
 * Mesaj gönderme — **iyimser**: balon anında listeye eklenir (`useMarkRead` deseni).
 * `clientMsgId` hem çift gönderimi (ağ tekrarı) hem çift balonu (WS yankısı) engeller.
 */
export function useSendChatMessage(channelId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; clientMsgId: string }) =>
      api<ChatMessage>(`/api/v1/chat/conversations/${channelId}/messages`, {
        method: 'POST', body: v,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['chat-history', channelId] });
      void qc.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: number) =>
      api(`/api/v1/chat/conversations/${channelId}/read`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['chat'] }); },
  });
}

/** Sohbeti sil — YALNIZ bende; karşı tarafta aynen durur, sunucudan silinmez. */
export function useClearConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: number) =>
      api(`/api/v1/chat/conversations/${channelId}`, { method: 'DELETE' }),
    onSuccess: (_d, channelId) => {
      void qc.invalidateQueries({ queryKey: ['chat'] });
      void qc.invalidateQueries({ queryKey: ['chat-history', channelId] });
    },
  });
}

/* ═══ İttifak sohbeti (§13.15c) ═════════════════════════════════════════════════ */

export interface AllianceChatMember {
  playerId: number;
  username: string;
  role: number;
  online: boolean;
  muted: boolean;
  mutedUntil: string | null;
}

export interface AllianceChatMessage {
  id: number;
  senderId: number | null;
  /** null = dünyadan kaldırılmış oyuncu; ekran «kaldırılmış oyuncu» yazar. */
  senderName: string | null;
  body: string;
  mentions: { id: number; at: number; len: number }[];
  createdAt: string;
  /** İyimser balon: sunucu onayı gelene kadar soluk çizilir. */
  pending?: boolean;
}

export interface AllianceChatOpen {
  channelId: number;
  allianceId: number;
  myRole: number;
  canWrite: boolean;
  reason: 'disabled' | 'unverified' | 'banned' | 'muted' | 'too_new' | null;
  blockedUntil: string | null;
  blockedText: string | null;
  members: AllianceChatMember[];
  truncated: boolean;
}

/**
 * Açılış paketi — kanal + yazma hakkı + üye listesi tek çağrıda.
 *
 * ⚠️ **`enabled` KAPALIYKEN HİÇ İSTEK GİTMEZ** (kullanıcı şartı: sheet kapalıyken tam
 * sessizlik). Bu yüzden `refetchInterval: useSafetyNet()` de KONMADI: açıkken WS zaten
 * anlık, kapalıyken hiçbir şey dönmemeli. Emniyet ağı olarak pencereye dönünce tazeleme yeter.
 */
export const useAllianceChat = (enabled: boolean): UseQueryResult<AllianceChatOpen> => {
  const authed = useAuthed();
  return useQuery({
    queryKey: ['alliance-chat'],
    queryFn: () => get<AllianceChatOpen>('/api/v1/alliance/chat'),
    enabled: enabled && authed,
  });
};

/** Geçmiş — keyset sayfalama; `before` bir sonraki sayfanın imleci (en eski görünen id). */
export const useAllianceChatHistory = (
  channelId: number | null,
): UseInfiniteQueryResult<{ pages: { items: AllianceChatMessage[]; hasMore: boolean }[] }, Error> =>
  useInfiniteQuery({
    queryKey: ['alliance-chat-history', channelId],
    enabled: channelId != null,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => get<{ items: AllianceChatMessage[]; hasMore: boolean }>(
      `/api/v1/alliance/chat/messages${pageParam ? `?before=${pageParam}` : ''}`,
    ),
    getNextPageParam: (last) => (last.hasMore && last.items.length > 0
      ? last.items[last.items.length - 1]!.id
      : undefined),
  });

export function useSendAllianceChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; clientMsgId: string }) =>
      api<AllianceChatMessage>('/api/v1/alliance/chat/messages', { method: 'POST', body: v }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['alliance-chat-history'] }); },
  });
}

/** Susturma / kaldırma — ikisi de üye listesini ve yazma hakkını tazeler. */
export function useAllianceChatMute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { playerId: number; minutes: number | null; reason?: string }) =>
      api('/api/v1/alliance/chat/mutes', { method: 'POST', body: v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['alliance-chat'] }); },
  });
}

export function useAllianceChatUnmute() {
  const qc = useQueryClient();
  return useMutation({
    // ⚠️ Gövdesiz DELETE — `api.ts` bu durumda `content-type` GÖNDERMİYOR (Fastify 400 verirdi).
    mutationFn: (playerId: number) =>
      api(`/api/v1/alliance/chat/mutes/${playerId}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['alliance-chat'] }); },
  });
}

export function useBlockPlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { playerId: number; blocked: boolean }) => (v.blocked
      ? api('/api/v1/chat/blocks', { method: 'POST', body: { playerId: v.playerId } })
      : api(`/api/v1/chat/blocks/${v.playerId}`, { method: 'DELETE' })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['chat'] }); },
  });
}

export const useReportChat = () => useMutation({
  mutationFn: (v: { channelId: number; messageId?: number | null; reason: string; note?: string }) =>
    api('/api/v1/chat/reports', { method: 'POST', body: v }),
});
