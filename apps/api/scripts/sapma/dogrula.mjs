/** İki hipotezi sınar: (1) M3'te Sur unutuldu mu? (2) Ogre Demircilik'ten etkilenmemeli mi? */
import { simulate } from '@mobilwar/engine';

const GA = {
  dwarf: 716, elf: 649, cavalry: 531, pegasus: 553, dragon: 216, mangonel: 231,
  ogre: 173, shaman: 531, cargo_wagon: 578, gnome: 400, chaos: 77,
};
const GD = {
  dwarf: 1003, elf: 900, cavalry: 800, pegasus: 750, dragon: 300, mangonel: 350,
  ogre: 250, shaman: 600, spy_bird: 352, cargo_wagon: 500, gnome: 400, chaos: 100,
};
const TUM = {
  archery: 18, armor: 16, blacksmithing: 18, chemistry: 17, instinct: 15, sorcery: 20, talisman: 17,
};
const go = (dCounts, tech = TUM) => simulate({
  attacker: { counts: GA, tech, heroes: [], temple: 0, heroCount: 0 },
  defender: { counts: dCounts, tech: {}, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1 },
  night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'tur2',
});

console.log('═══ HİPOTEZ 1 · M3\'te Sur 2 girilmemiş ═══');
const surlu = go({ ...GD, wall: 2 });
const sursuz = go(GD);
console.log('M3 · Sur 2 ile (belgedeki tahmin) : S kayıp', surlu.attacker.lost,
  '· D kayıp', surlu.defender.lost, '· xp', surlu.xp, '· enkaz', surlu.debris.gold);
console.log('M3 · SURSUZ                       : S kayıp', sursuz.attacker.lost,
  '· D kayıp', sursuz.defender.lost, '· xp', sursuz.xp, '· enkaz', sursuz.debris.gold);
console.log('BINARY (ekran görüntüsü, Sur 0)   : S kayıp 2729 · D kayıp 6041 · xp 84.317 · enkaz 99.115.614');
console.log('BINARY (3 koşu aralığı)           : S kayıp 2728-2735 · D kayıp 6041 · xp 84.296-84.573 · enkaz 99.152.274');
console.log('');
const s = sursuz;
console.log('sursuz motor birim birim:');
for (const [k, v] of Object.entries(GA)) {
  console.log('  ', k.padEnd(12), v, '→', Math.round(s.attacker.counts[k] ?? 0));
}
console.log('  savunan kalan: kuş', Math.round(s.defender.counts.spy_bird ?? 0),
  '· yük', Math.round(s.defender.counts.cargo_wagon ?? 0));
console.log('EKRAN: Cüce 176 · Elf 154 · Süvari 72 · Pegasus 108 · Ejderha 45 · Mancınık 48 ·',
  'Ogre 36 · Şaman 275 · Yük 578 · Gnom 400 · Kaos 34 || savunan kuş 109 · yük 155');
