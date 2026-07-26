/**
 * ⭐ MESAFE ve SEFER SÜRESİ (SİSTEM PLANI §13.5)
 *
 * Referans uygulama `harita.html`; buradaki formüller onunla BİREBİR aynıdır (§13.5.5 cetveli
 * bu koddan da çıkar). Motor gibi bu modül de SAF: DB, zaman, IO bilmez.
 *
 *   D = Δşehir + U·Δdiyar + W·Δkıta                 U = 20, W = 4000  (Manhattan/toplamalı)
 *   T = TABAN + K · D^p · (100/v) / (1 + 0,05·Haritacılık)          tavan 18 saat
 *
 * ⚠️ **TABAN mesafeden ve Haritacılık'tan ETKİLENMEZ** (§13.5.3). Baskın–savunma dengesinin
 * ayar vidası budur: taban olmasaydı yüksek haritacılıklı oyuncunun komşuya saldırısı 5 dakikaya
 * inerdi ve savunma diye bir şey kalmazdı.
 *
 * İstemci aynı fonksiyonu YALNIZ önizleme için kullanır; otorite `execute_at` yazan sunucudur.
 */
import { UNITS_BY_ID } from '@mobiwar/catalog';

export interface Coordinates {
  /** kıta */
  k: number;
  /** diyar */
  d: number;
  /** şehir yuvası */
  s: number;
}

export interface MapConfig {
  /** Bir diyar farkının kaç "şehir" ettiği. */
  districtWeight: number;
  /** Bir kıta farkının kaç "şehir" ettiği (1 kıta = 200 diyar). */
  continentWeight: number;
  /** Yol terimi katsayısı. */
  k: number;
  /** Mesafe sıkıştırma üssü: mesafe 100× artınca süre ~8× artar. */
  p: number;
  /** Ordu taban süresi (sn) — "orduyu toplayıp yola çıkarmak". */
  baseArmySeconds: number;
  /** Casus kuş taban süresi (sn). */
  baseSpySeconds: number;
  /** Süre tavanı (sa) — zıt köşe bile bunu aşmaz. */
  capHours: number;
  /** Haritacılık seviye başına hız kazancı. */
  cartographyStep: number;
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  districtWeight: 20,
  continentWeight: 4000,
  k: 600,
  p: 0.46,
  baseArmySeconds: 600,
  baseSpySeconds: 120,
  capHours: 18,
  cartographyStep: 0.05,
};

/**
 * Kademeli/toplamalı mesafe. **Öklid DEĞİL**: her koordinat basamağındaki fark süreye mutlaka
 * yansır, yoksa "1 kıta + 200 diyar" ile "1 kıta" aynı süreye inerdi (§13.5.1).
 */
export function distance(a: Coordinates, b: Coordinates, cfg: MapConfig = DEFAULT_MAP_CONFIG): number {
  return Math.abs(a.s - b.s)
    + cfg.districtWeight * Math.abs(a.d - b.d)
    + cfg.continentWeight * Math.abs(a.k - b.k);
}

/**
 * Ordunun hızı = **en yavaş birimin** hızı. Kahraman orduyu hızlandırmaz (§13.5.5), bu yüzden
 * kahramanlar bu hesaba hiç girmez.
 *
 * Bilinmeyen birim id'si veya yürüyemeyen (hız 0) birim varsa `null` döner — çağıran bunu
 * doğrulama hatası olarak işler.
 */
export function armySpeed(counts: Record<string, number>): number | null {
  let slowest = Infinity;
  for (const [id, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const speed = UNITS_BY_ID[id]?.speed ?? 0;
    if (speed <= 0) return null;
    if (speed < slowest) slowest = speed;
  }
  return Number.isFinite(slowest) ? slowest : null;
}

export interface TravelInput {
  /** `distance()` çıktısı. */
  distance: number;
  /** Ordunun hızı (`armySpeed()`); casus seferinde casus kuşun hızı. */
  speed: number;
  /** Saldıranın Haritacılık seviyesi. */
  cartography?: number;
  /** Casus seferi mi (tabanı `baseSpySeconds` yapar)? */
  spy?: boolean;
  /** Dünya hız çarpanı — YOL terimini de tabanı da böler (`worlds.speed_multiplier`). */
  speedMultiplier?: number;
}

/**
 * Sefer süresi (saniye, yukarı yuvarlanmış tam sayı).
 *
 * Dönüş bacağı da AYNI süredir; görev tipi süreyi değiştirmez (saldırı = destek = nakliye).
 */
export function travelSeconds(input: TravelInput, cfg: MapConfig = DEFAULT_MAP_CONFIG): number {
  const base = input.spy ? cfg.baseSpySeconds : cfg.baseArmySeconds;
  const speed = Math.max(1, input.speed);
  const cartographyFactor = 1 + cfg.cartographyStep * Math.max(0, input.cartography ?? 0);
  const road = cfg.k * Math.max(0, input.distance) ** cfg.p * (100 / speed) / cartographyFactor;
  const capped = Math.min(base + road, cfg.capHours * 3600);
  // Hızlı dünya seçeneği süreyi böler; tavan da aynı oranda iner (§13.5.6).
  return Math.max(1, Math.ceil(capped / Math.max(0.01, input.speedMultiplier ?? 1)));
}
