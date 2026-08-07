/**
 * ⭐ SEFER KARGOSU — girdi normalleştirme + JSONB okuma, TEK yerde.
 *
 * İki yarım kopya vardı: `normalizeCargo` (`mission.service.ts`, oyuncudan geleni kırpar) ve
 * `readResources` (`mission.handlers.ts`, `payload`tan okur). İptalde kargo iadesi
 * (`cancelMission`) ikincisini **servis tarafında** da gerektirdi; iki dosyaya üçüncü bir
 * kopya çıkarmak yerine ikisi buraya toplandı.
 *
 * ⚠️ Bu modülün hiçbir bağımlılığı yok (döngü riski sıfır) ve bilerek öyle kalmalı.
 */

export interface Cargo {
  gold: number;
  food: number;
}

export const NO_CARGO: Cargo = { gold: 0, food: 0 };

/**
 * Oyuncudan gelen kargo: negatif ve ondalık kırpılır.
 *
 * ⚠️ Sözleşmedeki `resources` şemasına `.int()` **eklenmedi** ve eklenmemeli: aynı şema savaş
 * ganimeti dökümünde de kullanılıyor ve orada ondalık değerler meşru. Tam sayıya indirgeme
 * bu yüzden şemada değil, kargonun girdiği tek kapıda.
 */
export function normalizeCargo(cargo: Cargo): Cargo {
  const n = (v: number): number => Math.max(0, Math.trunc(Number(v) || 0));
  return { gold: n(cargo.gold), food: n(cargo.food) };
}

/**
 * `payload.cargo` / `payload.loot` gibi JSONB alanını güvenle okur.
 *
 * ⚠️ Alan yoksa `{0,0}` döner — bu, iptal yolunda saldırı/casusluk görevlerinin davranışının
 * değişmemesini sağlayan şey: onların payload'ında `cargo` hiç yok.
 */
export function readResources(v: unknown): Cargo {
  if (!v || typeof v !== 'object') return { gold: 0, food: 0 };
  const r = v as Record<string, unknown>;
  return { gold: Math.max(0, Number(r['gold'] ?? 0)), food: Math.max(0, Number(r['food'] ?? 0)) };
}

/** Kargoda gerçekten bir şey var mı? */
export const hasCargo = (c: Cargo): boolean => c.gold > 0 || c.food > 0;
