import { z } from 'zod';

/**
 * Şehir ekranı ve üretim/ilerletme kuyruğu sözleşmeleri (§13.9, §13.11).
 *
 * ⚠️ `worldId` ve `playerId` BURADA YOK — ikisi de imzalı token'dan gelir, istek yükünden asla
 * okunmaz (§13.12.1b dünya yalıtımı).
 */

/** Kuyruk kategorileri — dördü de aynı deseni kullanır (§13.9). */
export const queueCategory = z.enum(['building', 'unit', 'defense', 'tech']);
export type QueueCategory = z.infer<typeof queueCategory>;

export const enqueueRequest = z.object({
  category: queueCategory,
  /** Katalog `id`'si: `farm` · `dwarf` · `archer_tower` · `blacksmithing` … */
  type: z.string().min(1).max(40),
  /**
   * Yalnız adetli kalemlerde (savaşçı, adetli savunma birimi). Yapı/teknik ve Sur/Büyü Kalkanı
   * seviye ilerletir → `count` gönderilmez veya 1'dir.
   */
  count: z.number().int().positive().max(1_000_000).optional(),
});
export type EnqueueRequest = z.infer<typeof enqueueRequest>;

export const queueItem = z.object({
  id: z.number().int().positive(),
  category: queueCategory,
  itemType: z.string(),
  targetLevel: z.number().int().nullable(),
  count: z.number().int().nullable(),
  /** Sunucu otoritesi: geri sayım BUNDAN çizilir (§7). */
  startedAt: z.string().datetime(),
  finishAt: z.string().datetime(),
});
export type QueueItem = z.infer<typeof queueItem>;

export const citySummary = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  coordinates: z.object({ k: z.number().int(), d: z.number().int(), s: z.number().int() }),
  isCapital: z.boolean(),
});
export type CitySummary = z.infer<typeof citySummary>;

/** Dünya ekranı satırı — §13.16.5: asker ve kaynak GÖSTERİLMEZ. */
export const worldSlot = z.object({
  s: z.number().int(),
  city: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    playerId: z.number().int().positive(),
    username: z.string(),
    score: z.number().int().nonnegative(),
    isCapital: z.boolean(),
    /** Bu şehir isteği yapan oyuncunun mu? */
    isOwn: z.boolean(),
    /** Saldırıya kapalı mı (acemi koruması / tatil modu)? Sebep gösterilir, süre gösterilmez. */
    protection: z.enum(['beginner', 'vacation']).nullable(),
  }).nullable(),
});
export type WorldSlot = z.infer<typeof worldSlot>;
