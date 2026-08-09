/**
 * 1. tur senaryolarının KAPSAMINI ölçer: gerçek savaşta hangi birim/teknik ne kadar ağırlık
 *    taşıyor ve bunların hangileri sınandı?
 */
import { simulate } from '@mobilwar/engine';
import { UNITS_BY_ID } from '@mobilwar/catalog';

const ATK_TECH = {
  archery: 18, armor: 16, blacksmithing: 18, cartography: 20, chemistry: 17,
  colonization: 14, espionage: 18, instinct: 15, masonry: 16, night_vision: 14,
  sorcery: 20, talisman: 17,
};
const A0 = {
  dwarf: 7160, elf: 6494, cavalry: 5314, pegasus: 5532, dragon: 2162,
  mangonel: 2306, ogre: 1730, shaman: 5311, cargo_wagon: 5781, gnome: 4000, chaos: 774,
};
const D0 = {
  dwarf: 10028, elf: 9000, cavalry: 8000, pegasus: 7500, dragon: 3000, mangonel: 3500,
  ogre: 2500, shaman: 6000, spy_bird: 3516, cargo_wagon: 5000, gnome: 4000, chaos: 1000,
  wall: 2,
};
const HEROES = Array.from({ length: 5 }, () => ({ level: 0, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0 }));

const go = (tech = ATK_TECH, counts = A0, heroes = HEROES) => simulate({
  attacker: { counts, tech, heroes, temple: 31, heroCount: heroes.length },
  defender: {
    counts: D0, tech: { blacksmithing: 2, espionage: 2 }, heroes: [], temple: 0, heroCount: 0,
    wallIntegrity: 1,
  },
  night: false, nightVisionAttacker: tech.night_vision ?? 0, nightVisionDefender: 0,
  seed: 'mission:4108',
});

const TR = {
  dwarf: 'Cüce', elf: 'Elf', cavalry: 'Süvari', pegasus: 'Pegasus', dragon: 'Ejderha',
  mangonel: 'Mancınık', ogre: 'Ogre', shaman: 'Şaman', chaos: 'Kaos',
};

/* ── 1. Saldıranın lossMag'i birim birim: hangi birim taşıyor? ────────────── */
const binKalan = {
  dwarf: 1811, elf: 1599, cavalry: 753, pegasus: 1114, dragon: 459,
  mangonel: 489, ogre: 366, shaman: 2785, chaos: 342,
};
const engKalan = {
  dwarf: 1372, elf: 1160, cavalry: 498, pegasus: 798, dragon: 327,
  mangonel: 262, ogre: 266, shaman: 2414, chaos: 238,
};
let bt = 0; let et = 0;
const sat = [];
for (const id of Object.keys(binKalan)) {
  const bm = (A0[id] - binKalan[id]) * UNITS_BY_ID[id].mDef;
  const em = (A0[id] - engKalan[id]) * UNITS_BY_ID[id].mDef;
  bt += bm; et += em;
  sat.push([id, bm, em]);
}
console.log('═══ Saldıranın lossMag\'i (ölü × mDef) — hangi birim taşıyor? ═══');
console.log('birim        mDef      BINARY payı     MOTOR payı   BINARY %   MOTOR %');
for (const [id, bm, em] of sat.sort((a, b) => b[2] - a[2])) {
  console.log(TR[id].padEnd(11), String(UNITS_BY_ID[id].mDef).padStart(8),
    Math.round(bm).toLocaleString('tr-TR').padStart(15),
    Math.round(em).toLocaleString('tr-TR').padStart(14),
    ('%' + (100 * bm / bt).toFixed(1)).padStart(10),
    ('%' + (100 * em / et).toFixed(1)).padStart(9));
}
console.log('TOPLAM'.padEnd(11), ''.padStart(8),
  Math.round(bt).toLocaleString('tr-TR').padStart(15),
  Math.round(et).toLocaleString('tr-TR').padStart(14));
console.log('§3.2\'de frac+XP\'den geri çözülen : BINARY 578.448.841 · MOTOR 707.826.009');
console.log('→ model doğrulandı: sapma', Math.round(100 * (bt / 578448841 - 1) * 100) / 100,
  '% /', Math.round(100 * (et / 707826009 - 1) * 100) / 100, '%');

/* ── 2. Teknik kaldır-bak: hangi teknik ne kadar kaldıraç? ────────────────── */
console.log('');
console.log('═══ Teknik kaldıracı — o tekniği 0 yapınca saldıran kaybı ne oluyor? ═══');
const taban = go();
console.log('tam teknik setiyle       : saldıran kayıp', taban.attacker.lost, '· xp', taban.xp);
const rows = [];
for (const t of ['archery', 'blacksmithing', 'chemistry', 'instinct', 'sorcery', 'armor', 'talisman']) {
  const tech = { ...ATK_TECH }; tech[t] = 0;
  const r = go(tech);
  rows.push([t, r.attacker.lost, r.attacker.lost - taban.attacker.lost]);
}
rows.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
const SINANDI = { armor: '✔ C2/C3', blacksmithing: '✔ C4/C5', talisman: '✔ C6' };
for (const [t, lost, d] of rows) {
  console.log('  ', t.padEnd(15), 'kayıp', String(lost).padStart(6),
    (d >= 0 ? '+' : '') + String(d).padStart(6),
    ' 1. turda sınandı mı? ', SINANDI[t] ?? '✘ HAYIR');
}

/* ── 3. Kahraman ve ölçek ─────────────────────────────────────────────────── */
console.log('');
console.log('═══ Diğer sınanmamış boyutlar ═══');
const hersiz = go(ATK_TECH, A0, []);
console.log('  kahramansız              : saldıran kayıp', hersiz.attacker.lost,
  '(fark', hersiz.attacker.lost - taban.attacker.lost, ')');
const teksiz = go({});
console.log('  saldıranda teknik yok    : saldıran kayıp', teksiz.attacker.lost,
  '(fark', teksiz.attacker.lost - taban.attacker.lost, ')');
