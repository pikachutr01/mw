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
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from './api.ts';
import { noteServerTime } from './hooks.ts';

async function get<T>(path: string): Promise<T> {
  const r = await api<T>(path);
  noteServerTime((r as { serverNow?: string } | null)?.serverNow);
  return r;
}

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
  production: { goldPerHour: number; foodPerHour: number };
  /** Dünya hız çarpanları (1 = klasik). Bilgi çubuğundaki ⚡ rozeti bunu okur. */
  speed?: { resource: number; travel: number };
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
  /** Bir sonraki seviyenin süresi (saniye). Tavandaysa null. */
  nextSeconds: number | null;
}

export interface CatalogUnit extends CatalogEntry {
  area: number;
  speed?: number;
  /** Ganimet taşıma kapasitesi — nakliye/destek formunun tavanı (§NAKLİYE). */
  carry?: number;
  cost: { gold: number; food: number };
  /** Bir birimin üretim süresi (saniye); adetle çarpılır. */
  seconds: number;
  levelBased?: boolean;
  current?: number;
}

export interface CatalogTech extends CatalogEntry {
  level: number;
  nextCost: { gold: number; food: number };
  nextSeconds: number;
}

export interface CityCatalog {
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
  /** Yalnız KENDİ hareketlerimde dolu; yabancı harekette birleşim gizlidir (§13.10.1). */
  units?: Record<string, number>;
  /** Nakliye/destek yükü — saldırı ve casuslukta `null` (gizli). */
  cargo?: { gold: number; food: number } | null;
}

export interface MessageRow {
  id: number;
  kind: string;
  side: string | null;
  battleId: number | null;
  missionId: number | null;
  subject: string;
  body: Record<string, unknown>;
  at: string;
  readAt: string | null;
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
    /** İttifak adı — şema henüz yok, daima `null`. */
    alliance: string | null;
    protection: 'beginner' | 'vacation' | null;
  } | null;
}

export const useCities = (): UseQueryResult<{ cities: CitySummary[] }> => useQuery({
  queryKey: ['cities'],
  queryFn: () => get<{ cities: CitySummary[] }>('/api/v1/cities'),
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

export const useCity = (cityId: number | null): UseQueryResult<CityDetail> => useQuery({
  queryKey: ['city', cityId],
  queryFn: () => get<CityDetail>(`/api/v1/cities/${cityId}`),
  enabled: cityId != null,
  refetchInterval: SAFETY_NET_MS,
});

export const useCatalog = (cityId: number | null): UseQueryResult<CityCatalog> => useQuery({
  queryKey: ['catalog', cityId],
  queryFn: () => get<CityCatalog>(`/api/v1/cities/${cityId}/catalog`),
  enabled: cityId != null,
});

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
    refetchInterval: SAFETY_NET_MS,
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
export const useMessages = (): UseQueryResult<{ unread: number; items: MessageRow[] }> => useQuery({
  queryKey: ['messages'],
  queryFn: () => get<{ unread: number; items: MessageRow[] }>('/api/v1/messages'),
  refetchInterval: SAFETY_NET_MS,
});

export const useWorld = (k: number, d: number): UseQueryResult<{ slots: WorldSlot[] }> => useQuery({
  queryKey: ['world', k, d],
  queryFn: () => get<{ slots: WorldSlot[] }>(`/api/v1/world/${k}/${d}`),
  // Diyar listesi nadiren değişir; şehir kurulunca `cities:changed` zaten tazeliyor.
  refetchInterval: SAFETY_NET_MS,
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
    score: number;
    /** Bir sonraki puana kalan kaynak (1.000 kaynak = 1 puan). */
    toNextPoint: number;
    rank: number | null;
    prevRank: number | null;
    /** Pozitif = yukarı çıktı. Önceki anlık görüntü yoksa `null`. */
    rankChange: number | null;
    totalPlayers: number;
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
  /** Oyuncu sekmesi. ⚠️ Şehir sayısı BİLEREK yok — orijinal tabloda da yok (`scr_web02`). */
  score?: number;
  alliance?: string | null;
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
  refetchInterval: SAFETY_NET_MS,
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

export interface ReportLine {
  id: string;
  name: string;
  before: number;
  after: number;
  lost: number;
  restoredByFloor?: number;
}

export interface BattleReport {
  battleId: number;
  side: 'attacker' | 'defender';
  winner: 'attacker' | 'defender' | 'draw';
  won: boolean;
  turns: number;
  night: boolean;
  at: string;
  sections: { key: string; title: string; lines: ReportLine[] }[];
  loot: { gold: number; food: number } | null;
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
    onSuccess: () => invalidate(['city', 'cities', 'missions', 'world', 'mission-options']),
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
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ['messages'] });
      const previous = qc.getQueryData<{ unread: number; items: MessageRow[] }>(['messages']);
      if (previous) {
        const target = previous.items.find((m) => m.id === id);
        if (target && !target.readAt) {
          qc.setQueryData(['messages'], {
            unread: Math.max(0, previous.unread - 1),
            items: previous.items.map((m) =>
              (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)),
          });
        }
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['messages'], ctx.previous);
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['messages'] }); },
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

/** İstemcinin kendi durum sözlüğü (`k.java`): Şehirde · Görevde · Diriltiliyor · Yok Edildi. */
export type HeroState = 'in_city' | 'on_mission' | 'dead' | 'reviving' | 'destroyed';

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
  disappearsAt: string | null;
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
  refetchInterval: SAFETY_NET_MS,
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
