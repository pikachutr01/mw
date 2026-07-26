import { z } from 'zod';
import { unitCounts } from './mission.ts';

/**
 * Menüdeki DAHİLİ SAVAŞ SİMÜLATÖRÜ — gerçek savaşlarla AYNI motoru çağırır (§0.0).
 * Savaş animasyonu yok; çıktı metin raporudur.
 */
export const techLevels = z.record(z.string(), z.number().int().min(0));

export const simulateSide = z.object({
  counts: unitCounts,
  tech: techLevels.optional(),
  heroes: z.array(z.object({
    level: z.number().int().min(0).max(100),
    fAtk: z.number().int().min(0).default(0),
    fDef: z.number().int().min(0).default(0),
  })).max(5).optional(),
  temple: z.number().int().min(0).optional(),
  heroCount: z.number().int().min(0).max(5).optional(),
});

export const simulateRequest = z.object({
  attacker: simulateSide,
  defender: simulateSide,
  night: z.boolean().default(false),
  nightVisionAttacker: z.number().int().min(0).default(0),
  nightVisionDefender: z.number().int().min(0).default(0),
  /** Verilmezse sunucu rastgele üretir ve yanıtta döner → aynı savaş tekrar oynatılabilir. */
  seed: z.union([z.string(), z.number()]).optional(),
  /** "Aynı savaşı N kez çevir, dağılımı gör" — seed her turda değişir. */
  repeat: z.number().int().min(1).max(50).default(1),
});
export type SimulateRequest = z.infer<typeof simulateRequest>;
