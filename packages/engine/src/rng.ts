/**
 * Seed'li PRNG — `Math.random()` motordan TAMAMEN çıkarıldı (SİSTEM PLANI §5).
 *
 * Her savaş `rng_seed` ile kaydedilir → aynı savaş her yeniden oynatmada aynı sonucu verir.
 * Bu, v0.6'da eklenen tüm rastgeleliği (tuzak tetiklenmesi, onarım oranı, jitter) denetlenebilir
 * kılar: "o savaş neden böyle bitti" sorusuna kanıtla cevap verilebilir.
 */
export interface Rng {
  /** [0, 1) aralığında sonraki değer. */
  next(): number;
  /** [min, max) aralığında değer. */
  range(min: number, max: number): number;
  /** Kullanılan seed (savaş kaydına yazılır). */
  readonly seed: number;
}

/** Dizeyi 32-bit seed'e çevirir (mission id gibi metin anahtarlar için). */
export function hashSeed(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — küçük, hızlı, iyi dağılımlı; tek 32-bit durum. */
export function createRng(seedInput: string | number): Rng {
  const seed = hashSeed(seedInput);
  let a = seed;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    range: (min: number, max: number) => min + next() * (max - min),
  };
}
