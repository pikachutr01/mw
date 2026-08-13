/**
 * ⭐ SUR SAPMASININ REFERANS SAVAŞI (kullanıcı ölçümü, 2026-08-14).
 *
 * `docs/SUR_TESTLERI.md`in tetikleyicisi olan ilk büyük savaşın GİRDİSİ hiçbir yere
 * kaydedilmemişti; altı ölçüm seti (A-G) bu yüzden her seferinde kullanıcıdan elle ölçüm
 * istemek zorunda kaldı. Bu, onun yerine geçen ikinci büyük savaş — girdisi burada duruyor,
 * yani hipotezler artık **ölçüm istemeden** sınanabilir.
 *
 * Binary (v0.5.5) çıktısı:
 *   savunan kazandı · 5 tur · saldıran 33.558 · savunan 12.645 kayıp
 *   enkaz 46.340.216 altın / 47.611.121 yemek · XP 17.586 · kahraman çıkma %0,0
 *   Sur sv7 → **%0,0**
 *
 * Binary Sur seviye taraması (aynı savaş, yalnız Sur kutusu değişiyor):
 *   sv7 → 0 · sv13 → 38,41-38,60 · sv14 → ~71,50 · sv15 → ~90,60 · sv16 → 100
 *
 * Kullanım:  node scripts/sapma/sim-sur-buyuk.mjs        (apps/api içinden)
 */
import { simulate } from '@mobilwar/engine';

const attacker = {
  counts: {
    dwarf: 7542, elf: 6211, cavalry: 4128, pegasus: 2654, dragon: 647,
    mangonel: 450, ogre: 2544, shaman: 5000, spy_bird: 0,
    cargo_wagon: 5478, gnome: 6841, chaos: 3,
  },
  // ⚠️ Taş Ustalığı saldıranda kutu olarak "-" (uygulanmıyor) → hiç verilmiyor.
  tech: {
    archery: 16, blacksmithing: 17, sorcery: 20, armor: 14,
    chemistry: 16, instinct: 15, talisman: 18,
  },
  heroes: [], temple: 0, heroCount: 0,
};

const defender = {
  counts: {
    dwarf: 6541, elf: 5127, cavalry: 4125, pegasus: 3249, dragon: 419,
    mangonel: 674, ogre: 3697, shaman: 6000, spy_bird: 4125,
    cargo_wagon: 6543, gnome: 6661, chaos: 2,
    wall: 7,
  },
  wallIntegrity: 1,
  tech: {
    archery: 16, blacksmithing: 17, sorcery: 20, armor: 19,
    chemistry: 14, masonry: 14, instinct: 16, talisman: 15,
  },
  heroes: [], temple: 0, heroCount: 0,
};

/** Binary'nin ölçtüğü değerler — karşılaştırma için. */
const BINARY = {
  winner: 'defender', turns: 5, atkLost: 33_558, defLost: 12_645,
  gold: 46_340_216, food: 47_611_121, xp: 17_586,
  // savunanda savaştan çıkan adetler
  defLeft: {
    dwarf: 5468, elf: 3653, cavalry: 2920, pegasus: 2748, dragon: 328,
    mangonel: 492, ogre: 3089, shaman: 5150, spy_bird: 4125,
    cargo_wagon: 6543, gnome: 0, chaos: 2,
  },
  atkLeft: { cargo_wagon: 1099, gnome: 6841 },
  wallBySv: { 7: 0, 13: 38.5, 14: 71.5, 15: 90.6, 16: 100 },
};

const run = (sv, seed = 'sur-buyuk') => simulate({
  attacker,
  defender: { ...defender, counts: { ...defender.counts, wall: sv } },
  night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed,
});

const r = run(7);
const pct = (a, b) => (b === 0 ? '—' : `${(((a - b) / b) * 100).toFixed(2)}%`);
const row = (ad, motor, bin) =>
  console.log(`${ad.padEnd(18)} ${String(motor).padStart(12)} ${String(bin).padStart(12)}  ${pct(motor, bin)}`);

console.log('alan                     motor       binary   fark');
row('kazanan', r.winner, BINARY.winner);
row('tur', r.turns, BINARY.turns);
row('saldıran kaybı', Math.round(r.attacker.lost), BINARY.atkLost);
row('savunan kaybı', Math.round(r.defender.lost), BINARY.defLost);
row('enkaz altın', Math.round(r.debris.gold), BINARY.gold);
row('enkaz yemek', Math.round(r.debris.food), BINARY.food);
row('xp', Math.round(r.xp), BINARY.xp);
row('Sur sv7 %', ((r.defender.wallIntegrity ?? 0) * 100).toFixed(2), BINARY.wallBySv[7]);

console.log('\nSur seviye taraması (8 tohum ortalaması)');
console.log('sv    motor%    binary%');
for (const sv of [7, 8, 10, 12, 13, 14, 15, 16]) {
  let s = 0;
  for (let i = 0; i < 8; i++) s += ((run(sv, `sur-${i}`).defender.wallIntegrity ?? 0) * 100) / 8;
  const b = BINARY.wallBySv[sv];
  console.log(`${String(sv).padStart(2)}  ${s.toFixed(2).padStart(8)}  ${(b == null ? '—' : b).toString().padStart(8)}`);
}

console.log('\nsavunanda kalan (motor ↔ binary)');
for (const [k, v] of Object.entries(BINARY.defLeft)) {
  const m = Math.round(r.defender.counts[k] ?? 0);
  console.log(`  ${k.padEnd(12)} ${String(m).padStart(6)} ${String(v).padStart(6)}  ${pct(m, v)}`);
}
console.log('saldıranda kalan');
for (const [k, v] of Object.entries(BINARY.atkLeft)) {
  const m = Math.round(r.attacker.counts[k] ?? 0);
  console.log(`  ${k.padEnd(12)} ${String(m).padStart(6)} ${String(v).padStart(6)}  ${pct(m, v)}`);
}
