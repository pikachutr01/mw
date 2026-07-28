import { z } from 'zod';

/** Tüm sorgular dünya-kapsamlıdır (§0.0/1) — dünya kimliği her istekte bağlamdan gelir. */
export const worldId = z.number().int().positive();
export const playerId = z.number().int().positive();
export const cityId = z.number().int().positive();

export const coordinates = z.object({
  k: z.number().int().min(0), // kıta
  d: z.number().int().min(0), // diyar
  s: z.number().int().min(0), // şehir yeri
});
export type Coordinates = z.infer<typeof coordinates>;

export const resources = z.object({
  gold: z.number().nonnegative(),
  food: z.number().nonnegative(),
});
export type Resources = z.infer<typeof resources>;

/** Sunucu saati her yanıtta döner; istemci LOKAL saate güvenmez (§7). */
export const serverTime = z.object({ serverNow: z.string().datetime() });

export const cursorPage = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorPage = z.infer<typeof cursorPage>;
