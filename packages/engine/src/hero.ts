/**
 * ⭐ KAHRAMAN YETENEK PUANLARI (kullanıcı doğrulaması, 2026-07-26)
 *
 * Her seviye atlayışında **3 geliştirme puanı** verilir; oyuncu bunları dört yeteneğe dağıtır.
 * Seviye 8 bir kahramanın dört yeteneğinin TOPLAMI en fazla 24 olabilir.
 *
 * ── Yeteneklerin savaştaki gerçek karşılığı (binary FUN_0040d884 + simülatör kolon eşlemesi
 *    FUN_00402800'den doğrulandı) ────────────────────────────────────────────────────────────
 *   fizSald  → hp      (fiziksel vuruş gücü)          → saldırı havuzuna girer   [OFANS]
 *   fizSav   → pAtk ve pDef (iki fiziksel mitigasyon)  → P'ye girer               [SAVUNMA]
 *   büyüSald → magicHp (büyü vuruş gücü)
 *   büyüSav  → mAtk    (büyü savunması)
 *
 * Binary formülü: `stat = (seviye+1) × taban × 1,07^seviye + taban × 1,06^yetenek`
 * ⚠️ ÇARPIMSAL: kahramanın büyü TABAN statları 0 olduğu için büyü yetenekleri fiziksel savaşta
 * hiçbir şey yapmaz (0 × 1,06^n = 0). D3/D4 testlerinin H2 ile birebir aynı çıkmasının sebebi budur —
 * "büyü çalışmıyor" değil, "kahramanın büyü tabanı yok".
 */
import { DEFAULT_COMBAT_CONFIG, type CombatConfig } from './config.ts';
import type { HeroInput } from './types.ts';

export interface HeroSkillBudget {
  /** Seviyenin verdiği toplam puan (3 × seviye). */
  total: number;
  /** Dağıtılmış puan. */
  spent: number;
  /** Kalan (dağıtılmamış) puan. */
  remaining: number;
  valid: boolean;
}

export function heroSkillTotal(hero: HeroInput): number {
  return Math.max(0, hero.fAtk ?? 0)
    + Math.max(0, hero.fDef ?? 0)
    + Math.max(0, hero.mAtk ?? 0)
    + Math.max(0, hero.mDef ?? 0);
}

/**
 * Bütçe kontrolü. Sunucu her yetenek dağıtımı isteğinde ve her savaş girdisinde bunu çağırır;
 * simülatörde de aynı kural işler (oyuncu var olmayan bir kahramanı denemesin).
 */
export function heroSkillBudget(
  hero: HeroInput,
  cfg: CombatConfig = DEFAULT_COMBAT_CONFIG,
): HeroSkillBudget {
  const total = Math.max(0, hero.level | 0) * cfg.hero.pointsPerLevel;
  const spent = heroSkillTotal(hero);
  return { total, spent, remaining: total - spent, valid: spent <= total };
}

/** Geçersiz dağıtımda hata fırlatır (sunucu tarafı guard). */
export function assertHeroSkills(hero: HeroInput, cfg: CombatConfig = DEFAULT_COMBAT_CONFIG): void {
  const b = heroSkillBudget(hero, cfg);
  if (!b.valid) {
    throw new Error(
      `Kahraman yetenek bütçesi aşıldı: seviye ${hero.level} için en fazla ${b.total} puan `
      + `dağıtılabilir, ${b.spent} puan verilmiş.`,
    );
  }
}
