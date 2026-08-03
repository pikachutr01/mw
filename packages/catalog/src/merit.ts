/**
 * ⭐ ASKERÎ ÜNVANLAR — Subay · Komutan · Başkomutan · Mareşal (kullanıcı, 2026-08-03)
 *
 * *"Bir savaşta öldürülen asker sayısına ve türüne göre özel bir hesaplama türetelim… 400 tane
 * cüce öldürmekle 400 tane ejderha öldürmek aynı başarı sayılmaz. Aynı şekilde 1000 tane elf
 * öldürmek belki de 15 kaos öldürmeye bedel değildir."*
 *
 * ── DEĞER ÖLÇÜSÜ: yeni bir stat ağırlığı UYDURULMADI ────────────────────────────────────────
 *
 * Öldürülen ordunun değeri **kaynak bedelidir** (altın + yemek), yani `score.service.ts`
 * içindeki `lossValue()`. 1000'e bölününce oyunun kendi puan birimi çıkıyor: *"düşmana
 * kaybettirdiğin puan"*. Savunan taraf zaten tam bu kadar puan kaybediyor (`debitLosses`),
 * yani ünvan sistemi oyunun mevcut ekonomisiyle **aynı parayı** kullanıyor.
 *
 * ⚠️ **Neden stat değil maliyet?** `formulas.ts`teki `unitTimeValue` yorumu bunu zaten
 * ölçmüş: katalogdaki `area` motorda birimin SAVAŞ GÜCÜdür ve savaşçılarda `maliyet/güç`
 * oranı 63 ile 100 arasında (ortalama 81). Yani orijinal tasarımcılar birimleri **zaten
 * güçleriyle orantılı fiyatlamış**. Maliyeti kullanmak gücü kullanmaktır; ayrıca bir "güç"
 * terimi eklemek aynı bilgiyi iki kez saymak olurdu. Elle ağırlık tablosu yazmanın tek
 * sonucu, denge değişince sessizce bayatlayan ikinci bir doğruluk kaynağı olurdu.
 *
 * Birim başına kıyım puanı (varsayılan çarpanlarla, `gold + food` / 1000):
 *
 *   Casus Kuş 0,3 · Tuzak 0,4 · Cüce 0,65 · Okçu Kulesi 0,75 · Elf 1,1 · Yük Arabası 2
 *   Gnom 3,2 · Süvari 3,6 · Şaman 4 · Muhafız 4,4 · Kazancı 5,6 · Pegasus 7,2
 *   Mangonel 9 · Mancınık 18 · Balista 36 · Ogre 42 · Ejderha 65 · **Kaos 4.000**
 *
 * Kullanıcının iki ölçütü de sağlanıyor:
 *   • 400 Cüce = 260 puan  ↔  400 Ejderha = 26.000 puan   → **100 kat**
 *   • 1000 Elf = 1.100     ↔  15 Kaos     = 60.000        → **Kaos 54 kat ağır**
 *
 * ⚠️ Sur · Büyü Kalkanı · Tapınak **sıfır** eder: `LEVEL_BASED`, savaşta adet kaybetmezler
 * (seviyeleri düşmez), dolayısıyla "öldürülmüş asker" değiller.
 *
 * ── EŞİKLER: nereden geldiği ────────────────────────────────────────────────────────────────
 *
 * Çıpa uydurulmadı; şehir savunma kapasitesinden türetildi. `defenseCapacity(sur) =
 * 25.000 × 1,3^(sur−1)` **alan** verir ve savunma birimlerinde kaynak/alan oranı ≈ 35.
 * Yani her basamak "tıka basa dolu şu seviyedeki bir şehrin savunmasını süpürmek"e denk:
 *
 *   Subay        5.000 →  Sur  8 şehri (~77 Ejderha · ~1.390 Süvari · ~7.700 Cüce)
 *   Komutan     25.000 →  Sur 13 şehri
 *   Başkomutan 100.000 →  Sur 18 şehri
 *   Mareşal    500.000 →  Sur 24 şehri (~7.700 Ejderha ya da ~125 Kaos)
 *
 * Kullanıcının şartı *"Mareşal gerçekten zor edinilmeli, oyunun çok ilerleyen aşamalarında
 * ancak kazanılabilmeli"* → Sur 24 karşılığı tam olarak bu.
 *
 * ⚠️ Bu sayılar **dünya başına ayarlanabilir** (`packages/settings` · `merit` grubu).
 * Buradakiler varsayılan; canlı dengede oynanacaksa panelden değiştirilir, kod değişmez.
 */

/** Ünvan basamağı. Sayısal ve SIRALI: karşılaştırma `>` ile yapılıyor, isim eşleştirmesiyle değil. */
export type MeritTier = 1 | 2 | 3 | 4;

export interface MeritTierDef {
  tier: MeritTier;
  /** Görsel dosyası ve çeviri anahtarı: `/assets/ranks/<id>.png`. */
  id: 'subay' | 'komutan' | 'baskomutan' | 'maresal';
  name: string;
  /** Tek savaşta bu puanı geçen taraf bu ünvanı alır (kaynak/1000). */
  threshold: number;
  /** Ünvanın taşınacağı gün sayısı — OYUN saatiyle. */
  days: number;
}

export const MERIT_TIERS: readonly MeritTierDef[] = [
  { tier: 1, id: 'subay',      name: 'Subay',      threshold: 5_000,   days: 7 },
  { tier: 2, id: 'komutan',    name: 'Komutan',    threshold: 25_000,  days: 14 },
  { tier: 3, id: 'baskomutan', name: 'Başkomutan', threshold: 100_000, days: 21 },
  { tier: 4, id: 'maresal',    name: 'Mareşal',    threshold: 500_000, days: 30 },
] as const;

export const MERIT_BY_TIER: Readonly<Record<number, MeritTierDef>> = Object.fromEntries(
  MERIT_TIERS.map((t) => [t.tier, t]),
);

/** Dünya bazlı override — `packages/settings` `merit.*` anahtarlarından doluyor. */
export interface MeritConfig {
  /** `tier → eşik`. Eksik bırakılan basamak varsayılanı kullanır. */
  thresholds: Partial<Record<MeritTier, number>>;
  /** `tier → gün`. Eksik bırakılan basamak varsayılanı kullanır. */
  days: Partial<Record<MeritTier, number>>;
}

export const DEFAULT_MERIT_CONFIG: MeritConfig = { thresholds: {}, days: {} };

export function meritThreshold(tier: MeritTier, cfg: MeritConfig = DEFAULT_MERIT_CONFIG): number {
  return cfg.thresholds[tier] ?? MERIT_BY_TIER[tier]!.threshold;
}

export function meritDays(tier: MeritTier, cfg: MeritConfig = DEFAULT_MERIT_CONFIG): number {
  return cfg.days[tier] ?? MERIT_BY_TIER[tier]!.days;
}

/**
 * Kıyım puanına karşılık gelen EN YÜKSEK ünvan; eşiğin altındaysa `null`.
 *
 * ⚠️ Yüksekten alçağa taranıyor: eşikler panelden düzenlenebildiği için yönetici sıralamayı
 * bozacak bir kombinasyon girebilir (Komutan < Subay). Yüksekten tarayınca en kötü ihtimalde
 * "hak edilenden yüksek ünvan verilmez" garantisi kalır; alçaktan tarasaydık ilk eşleşen
 * kazanır ve bozuk ayarda oyuncu Subay'da takılırdı.
 */
export function meritTierFor(
  killScore: number, cfg: MeritConfig = DEFAULT_MERIT_CONFIG,
): MeritTier | null {
  for (let i = MERIT_TIERS.length - 1; i >= 0; i--) {
    const def = MERIT_TIERS[i]!;
    if (killScore >= meritThreshold(def.tier, cfg)) return def.tier;
  }
  return null;
}
