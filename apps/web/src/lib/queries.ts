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

export interface CatalogEntry {
  id: string;
  name: string;
  requirements: Requirement;
}

export interface CatalogBuilding extends CatalogEntry {
  level: number;
  maxLevel: number;
  nextCost: { gold: number; food: number } | null;
}

export interface CatalogUnit extends CatalogEntry {
  area: number;
  speed?: number;
  cost: { gold: number; food: number };
  levelBased?: boolean;
  current?: number;
}

export interface CatalogTech extends CatalogEntry {
  level: number;
  nextCost: { gold: number; food: number };
}

export interface CityCatalog {
  buildings: CatalogBuilding[];
  units: CatalogUnit[];
  defenses: CatalogUnit[];
  techs: CatalogTech[];
}

export interface MissionRow {
  id: number;
  type: string;
  originCityId: number | null;
  targetCityId: number | null;
  target: { k: number; d: number; s: number } | null;
  executeAt: string;
  units: Record<string, number>;
}

export interface IncomingRow {
  id: number;
  targetCityId: number;
  origin: { k: number; d: number; s: number } | null;
  arrivesAt: string;
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

export const useMissions = (): UseQueryResult<{ outgoing: MissionRow[]; incoming: IncomingRow[] }> =>
  useQuery({
    queryKey: ['missions'],
    queryFn: () => get<{ outgoing: MissionRow[]; incoming: IncomingRow[] }>('/api/v1/missions'),
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

export const useBattle = (battleId: number | null): UseQueryResult<BattleReport> => useQuery({
  queryKey: ['battle', battleId],
  queryFn: () => get<BattleReport>(`/api/v1/battles/${battleId}`),
  enabled: battleId != null,
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

export function useSendAttack() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      originCityId: number;
      target: { k: number; d: number; s: number };
      units: Record<string, number>;
    }) => api('/api/v1/missions/attack', {
      method: 'POST',
      body: { type: 'attack', ...input, heroIds: [] },
    }),
    // Saldırı hem şehri (birlikler düştü) hem görev listesini değiştirir.
    onSuccess: () => invalidate(['city', 'missions', 'world']),
  });
}

export function useMarkRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api(`/api/v1/messages/${id}/read`, { method: 'POST' }),
    onSuccess: () => invalidate(['messages']),
  });
}
