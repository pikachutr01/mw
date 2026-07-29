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
  /** Nakliye ve destekte götürülen kaynak (taşıma kapasitesiyle sınırlı). */
  cargo: resources.optional(),
});
export type SendMissionRequest = z.infer<typeof sendMissionRequest>;

/**
 * Dünya modalının bir hedef için gösterdiği seçenekler. Sunucu üretir — istemci "kime ne
 * gönderilebilir" kuralını KENDİ hesaplamaz, hesaplasaydı kural iki yerde yaşardı.
 */
export const missionOption = z.object({
  type: missionType.exclude(['return', 'attack']).or(z.literal('attack')),
  /** Ekranda görünen Türkçe ad (§13.14). */
  label: z.string(),
  enabled: z.boolean(),
  /** Kapalıysa SEBEBİ — düğmeyi sessizce gizlemek oyuncuyu şaşırtıyordu. */
  reason: z.string().nullable(),
});
export type MissionOption = z.infer<typeof missionOption>;

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
  // Eski kayıtlar tek oran taşır, yeniler kaynak başına ayrı oran (2026-07-30 havuz modeli).
  effectivePlunderRate: z.number().nonnegative().optional(),
  effectiveRates: z.object({ gold: z.number().nonnegative(), food: z.number().nonnegative() }).optional(),
});
export type LootBreakdown = z.infer<typeof lootBreakdown>;
