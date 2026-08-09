/**
 * Görev 4108 (ahmetbatar → Eru Ilúvatar 1:1:1) savaşını motorla çözer.
 * Girdiler canlı veritabanından birebir alındı.
 */
import { simulate } from '@mobilwar/engine';

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
  temple: 31,
  heroCount: 5,
};

const defender = {
  counts: {
    dwarf: 10028, elf: 9000, cavalry: 8000, pegasus: 7500, dragon: 3000,
    mangonel: 3500, ogre: 2500, shaman: 6000, spy_bird: 3516, cargo_wagon: 5000,
    gnome: 4000, chaos: 1000,
    wall: 2,
  },
  wallIntegrity: 1,
  tech: { blacksmithing: 2, espionage: 2 },
  heroes: [],
  temple: 0,
  heroCount: 0,
};

const r = simulate({
  attacker, defender,
  night: false,
  nightVisionAttacker: 14,
  nightVisionDefender: 0,
  seed: 'mission:4108',
});

const order = ['dwarf','elf','cavalry','pegasus','dragon','mangonel','ogre','shaman','spy_bird','cargo_wagon','gnome','chaos'];
const TR = { dwarf:'Cüce', elf:'Elf', cavalry:'Süvari', pegasus:'Pegasus', dragon:'Ejderha',
  mangonel:'Mancınık', ogre:'Ogre', shaman:'Şaman', spy_bird:'Casus Kuş',
  cargo_wagon:'Yük Arabası', gnome:'Gnom', chaos:'Kaos' };

console.log('kazanan       :', r.winner);
console.log('tur           :', r.turns);
console.log('saldıran kayıp:', r.attacker.lost);
console.log('savunan kayıp :', r.defender.lost);
console.log('enkaz         :', r.debris.gold, 'altın /', r.debris.food, 'yemek');
console.log('deneyim (xp)  :', r.xp);
console.log('çıkma ihtimali:', r.captureChance);
console.log('sur bütünlüğü :', r.defender.wallIntegrity);
console.log('kalkan        :', r.defender.shieldIntegrity);
console.log('taşıma kap.   :', r.attackerCarryCapacity);
console.log('motor         :', r.engineVersion, '· katalog', r.catalogHash, '· seed', r.seed);
console.log('');
console.log('birim'.padEnd(14), 'S.giren'.padStart(8), 'S.kalan'.padStart(8), '|',
            'D.giren'.padStart(8), 'D.kalan'.padStart(8), 'D.taban'.padStart(8));
for (const id of order) {
  const ai = attacker.counts[id] ?? 0, af = r.attacker.counts[id] ?? 0;
  const di = defender.counts[id] ?? 0, df = r.defender.counts[id] ?? 0;
  const fl = r.defender.floorRestored?.[id] ?? 0;
  if (ai || di) console.log(TR[id].padEnd(14), String(ai).padStart(8), String(af).padStart(8), '|',
                            String(di).padStart(8), String(df).padStart(8), String(fl).padStart(8));
}
