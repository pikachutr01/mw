/**
 * ⭐⭐ GNOM → SAVUNMA YAPISI (ve ters yönü) — `docs/SAVUNMA_BINARY_KONTROL.md` L/K blokları.
 *
 * Bu mekanizma 2026-08-13'e kadar motorda **hiç yoktu**: gnom `OUT_OF_BATTLE` olduğu için
 * savunma yapılarına dokunmuyordu. Binary ölçümü tersini gösterdi — 1000 gnom, 500 okçu
 * kulesinin hepsini yıkıyor (onarım 380-401 geri getiriyor), yani **yalnız gnomla** yapılan
 * bir akın, 3000 cüceyle yapılanla aynı yıkımı veriyor.
 *
 * Kural, `gnomeStrike`in alan-paylı kardeşi ve `dealType`teki standart formülün aynısı:
 * ```
 *   havuz = gnom.poolHp (200) × gnomAdedi
 *   pay_i = (alan_i × adet_i / Σ alan×adet) × havuz
 *   yıkılan_i = ⌊(pay_i − pDef_i × adet_i) / mDef_i⌋
 * ```
 *
 * ⚠️ Testler ARALIĞA bakıyor: yıkım deterministik ama onarım rulosu (%76-81) rastgele.
 * Tuzak `PASSIVE_STRUCTS` olduğu için onarılmaz → tek sayı.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

const vs = (
  attacker: Record<string, number>, defender: Record<string, number>, seed = 'gnom',
): SimulateInput => ({ seed, attacker: { counts: attacker }, defender: { counts: defender } });

/** Aynı senaryoyu 20 tohumla koşturup bir birimin kalan aralığını verir. */
function aralik(
  attacker: Record<string, number>, defender: Record<string, number>,
  taraf: 'attacker' | 'defender', id: string,
): { min: number; max: number } {
  const v: number[] = [];
  for (let i = 0; i < 20; i++) {
    const r = simulate(vs(attacker, defender, `gs-${i}`));
    v.push(r[taraf].counts[id] ?? 0);
  }
  return { min: Math.min(...v), max: Math.max(...v) };
}

describe('gnom → savunma yapısı', () => {
  it('⭐ L1: 1000 gnom 500 okçu kulesinin HEPSİNİ yıkar (binary 380-401 kalır)', () => {
    // ⌊(200×1000 − 6×500)/325⌋ = 606 → 500 tavanı → onarım %76-81 geri getirir.
    const { min, max } = aralik({ gnome: 1000 }, { archer_tower: 500 }, 'defender', 'archer_tower');
    expect(min).toBeGreaterThanOrEqual(375);
    expect(max).toBeLessThanOrEqual(410);
  });

  it('⭐ L3: 500 gnom kulelerin bir kısmını yıkar — ölçek DOĞRUSAL değil', () => {
    // ⌊(200×500 − 3.000)/325⌋ = 298 yıkık → 202 sağlam + onarım. Binary: 429-441.
    const { min, max } = aralik({ gnome: 500 }, { archer_tower: 500 }, 'defender', 'archer_tower');
    expect(min).toBeGreaterThanOrEqual(424);
    expect(max).toBeLessThanOrEqual(447);
  });

  it('⭐ L2: iki hedef varsa havuz ALAN oranıyla paylaşılır', () => {
    /* K5/L2 "çelişkisini" çözen kural: 1000 gnom TEK BAŞINA 1000 tuzağın hepsini siler, ama
     * yanında 500 kule varsa alan oranı `kule 12.000 / tuzak 3.000` olur ve tuzağa havuzun
     * yalnız %20'si düşer → 523 tuzak gider. Binary: kule 384-404 · tuzak 475-477. */
    const kule = aralik({ gnome: 1000 }, { archer_tower: 500, trap: 1000 }, 'defender', 'archer_tower');
    const tuzak = aralik({ gnome: 1000 }, { archer_tower: 500, trap: 1000 }, 'defender', 'trap');
    expect(kule.min).toBeGreaterThanOrEqual(379);
    expect(kule.max).toBeLessThanOrEqual(410);
    expect(tuzak.min).toBe(477);
    expect(tuzak.max).toBe(477);
  });

  it('⭐ L5/L6: hedefin STATLARI belirleyici — balista neredeyse dayanır, muhafız kırılır', () => {
    // Balista mDef 16.640 → ⌊176.000/16.640⌋ = 10 yıkık · Muhafız mDef 3.172 → 53 yıkık.
    const balista = aralik({ gnome: 1000 }, { ballista: 100 }, 'defender', 'ballista');
    const muhafiz = aralik({ gnome: 1000 }, { guard: 200 }, 'defender', 'guard');
    expect(balista.min).toBeGreaterThanOrEqual(96);   // binary: 98
    expect(balista.max).toBeLessThanOrEqual(99);
    expect(muhafiz.min).toBeGreaterThanOrEqual(185);  // binary: 188-190
    expect(muhafiz.max).toBeLessThanOrEqual(192);
  });

  it('⚠️ `LEVEL_BASED` yapılar hedef DEĞİL — Sur ve Tapınak adet değil SEVİYE taşır', () => {
    expect(simulate(vs({ gnome: 1000 }, { wall: 3 })).defender.counts['wall']).toBe(3);
    expect(simulate(vs({ gnome: 1000 }, { temple: 3 })).defender.counts['temple']).toBe(3);
  });
});

describe('savunma yapısı → gnom (ters yön)', () => {
  it('⭐ L6: SAĞ KALAN muhafızlar gnomu vurur — sıra gözlemlenebilir', () => {
    /* Havuz vuruştan SONRAKİ adetten: 200 muhafızın 53'ü yıkılıyor, kalan **147** muhafız
     * ⌊(200×147 − 12×1000)/260⌋ = 66 gnom öldürüyor → 934. 200 ile hesaplasaydık 107 çıkardı,
     * yani bu sayı sıranın kendisini sabitliyor. Binary: 934. */
    const { min, max } = aralik({ gnome: 1000 }, { guard: 200 }, 'attacker', 'gnome');
    expect(min).toBe(934);
    expect(max).toBe(934);
  });

  it('⚠️ tip 1 yapılar gnomu VURMAZ (okçu kulesi · balista)', () => {
    // L1/L5 ölçümü: iki savaşta da gnom 1000/1000 kalıyor.
    expect(aralik({ gnome: 1000 }, { archer_tower: 500 }, 'attacker', 'gnome').min).toBe(1000);
    expect(aralik({ gnome: 1000 }, { ballista: 100 }, 'attacker', 'gnome').min).toBe(1000);
  });

  it('⚠️ `PASSIVE_STRUCTS` gnomu VURMAZ — tuzak tip 2 ama pasif', () => {
    /* K3: 250 gnom 761 tuzağı yıkıyor, geriye 239 tuzak kalıyor ve tip 2 olmalarına rağmen
     * tek bir gnom bile ölmüyor. Tuzak vurulur, vurmaz. */
    const r = simulate(vs({ gnome: 250 }, { trap: 1000 }));
    expect(r.defender.counts['trap']).toBe(239);
    expect(r.attacker.counts['gnome']).toBe(250);
  });

  it('⚠️ SAVAŞÇILAR gnomu vurmaz — yön yalnız yapılara özgü (D4)', () => {
    // 500 gnomla saldırıya 120 cüce karşılık veremiyor; eski D4 ölçümü korunuyor.
    const r = simulate(vs({ gnome: 1000 }, { dwarf: 120 }));
    expect(r.attacker.counts['gnome']).toBe(1000);
  });
});

/**
 * ⭐⭐⭐ TUR 1 GNOM FAZI SUR'U YIKAR — `docs/SUR_TESTLERI.md` §21.
 *
 * Bu, altı ölçüm seti (50+ hücre) boyunca bulunamayan sapmanın kökeniydi ve sonunda
 * **x32dbg ile canlı okunarak** çözüldü: binary bu fazı standart hasar çekirdeğinden geçiriyor
 * ve `[EBP+0x2c]` bayrağını 1 veriyor, yani Sur hem `P`'ye giriyor hem hasar alıyor.
 *
 * Yıkımın devasa olmasının sebebi `P`'nin minicik olması — normal turlarda savunanın bütün
 * ordusu (~4.000.000), burada yalnız **gnomlar + Sur**:
 * ```
 *   P = 624.689 (Sur sv13) + 6.661×25 (gnom) = 791.213    ← x32dbg'den birebir okundu
 *   R = 15.434.621 / 791.213 = 19,5                        ← normal turlarda ~4
 *   düşüş = %60,86  →  Sur tek vuruşta 100 → 39,14
 * ```
 *
 * ⚠️ Sondaların hepsi bunu kaçırdı çünkü A·B·C·D·E·F setlerinde **iki tarafta da gnom yoktu**;
 * G grubunda vardı ama saldıranda. Bu faz **savunanın** gnomlarını hedefler.
 */
describe('⭐ Tur 1 gnom fazı — Sur o çağrıda da vurulur', () => {
  const ATK = {
    counts: {
      dwarf: 7542, elf: 6211, cavalry: 4128, pegasus: 2654, dragon: 647, mangonel: 450,
      ogre: 2544, shaman: 5000, cargo_wagon: 5478, gnome: 6841, chaos: 3,
    },
    tech: { archery: 16, blacksmithing: 17, sorcery: 20, armor: 14, chemistry: 16, instinct: 15, talisman: 18 },
    heroes: [], temple: 0, heroCount: 0,
  };
  const def = (wall: number, gnome = 6661) => ({
    counts: {
      dwarf: 6541, elf: 5127, cavalry: 4125, pegasus: 3249, dragon: 419, mangonel: 674,
      ogre: 3697, shaman: 6000, spy_bird: 4125, cargo_wagon: 6543, gnome, chaos: 2, wall,
    },
    wallIntegrity: 1,
    tech: { archery: 16, blacksmithing: 17, sorcery: 20, armor: 19, chemistry: 14, masonry: 14, instinct: 16, talisman: 15 },
    heroes: [], temple: 0, heroCount: 0,
  });
  const surPct = (wall: number, gnome = 6661): number => {
    let s = 0;
    for (let i = 0; i < 8; i++) {
      const r = simulate({ attacker: ATK, defender: def(wall, gnome), night: false, seed: `b${i}` });
      s += ((r.defender.wallIntegrity ?? 0) * 100) / 8;
    }
    return s;
  };

  /** Binary ölçümü (v0.5.5, kullanıcı — `sim-sur-buyuk.mjs` savaşı). */
  it('⭐ seviye eğrisi binary ile örtüşüyor (10 seviye)', () => {
    for (const sv of [7, 8, 9, 10, 11, 12]) {
      expect(surPct(sv), `sv${sv} tamamen yıkılmalı`).toBeLessThan(0.5);
    }
    expect(surPct(13)).toBeGreaterThan(36);   // binary 38,5
    expect(surPct(13)).toBeLessThan(41);
    expect(surPct(14)).toBeGreaterThan(69);   // binary 71,5
    expect(surPct(14)).toBeLessThan(74);
    expect(surPct(15)).toBeGreaterThan(88);   // binary 90,6
    expect(surPct(15)).toBeLessThan(93);
    expect(surPct(16), 'sv16: net negatife döner, Sur hiç hasar almaz').toBe(100);
  });

  it('⭐⭐ SEBEP GNOM: savunanın gnomu yoksa aynı savaşta Sur sağlam kalır', () => {
    /* Aynı ordu, tek fark savunanda gnom yok → Tur 1 gnom fazı hiç çalışmaz → Sur o dev
     * vuruşu yemez. Sondaların (A-F) neden hep tuttuğunun testi bu. */
    expect(surPct(13, 0), 'gnomsuz: Sur neredeyse hiç yıpranmamalı').toBeGreaterThan(95);
    expect(surPct(13), 'gnomlu: aynı savaşta yıkılmalı').toBeLessThan(45);
  });

  it('⚠️ havuzdan ŞAMAN EMMESİ düşülür (çekirdekle aynı satır)', () => {
    /* Emme düşülmezse Tur 1 havuzu %14 şişiyor ve Sur sv13'te %38 yerine %27'ye iniyordu.
     * Savunanın şamanını kaldırınca Sur DAHA ÇOK yıpranmalı — emmenin gerçekten işlediğinin ölçüsü. */
    const sasiz = { ...def(13), counts: { ...def(13).counts, shaman: 0 } };
    let s = 0;
    for (let i = 0; i < 8; i++) {
      s += ((simulate({ attacker: ATK, defender: sasiz, night: false, seed: `b${i}` })
        .defender.wallIntegrity ?? 0) * 100) / 8;
    }
    expect(s, 'şaman yokken Sur daha çok yıpranır').toBeLessThan(surPct(13));
  });
});
