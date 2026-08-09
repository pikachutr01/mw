/**
 * ⭐⭐ CASUSLUK — TEK AŞAMALI MODEL (kullanıcı tasarımı, 2026-08-09).
 *
 * ⚠️ Bu dosya 2026-08-09'da **baştan yazıldı**. Öncesinde bir «kesişim» modeli vardı: rakip
 * kuşları `2^fark` ile çarpılıp ENGELLEME duvarı üretiyor, gönderilen kuş bunu doğrusal aşmak
 * zorunda kalıyordu. Duvar aşılmadan bilgi kademesi hiç kullanılmıyordu. Kullanıcı sistemi
 * *"çok karışık ve çok zor"* bulduğu için duvar tamamen kaldırıldı.
 *
 * Yeni model iki bağımsız parça:
 *   • `spyEffectiveDiff` + `spyLevelFor` → **kademe** (doküman-birebir; kuş bonusu artık tavanlı)
 *   • `spyLosses`                        → **kaç kuş öldü**; bilgiyi ENGELLEMEZ
 *
 * Buradaki testler kullanıcının cümlelerini birebir kilitliyor; her ⭐ bir şartın karşılığı.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG_CONFIG, mergeCatalogConfig, spyEffectiveDiff, spyLevelFor, spyLosses,
} from '../src/index.ts';

/** Kullanıcının örneğindeki ağır savunma: 100 okçu kulesi + 300 casus kuş. */
const AGIR = { towers: 100, elves: 0, defenderBirds: 300 };
/** Oyunu bırakmış oyuncu: savunma yapılarından dörder tane kalmış. */
const TERK = { towers: 4, elves: 0, defenderBirds: 0 };
/** Hiç anti-hava yok. */
const BOS = { towers: 0, elves: 0, defenderBirds: 0 };

const kayip = (birds: number, effectiveDiff: number, d: typeof AGIR) =>
  spyLosses({ birds, effectiveDiff, ...d });

/* ═══ KADEME — doküman tablosu, DEĞİŞMEDİ ═══════════════════════════════════ */

describe('bilgi kademesi (doküman-birebir, GÖNDERİLEN kuştan)', () => {
  it('8 kuş = +3 seviye · 16 kuş = +4 seviye', () => {
    expect(spyEffectiveDiff(0, 8, 0)).toBe(3);
    expect(spyEffectiveDiff(2, 16, 1)).toBe(5);
  });

  it('kademe tablosu', () => {
    expect(spyLevelFor(-1)).toBe('resources');
    expect(spyLevelFor(0)).toBe('economy');
    expect(spyLevelFor(1)).toBe('armyTotals');
    expect(spyLevelFor(2)).toBe('armyTypes');
    expect(spyLevelFor(3)).toBe('armyCounts');
    expect(spyLevelFor(4)).toBe('full');
    expect(spyLevelFor(9.2)).toBe('full');
  });

  /**
   * ⭐⭐ KUŞ BONUSU TAVANI (kullanıcı: *"on binlerce kuş göndermek zorunda olmasınlar"*).
   *
   * ⚠️ Tavanın asıl işlevi sınır koymak değil, **seviyeyi tek gerçek kaldıraç yapmak**:
   * 256'nın üstündeki kuş kademeye hiçbir şey katmaz, yalnız ölür.
   */
  it('⭐ 256 üstü kuş kademeye HİÇBİR ŞEY katmaz (tavan +8)', () => {
    const bes = spyEffectiveDiff(5, 256, 5);
    expect(bes).toBe(8);                                   // 5 + 8 − 5
    expect(spyEffectiveDiff(5, 512, 5)).toBe(bes);
    expect(spyEffectiveDiff(5, 100_000, 5)).toBe(bes);
  });

  it('tavan panelden gevşetilebilir (birdBonusCap)', () => {
    const cfg = mergeCatalogConfig({ spy: { birdBonusCap: 10 } });
    expect(spyEffectiveDiff(0, 1024, 0, cfg)).toBe(10);
    expect(spyEffectiveDiff(0, 1024, 0)).toBe(8);          // varsayılan tavan
  });

  /**
   * ⭐ TAM bilgi (fark ≥ 4) için gereken kuş — tavanın somut sonucu.
   * 5+ seviye geride olan biri kuşla ASLA `full` alamaz; tekniği yükseltmek zorunda.
   */
  it('⭐ TAM bilgi eşiği: eşitte 16 · 4 geride 256 · 5 geride ULAŞILAMAZ', () => {
    expect(spyLevelFor(spyEffectiveDiff(10, 16, 10))).toBe('full');
    expect(spyLevelFor(spyEffectiveDiff(10, 256, 14))).toBe('full');
    expect(spyLevelFor(spyEffectiveDiff(10, 100_000, 15))).not.toBe('full');
  });
});

/* ═══ KAYIP — yeni tek aşamalı model ════════════════════════════════════════ */

describe('kayıp modeli', () => {
  /** Doküman: kuşları yalnız anti-hava vurabilir. Hiç yoksa kayıp da yok. */
  it('⭐ anti-hava yoksa hiç kuş ölmez (fark ne olursa olsun)', () => {
    expect(kayip(500, -20, BOS).killed).toBe(0);
    expect(kayip(500, -20, BOS).survivors).toBe(500);
  });

  /**
   * ⭐⭐ KULLANICININ ÖRNEĞİ: *"32 kuş gönderseydik … 64'e oranla daha fazla kuşun vurulması
   * gerekirdi."* Az kuş → küçük etkin fark → **daha yüksek kayıp ORANI**.
   */
  it('⭐ az kuş gönderen ORANSAL olarak daha çok kaybeder', () => {
    const a = kayip(64, -2, AGIR);      // ben 5, rakip 13 → 5 + log2(64) − 13 = −2
    const b = kayip(32, -3, AGIR);      // aynı taraflar, yarı kuş → fark −3
    expect(b.lossRate).toBeGreaterThan(a.lossRate);
    expect(a.survivors).toBeGreaterThanOrEqual(1);
    expect(b.survivors).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⭐⭐ *"Casusluk seviyesi fazla ise 1 kuşla bile rakibin tüm her şeyini rahat görüp kuş
   * ölmeden geri gelebilir. Rakipte 100 tane casus kuş, 100 tane elf olsa bile."*
   */
  it('⭐ yüksek seviye farkında ağır savunma bile kuş öldüremez', () => {
    const dev = { towers: 100, elves: 200, defenderBirds: 500 };
    expect(kayip(1, 4, dev).killed).toBe(0);
    expect(kayip(1, 8, dev).killed).toBe(0);
  });

  /** ⭐ Oyunu bırakmış hedef: 4 kule kalmış, yüksek seviyeli casus 1 kuşla TAM bilgi alır. */
  it('⭐ terk edilmiş hedef (4 kule) — 1 kuş, kayıp yok, TAM bilgi', () => {
    const fark = spyEffectiveDiff(20, 1, 5);
    expect(spyLevelFor(fark)).toBe('full');
    expect(kayip(1, fark, TERK).killed).toBe(0);
  });

  /**
   * ⭐⭐ **GARANTİ: yeterince kuş gönderen DAİMA bir şey öğrenir.**
   *
   * Kullanıcı: *"Oyuna yeni başlamış birisi uzun süredir oynayan birisinin kaynak bilgisini
   * alabilsin ama rakibi güçlü olduğu için kuş da kaybetsin."*
   *
   * ⚠️ Bu ayrı bir kural DEĞİL, `lossMax < 1` olmasının sonucu — oran hiçbir zaman 1'e
   * ulaşamadığı için sağ kalan kalır. `lossMax` 1 yapılırsa bu garanti sessizce ölür;
   * `SpyConfig.lossMax` yorumu ve panel notu bu yüzden var.
   */
  it('⭐⭐ kayıp oranı hiçbir koşulda tavanı aşmaz → sağ kalan hep olur', () => {
    const canavar = { towers: 100_000, elves: 100_000, defenderBirds: 100_000 };
    const r = kayip(256, -30, canavar);
    expect(r.lossRate).toBeLessThan(DEFAULT_CATALOG_CONFIG.spy.lossMax);
    expect(r.survivors).toBeGreaterThanOrEqual(1);
  });

  /** ⭐ İki eksende de kesin monotonluk — modelin okunabilirliğinin şartı. */
  it('⭐ monotonluk: fark ↑ → kayıp ↓ · savunma ↑ → kayıp ↑', () => {
    let onceki = Infinity;
    for (const E of [-6, -4, -2, 0, 2, 4, 6]) {
      const r = kayip(128, E, AGIR).lossRate;
      expect(r).toBeLessThan(onceki);
      onceki = r;
    }
    let az = -1;
    for (const kule of [1, 10, 50, 200, 1000]) {
      const r = kayip(128, 0, { towers: kule, elves: 0, defenderBirds: 0 }).lossRate;
      expect(r).toBeGreaterThan(az);
      az = r;
    }
  });

  /**
   * ⚠️ Doygunluk: savunma 25 katına çıkınca kayıp oranı 25 katına ÇIKMAZ.
   * Kullanıcı: *"gönderdiğimiz kuşları pat diye vurmamalı."*
   */
  it('⭐ savunma doygun — 25 kat savunma kayıp oranını 2 kattan az artırır', () => {
    const az = kayip(128, 0, { towers: 40, elves: 0, defenderBirds: 0 }).lossRate;
    const cok = kayip(128, 0, { towers: 1000, elves: 0, defenderBirds: 0 }).lossRate;
    expect(cok / az).toBeLessThan(2);
  });

  /** Ağırlık sırası: kule > kuş > elf (maliyet ve adanmışlık temelli). */
  it('ağırlık sırası kule > savunan kuş > elf', () => {
    const { wTower, wBird, wElf } = DEFAULT_CATALOG_CONFIG.spy;
    expect(wTower).toBeGreaterThan(wBird);
    expect(wBird).toBeGreaterThan(wElf);
  });

  it('sertlik panelden yumuşatılabilir (defenseSaturation ↑ → kayıp ↓)', () => {
    const yumusak = mergeCatalogConfig({ spy: { defenseSaturation: 150 } });
    const sert = spyLosses({ birds: 64, effectiveDiff: -2, ...AGIR }).lossRate;
    const gevsek = spyLosses({ birds: 64, effectiveDiff: -2, ...AGIR }, yumusak).lossRate;
    expect(gevsek).toBeLessThan(sert);
  });
});
