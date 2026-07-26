import { z } from 'zod';
import { cityId, coordinates, resources } from './common.ts';

export const missionType = z.enum([
  'attack', 'transport', 'support', 'spy', 'found_city', 'teleport', 'return',
]);
export type MissionType = z.infer<typeof missionType>;

export const unitCounts = z.record(z.string(), z.number().int().nonnegative());

export const sendMissionRequest = z.object({
  type: missionType.exclude(['return']),
  originCityId: cityId,
  target: coordinates,
  units: unitCounts,
  heroIds: z.array(z.number().int().positive()).max(5).default([]),
  /** Nakliye/şehir kurma ile götürülen kaynak. */
  cargo: resources.optional(),
});
export type SendMissionRequest = z.infer<typeof sendMissionRequest>;

export const mission = z.object({
  id: z.number().int().positive(),
  type: missionType,
  originCityId: cityId.nullable(),
  target: coordinates,
  /** Sunucu otoritesi: geri sayım BUNDAN çizilir, istemci lokal saate güvenmez (§7). */
  executeAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /** Hedef oyuncu görürse birleşim GİZLİ kalır (§13.10.1). */
  units: unitCounts.nullable(),
});
export type Mission = z.infer<typeof mission>;

/** Savaş raporundaki ganimet dökümü (§13.10.4). */
export const lootBreakdown = z.object({
  taken: resources,
  fromDebris: resources,
  fromPlunder: resources,
  leftoverDebrisToDefender: resources,
  plunderNotCarried: resources,
  effectivePlunderRate: z.number().nonnegative(),
});
export type LootBreakdown = z.infer<typeof lootBreakdown>;
