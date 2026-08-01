import { z } from 'zod';
import { unitCounts } from './mission.ts';

/**
 * Menüdeki DAHİLİ SAVAŞ SİMÜLATÖRÜ — gerçek savaşlarla AYNI motoru çağırır (§0.0).
 * Savaş animasyonu yok; çıktı metin raporudur.
 */
export const techLevels = z.record(z.string(), z.number().int().min(0));

/** Seviye başına verilen geliştirme puanı (kullanıcı doğrulaması, §13.11.4c). */
export const HERO_POINTS_PER_LEVEL = 3;

/**
 * Kahraman girdisi — **yalnız hesap makinesi uçları için** (`/simulate` ve admin denge
 * önizlemesi). Gerçek savaş bu şemadan geçmiyor: `battle.handlers.ts` `SimulateInput`ı
 * DB satırlarından elle kuruyor.
 *
 * ⚠️ **Yetenek toplamı burada SINIRLANMAZ** (kullanıcı, 2026-08-02). Eskiden `3 × seviye`
 * kuralını uygulayan bir `.refine()` vardı ve simülatörde "ya seviye 10 kahramana 40 puan
 * verseydim" sorusunu sormayı imkânsız kılıyordu — oysa bu uç tam olarak böyle *ne olurdu*
 * sorularını cevaplamak için var; kaynak harcamıyor, durumu değiştirmiyor.
 *
 * ⚠️ **Gerçek kuralın yeri burası DEĞİL, orası duruyor:** `hero.controller.ts:161-163`
 * yetenek dağıtımını `hero.level × pointsPerLevel` ile sınırlıyor ve dağıtılmış puanın geri
 * alınmasını engelliyor. Oyuncu var olamayacak bir kahramanı simülatörde deneyebilir ama
 * oyunda kuramaz. Arayüz yine de aşımı kırmızı gösteriyor (`Simulate.tsx`).
 */
export const heroInput = z.object({
  level: z.number().int().min(0).max(100),
  /** fizSald → kahramanın fiziksel vuruş gücü (ofans) */
  fAtk: z.number().int().min(0).default(0),
  /** fizSav → fiziksel mitigasyon (savunma) */
  fDef: z.number().int().min(0).default(0),
  /** büyüSald → fiziksel savaşta etkisiz (kahramanın büyü tabanı 0) */
  mAtk: z.number().int().min(0).default(0),
  /** büyüSav → fiziksel savaşta etkisiz */
  mDef: z.number().int().min(0).default(0),
});
export type HeroInput = z.infer<typeof heroInput>;

export const simulateSide = z.object({
  counts: unitCounts,
  tech: techLevels.optional(),
  heroes: z.array(heroInput).max(5).optional(),
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
