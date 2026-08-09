/** Görev 4108 — motorun savaş sonucundan beklenen ganimet. */
import { simulate, calculateLoot } from '@mobilwar/engine';

const attacker = {
  counts: {
    dwarf: 7160, elf: 6494, cavalry: 5314, pegasus: 5532, dragon: 2162,
    mangonel: 2306, ogre: 1730, shaman: 5311, cargo_wagon: 5781, gnome: 4000, chaos: 774,
  },
  tech: {
    archery: 18, armor: 16, blacksmithing: 18, cartography: 20, chemistry: 17,
    colonization: 14, espionage: 18, instinct: 15, masonry: 16, night_vision: 14,
    sorcery: 20, talisman: 17,
  },
  heroes: Array.from({ length: 5 }, () => ({ level: 0, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0 })),
  temple: 31, heroCount: 5,
};
const defender = {
  counts: {
    dwarf: 10028, elf: 9000, cavalry: 8000, pegasus: 7500, dragon: 3000, mangonel: 3500,
    ogre: 2500, shaman: 6000, spy_bird: 3516, cargo_wagon: 5000, gnome: 4000, chaos: 1000,
    wall: 2,
  },
  wallIntegrity: 1, tech: { blacksmithing: 2, espionage: 2 }, heroes: [], temple: 0, heroCount: 0,
};

const r = simulate({
  attacker, defender, night: false,
  nightVisionAttacker: 14, nightVisionDefender: 0, seed: 'mission:4108',
});

// Kasa: canlı okuma 2026-08-09 10:50 UTC. Varışa ~1 saat var, üretimle bir miktar artacak.
const city = { gold: 10_892_022, food: 10_887_327 };
const loot = calculateLoot({
  winner: r.winner,
  debris: r.debris,
  cityResources: city,
  carryCapacity: r.attackerCarryCapacity,
  defendedBefore: true,
  seed: 'mission:4108',
});

const f = (n) => Math.round(n).toLocaleString('tr-TR');
console.log('taşıma kapasitesi :', f(r.attackerCarryCapacity));
console.log('enkaz             :', f(r.debris.gold), 'altın ·', f(r.debris.food), 'yemek');
console.log('şehir kasası      :', f(city.gold), 'altın ·', f(city.food), 'yemek');
console.log('yağma oranı       : altın %' + (loot.effectiveRates.gold * 100).toFixed(1),
  '· yemek %' + (loot.effectiveRates.food * 100).toFixed(1));
console.log('');
console.log('GÖTÜRÜLEN         :', f(loot.taken.gold), 'altın ·', f(loot.taken.food), 'yemek');
console.log('  enkazdan        :', f(loot.fromDebris.gold), '·', f(loot.fromDebris.food));
console.log('  kasadan         :', f(loot.fromPlunder.gold), '·', f(loot.fromPlunder.food));
console.log('kapasiteye sığmadı:', f(loot.plunderNotCarried.gold), '·', f(loot.plunderNotCarried.food));
console.log('savunana kalan enkaz:', f(loot.leftoverDebrisToDefender.gold), '·', f(loot.leftoverDebrisToDefender.food));
console.log('');
console.log('SAVAŞ SONRASI KASA:', f(city.gold - loot.fromPlunder.gold + loot.leftoverDebrisToDefender.gold),
  'altın ·', f(city.food - loot.fromPlunder.food + loot.leftoverDebrisToDefender.food), 'yemek');
