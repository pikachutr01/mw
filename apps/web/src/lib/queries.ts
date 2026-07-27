/**
 * Sunucu durumu (TanStack Query). Her yanıtta `serverNow` yakalanır → geri sayımlar sunucu
 * saatinden çizilir (§7).
 *
 * Tazeleme aralıkları oyunun temposuna göre: kaynak sürekli birikir (5 sn), görevler dakikalar
 * mertebesinde (10 sn), dünya listesi nadiren değişir (30 sn).
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
  buildings: Record<string, number>;
  units: Record<string, number>;
  defenses: Record<string, number>;
  techs: Record<string, number>;
  queues: QueueRow[];
  capacity: { castle: BudgetStatus; defense: BudgetStatus };
  gameNow: string;
  serverNow: string;
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
    protection: 'beginner' | 'vacation' | null;
  } | null;
}

export const useCities = (): UseQueryResult<{ cities: CitySummary[] }> => useQuery({
  queryKey: ['cities'],
  queryFn: () => get<{ cities: CitySummary[] }>('/api/v1/cities'),
});

export const useCity = (cityId: number | null): UseQueryResult<CityDetail> => useQuery({
  queryKey: ['city', cityId],
  queryFn: () => get<CityDetail>(`/api/v1/cities/${cityId}`),
  enabled: cityId != null,
  // Kaynak tembel birikiyor → sık tazeleme oyuncunun sayacı "canlı" görmesini sağlar.
  refetchInterval: 5000,
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
    // ⚠️ Geçici: WS gelene kadar yoklama. Kullanıcı kuralı "olay ANINDA görünmeli" → sıradaki iş.
    refetchInterval: 10_000,
  });

export const useMessages = (): UseQueryResult<{ unread: number; items: MessageRow[] }> => useQuery({
  queryKey: ['messages'],
  queryFn: () => get<{ unread: number; items: MessageRow[] }>('/api/v1/messages'),
  refetchInterval: 15_000,
});

export const useWorld = (k: number, d: number): UseQueryResult<{ slots: WorldSlot[] }> => useQuery({
  queryKey: ['world', k, d],
  queryFn: () => get<{ slots: WorldSlot[] }>(`/api/v1/world/${k}/${d}`),
  refetchInterval: 30_000,
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
    onSuccess: () => invalidate(['city', 'catalog']),
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
