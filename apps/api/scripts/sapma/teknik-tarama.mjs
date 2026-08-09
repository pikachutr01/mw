/** Gerçek savaşta Büyücülük/İçgüdü'yü tarar: motor hangi değerde binary'nin sonucunu veriyor? */
import { simulate } from '@mobilwar/engine';

const ATK = {
  archery: 18, armor: 16, blacksmithing: 18, cartography: 20, chemistry: 17,
  colonization: 14, espionage: 18, instinct: 15, masonry: 16, night_vision: 14,
  sorcery: 20, talisman: 17,
};
const go = (tech) => simulate({
  attacker: {
    counts: {
      dwarf: 7160, elf: 6494, cavalry: 5314, pegasus: 5532, dragon: 2162, mangonel: 2306,
      ogre: 1730, shaman: 5311, cargo_wagon: 5781, gnome: 4000, chaos: 774,
    },
    tech,
    heroes: Array.from({ length: 5 }, () => ({ level: 0, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0 })),
    temple: 31, heroCount: 5,
  },
  defender: {
    counts: {
      dwarf: 10028, elf: 9000, cavalry: 8000, pegasus: 7500, dragon: 3000, mangonel: 3500,
      ogre: 2500, shaman: 6000, spy_bird: 3516, cargo_wagon: 5000, gnome: 4000, chaos: 1000,
      wall: 2,
    },
    tech: { blacksmithing: 2, espionage: 2 }, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1,
  },
  night: false, nightVisionAttacker: 14, nightVisionDefender: 0, seed: 'mission:4108',
});

console.log('HEDEF (binary): saldıran kayıp 27065 · Kaos kalan 342 · xp 834221');
console.log('');
for (const t of ['sorcery', 'instinct']) {
  console.log(`${t} taraması (diğerleri gerçek değerinde):`);
  for (let lv = ATK[t]; lv <= ATK[t] + 12; lv += 2) {
    const r = go({ ...ATK, [t]: lv });
    console.log(`  ${t} ${String(lv).padStart(2)}  saldıran kayıp ${String(r.attacker.lost).padStart(6)}`
      + `  Kaos kalan ${String(Math.round(r.attacker.counts.chaos ?? 0)).padStart(4)}`
      + `  xp ${String(r.xp).padStart(8)}`);
  }
  console.log('');
}
