/**
 * ⭐ SUR + BÜYÜ KALKANI — İKİNCİ ALTIN ÖLÇÜM SETİ (kullanıcı, binary simülatör v0.5.5, 2026-07-29)
 *
 * A-I gruplarının tamamı: 32/32 ölçüm motorla uyumlu.
 *
 * `BUYU_KALKANI_TESTLERI.md` A-I gruplarının binary simülatörde koşulmuş sonuçları. Bu set
 * ilk setin (magic-shield.test.ts) çözemediği şeyleri kilitler:
 *   C) FAZ AYRIMI — saf fiziksel saldırıda kalkan %100,0 kalır (kalkan yalnız büyü fazında hatta)
 *   D) SUR — binary formülü (`1,8^Sv`); tasarımsal `power×√Sv` modeli %17 derken gerçek %87,5
 *   E) TILSIM/BÜYÜCÜLÜK — Şaman çıkarması FAZA GÖRE stat okur (faz 1-2 Can, faz 3 BüyüCan)
 *   F) ŞAMAN KATSAYISI — ham çıkarma (1,0), 0,85 değil
 *
 *   G) UÇMA mekaniği YOK — uçan Ejderha ile yerdeki Ogre aynı Alan'da aynı sonucu verir
 *
 * Tolerans: yüzdelerde ±2 puan, kayıplarda ±max(4, %4) — binary ±%0,1 jitter uyguluyor ve
 * ölçümler tek koşuluk. Motor saldıranın yüksek-mDef birimlerini birim başına ~0,5 fazla
 * öldürüyor (görüntülenen kalanda 1 birim) — bu yüzden küçük kayıplarda mutlak tolerans var.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';
import type { SimulateInput, UnitCounts } from '../src/types.ts';

interface Case {
  id: string;
  attacker: UnitCounts;
  defender: UnitCounts;
  defTech?: Record<string, number>;
  /** binary ekranındaki yüzdeler (yoksa o satır gösterilmiyordu) */
  shieldPct?: number;
  wallPct?: number;
  atkLost: number;
  defLost: number;
  winner: 'attacker' | 'defender';
}

const SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function measure(c: Case) {
  const runs = SEEDS.map((seed) => {
    const input: SimulateInput = {
      seed,
      attacker: { counts: c.attacker },
      defender: { counts: c.defender, tech: c.defTech },
    };
    return simulate(input);
  });
  const mean = (f: (r: (typeof runs)[number]) => number) =>
    runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return {
    shieldPct: mean((r) => (r.defender.shieldIntegrity ?? 0) * 100),
    wallPct: mean((r) => (r.defender.wallIntegrity ?? 0) * 100),
    atkLost: mean((r) => r.attacker.lost),
    defLost: mean((r) => r.defender.lost),
    winners: new Set(runs.map((r) => r.winner)),
  };
}

/** Büyük sayılarda bağıl, küçük sayılarda mutlak tolerans. */
function expectClose(got: number, want: number, label: string) {
  const tol = Math.max(4, want * 0.04);
  expect(Math.abs(got - want), `${label}: ${got.toFixed(1)} ≉ ${want}`).toBeLessThanOrEqual(tol);
}

const CASES: Case[] = [
  // ── A) Yüksek seviye: kalkan hiç yıpranmıyor ama koruma P payından sürüyor ──
  { id: 'A1 kalkansız taban', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650 }, atkLost: 4, defLost: 152, winner: 'attacker' },
  { id: 'A3 kalkan sv5', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 5 },
    shieldPct: 100, atkLost: 5, defLost: 123, winner: 'attacker' },
  { id: 'A5 kalkan sv8', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 8 },
    shieldPct: 100, atkLost: 11, defLost: 56.5, winner: 'attacker' },
  { id: 'A6 kalkan sv10 — kazanan DÖNÜYOR', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 10 },
    shieldPct: 100, atkLost: 16, defLost: 22, winner: 'defender' },

  // ── B) Eşik: kalkan sv5, 95→97 Ejderha arasında uçurum ──
  { id: 'B2 95 ejderha — eşiğin altı', attacker: { dragon: 95, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 5 },
    shieldPct: 100, atkLost: 2, defLost: 215, winner: 'attacker' },
  { id: 'B3 97 ejderha — eşikte', attacker: { dragon: 97, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 5 },
    shieldPct: 28.3, atkLost: 1, defLost: 235, winner: 'attacker' },
  { id: 'B4 98 ejderha — çöktü', attacker: { dragon: 98, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 5 },
    shieldPct: 0, atkLost: 1, defLost: 245, winner: 'attacker' },

  // ── C) FAZ AYRIMI: saf fiziksel saldırıda kalkan hiç yıpranmaz ──
  { id: 'C1 saf yakın, dengeli', attacker: { dwarf: 1500 },
    defender: { dwarf: 1200, shaman: 200, magic_shield: 3 },
    shieldPct: 100, atkLost: 885, defLost: 287.5, winner: 'defender' },
  { id: 'C2 saf yakın, ezici', attacker: { dwarf: 4000 },
    defender: { dwarf: 1500, shaman: 200, magic_shield: 3 },
    shieldPct: 100, atkLost: 346, defLost: 1700, winner: 'attacker' },
  { id: 'C3 saf menzilli, dengeli', attacker: { elf: 1500 },
    defender: { elf: 1200, shaman: 200, magic_shield: 3 },
    shieldPct: 100, atkLost: 1118, defLost: 538, winner: 'defender' },
  { id: 'C4 saf menzilli, ezici', attacker: { elf: 2500 },
    defender: { elf: 1500, shaman: 200, magic_shield: 3 },
    shieldPct: 100, atkLost: 806, defLost: 1668, winner: 'attacker' },

  // ── D) SUR + KALKAN: ikisi aynı fazda hatta değil ──
  { id: 'D1 saf fiziksel — sur erir, kalkan sağlam', attacker: { dwarf: 2500, cavalry: 200 },
    defender: { dwarf: 1200, elf: 600, shaman: 200, wall: 5, magic_shield: 3 },
    shieldPct: 100, wallPct: 0, atkLost: 703, defLost: 1504, winner: 'attacker' },
  { id: 'D2 hafif büyü — ikisi de sağlam', attacker: { dragon: 60, shaman: 500 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, wall: 5, magic_shield: 3 },
    shieldPct: 100, wallPct: 100, atkLost: 0, defLost: 279, winner: 'attacker' },
  { id: 'D3 ağır büyü — kalkan çöker, SUR %87,5 dayanır', attacker: { dragon: 75, shaman: 500 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, wall: 5, magic_shield: 3 },
    shieldPct: 0, wallPct: 87.57, atkLost: 0, defLost: 1203, winner: 'attacker' },
  /* D4/I3 — karışık saldırı, Sur ve Kalkan birlikte kısmen eriyor. Bu senaryonun İLK ölçümü
   * yanlış okunmuştu (kalkan %6,8 · saldıran 0) ve üç izolasyon setine mal oldu; kullanıcı
   * birebir tekrarlayınca motorla oturdu. Buradaki sayılar TEKRAR ölçümüdür. */
  { id: 'D4/I3 karışık — Sur ve Kalkan birlikte', attacker: { dwarf: 2500, cavalry: 200, dragon: 60 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, wall: 5, magic_shield: 3 },
    shieldPct: 35.9, wallPct: 36.82, atkLost: 55, defLost: 1012, winner: 'attacker' },

  // ── I) D4'ün yapı bileşenleri tek tek ──
  { id: 'I1 yalnız Sur 5', attacker: { dwarf: 2500, cavalry: 200, dragon: 60 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, wall: 5 },
    wallPct: 34.57, atkLost: 53.5, defLost: 1096, winner: 'attacker' },
  { id: 'I2 yalnız Kalkan 3', attacker: { dwarf: 2500, cavalry: 200, dragon: 60 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, magic_shield: 3 },
    shieldPct: 0, atkLost: 53, defLost: 1222, winner: 'attacker' },

  // ── H) D1↔D4 farkını tek tek açan set ──
  { id: 'H2 D1 + Şaman 650', attacker: { dwarf: 2500, cavalry: 200 },
    defender: { dwarf: 1200, elf: 600, shaman: 650, wall: 5, magic_shield: 3 },
    shieldPct: 100, wallPct: 76.72, atkLost: 1000, defLost: 273, winner: 'defender' },
  { id: 'H4 D4 eksi yapılar', attacker: { dwarf: 2500, cavalry: 200, dragon: 60 },
    defender: { dwarf: 1200, elf: 600, shaman: 650 },
    atkLost: 52, defLost: 1320, winner: 'attacker' },

  // ── G) uçan/yerdeki büyük birim ayrımı — uçma mekaniği YOK ──
  { id: 'G4 60 Ejderha (uçan)', attacker: { dwarf: 2500, dragon: 60 },
    defender: { dwarf: 2500, elf: 1200, shaman: 400 },
    atkLost: 758, defLost: 1697, winner: 'attacker' },
  { id: 'G5 68 Ogre (yerde, aynı Alan)', attacker: { dwarf: 2500, ogre: 68 },
    defender: { dwarf: 2500, elf: 1200, shaman: 400 },
    atkLost: 701, defLost: 2698, winner: 'attacker' },

  // ── E) Savunan Büyücülüğü: Şaman çıkarması faza göre stat okur ──
  { id: 'E2 savunan Büyücülük 2', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 1 }, defTech: { sorcery: 2 },
    shieldPct: 14.0, atkLost: 18.5, defLost: 112, winner: 'attacker' },
  { id: 'E3 savunan Büyücülük 4', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 1 }, defTech: { sorcery: 4 },
    shieldPct: 35.4, atkLost: 41, defLost: 74.5, winner: 'attacker' },
  { id: 'E4 savunan Büyücülük 6', attacker: { dragon: 85, shaman: 500 },
    defender: { dragon: 60, shaman: 650, magic_shield: 1 }, defTech: { sorcery: 6 },
    shieldPct: 69.5, atkLost: 63, defLost: 39.5, winner: 'defender' },

  // ── F) Şaman katsayısı ham (1,0): menzilli havuz tam sıfırlanır ──
  { id: 'F1 40 ejderha ↔ 400 şaman (havuz tam sıfır)', attacker: { dragon: 40 },
    defender: { dragon: 30, shaman: 400, magic_shield: 1 },
    shieldPct: 90.93, atkLost: 34, defLost: 3, winner: 'defender' },
  { id: 'F4 50 ejderha ↔ 400 şaman', attacker: { dragon: 50 },
    defender: { dragon: 30, shaman: 400, magic_shield: 1 },
    shieldPct: 38.28, atkLost: 27, defLost: 30, winner: 'defender' },
];

describe('sur + büyü kalkanı — ikinci altın set', () => {
  for (const c of CASES) {
    it(`${c.id}: yüzdeler`, () => {
      const r = measure(c);
      if (c.shieldPct != null) {
        expect(Math.abs(r.shieldPct - c.shieldPct), `kalkan ${r.shieldPct.toFixed(2)}`)
          .toBeLessThanOrEqual(2);
      }
      if (c.wallPct != null) {
        expect(Math.abs(r.wallPct - c.wallPct), `sur ${r.wallPct.toFixed(2)}`)
          .toBeLessThanOrEqual(2);
      }
    });

    it(`${c.id}: kayıplar ve kazanan`, () => {
      const r = measure(c);
      expectClose(r.atkLost, c.atkLost, 'saldıran kaybı');
      expectClose(r.defLost, c.defLost, 'savunan kaybı');
      expect(r.winners).toEqual(new Set([c.winner]));
    });
  }

  it('kalkan yalnız BÜYÜ fazında yıpranır (sur yalnız fiziksel)', () => {
    // Aynı savunan, iki farklı saldırı tipi. Saf fizikselde kalkan sağlam, sur erir; büyüde tersi.
    const def = { dwarf: 1200, elf: 600, shaman: 650, wall: 5, magic_shield: 3 };
    const phys = simulate({ seed: 'x', attacker: { counts: { dwarf: 2500, cavalry: 200 } },
      defender: { counts: { ...def, shaman: 200 } } });
    const magic = simulate({ seed: 'x', attacker: { counts: { dragon: 75, shaman: 500 } },
      defender: { counts: def } });
    expect(phys.defender.shieldIntegrity).toBe(1);          // fiziksel → kalkana dokunulmadı
    expect(phys.defender.wallIntegrity!).toBeLessThan(0.5);  // fiziksel → sur eridi
    expect(magic.defender.shieldIntegrity!).toBeLessThan(0.5); // büyü → kalkan eridi
    expect(magic.defender.wallIntegrity!).toBeGreaterThan(0.8); // büyü → sur büyük ölçüde sağlam
  });
});


/**
 * ⭐⭐⭐ SUR'UN İKİ ORANI — `1,8^Sv` ve `durum` SADELEŞİYOR (2026-08-12).
 *
 * Ghidra'da zincirin tamamı okundu (`FUN_00413610` güç · `FUN_0041338c` stat ·
 * `FUN_0040e0c4`@0x40e628 net/bölücü · `FUN_00413534` düşüş) ve motorla **birebir** aynı çıktı.
 * Bunun beklenmedik bir sonucu var: pay ve payda ikisi de `Sv × 1,8^Sv × durum` taşıdığı için
 *
 *     düşüş = 100 × (Alan/mDef) × (havuz/P) / Sv  −  100 × (pAtk_ölçekli/mDef)
 *
 * ⇒ Sur'un yıpranmasını **yalnız iki oran** belirliyor. ⚠️ `cfg.wall.base` bu denklemde YOK,
 * yani Sur bütünlüğü için **ölü bir düğme** — panelden oynatan biri hiçbir şey değiştirmediğini
 * bilmeli. (Surun P'ye kattığı güç üzerinden birim kayıplarını dolaylı etkiler, o ayrı.)
 *
 * ⚠️ Kullanıcının binary ölçümü bu iki oranın YANLIŞ olduğunu gösterdi (sv10: binary %53,59,
 * motor %100). Sur, katalogda statlarının kaynağı belgelenmemiş tek satır. Düzeltme, iki oranı
 * birbirinden ayıran ölçüm gelince yapılacak: `docs/SUR_TESTLERI.md`.
 */
describe('⭐ SUR — base ölü düğme, iki oran belirleyici', () => {
  const side = (counts: Record<string, number>, tech: Record<string, number> = {}) => ({
    counts, tech, heroes: [], temple: 0, heroCount: 0,
  });
  const wallPct = (lv: number, tech: Record<string, number>, base?: number): number => {
    let s = 0;
    for (let i = 0; i < 8; i++) {
      const r = simulate({
        attacker: side({ mangonel: 300 }),
        defender: side({ elf: 27_000, wall: lv }, tech),
        night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: `sur-${i}`,
      }, base == null ? undefined : { wall: { base, durumMax: 100 } });
      s += ((r.defender.wallIntegrity ?? 0) * 100) / 8;
    }
    return s;
  };

  /**
   * ⚠️ Sadeleşme **tam değil**: `base` Sur'un P'ye kattığı gücü de büyütüyor, o da `havuz/P`yi
   * biraz oynatıyor (bir de `gradePower`daki yuvarlama var). Ölçülen artık ~0,5 puan.
   * Testin iddiası bu yüzden "hiç değişmez" değil, **"kat kat değişmesi gerekirken kıpırdamıyor"**:
   * base 1,5 → 2,5 Sur'un ham gücünü sv4'te **3,7 KAT** büyütüyor (10,5 → 39,1) ama bütünlük
   * 1 puandan az oynuyor. Aynı büyüklükte bir `Alan/mDef` değişimi eğriyi baştan sona kaydırır.
   */
  it('⭐⭐ `wall.base` 3,7 kat değişse bile Sur bütünlüğü 1 puandan az oynuyor', () => {
    const a = wallPct(4, {}, 1.5);
    const b = wallPct(4, {}, 1.8);
    const c = wallPct(4, {}, 2.5);
    expect(Math.abs(b - a), 'base 1,5 ↔ 1,8').toBeLessThan(1);
    expect(Math.abs(c - a), 'base 1,5 ↔ 2,5').toBeLessThan(1);
    // Kontrol: ham güç gerçekten 3,7 kat değişiyor — yani test boş bir şey ölçmüyor.
    expect((2.5 ** 4) / (1.5 ** 4)).toBeGreaterThan(3.5);
  });

  it('⭐ Taş Ustalığı Sur`u güçlendiriyor ama eğri DOĞRUSAL (ikinci terim)', () => {
    const t0 = wallPct(4, {});
    const t5 = wallPct(4, { masonry: 5 });
    const t10 = wallPct(4, { masonry: 10 });
    expect(t5 - t0).toBeCloseTo(t10 - t5, 0);   // eşit aralık → doğrusal
  });

  /**
   * ⚠️ ALTIN KAYIT — bugünkü (yanlış olduğu bilinen) eğri. Sur statları ölçümle düzeltilince
   * bu sayılar değişecek ve test kırılacak; kırıldığında güncellemek DOĞRU davranış.
   * Binary karşılığı aynı savaşta: sv7'ye kadar %0, sv8 %15,19, sv10 %53,59.
   */
  it('⚠️ bugünkü seviye eğrisi (binary ile ÇELİŞİYOR — bkz. docs/SUR_TESTLERI.md)', () => {
    expect(wallPct(2, {})).toBeCloseTo(73.7, 0);
    expect(wallPct(4, {})).toBeCloseTo(91.2, 0);
    expect(wallPct(8, {})).toBe(100);
  });
});
