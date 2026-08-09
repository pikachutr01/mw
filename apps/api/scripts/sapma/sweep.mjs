import { simulate } from '@mobilwar/engine';
const attacker = {
  counts: { dwarf:7160, elf:6494, cavalry:5314, pegasus:5532, dragon:2162, mangonel:2306,
            ogre:1730, shaman:5311, cargo_wagon:5781, gnome:4000, chaos:774 },
  tech: { archery:18, armor:16, blacksmithing:18, cartography:20, chemistry:17, colonization:14,
          espionage:18, instinct:15, masonry:16, night_vision:14, sorcery:20, talisman:17 },
  heroes: Array.from({length:5},()=>({level:0,fAtk:0,fDef:0,mAtk:0,mDef:0})), temple:31, heroCount:5,
};
const defender = {
  counts: { dwarf:10028, elf:9000, cavalry:8000, pegasus:7500, dragon:3000, mangonel:3500,
            ogre:2500, shaman:6000, spy_bird:3516, cargo_wagon:5000, gnome:4000, chaos:1000, wall:2 },
  wallIntegrity:1, tech:{ blacksmithing:2, espionage:2 }, heroes:[], temple:0, heroCount:0,
};
const base = { attacker, defender, night:false, nightVisionAttacker:14, nightVisionDefender:0, seed:'mission:4108' };
const run = (ov) => simulate(base, ov);

console.log('HEDEF (binary): saldıran kayıp 27065 · savunan kayıp 60433 · xp 834221');
console.log('');
console.log('counterK taraması:');
for (const k of [1.0, 0.95, 0.9, 0.85, 0.82, 0.8, 0.75]) {
  const r = run({ counterK: k });
  console.log(`  K=${k.toFixed(2)}  saldıran ${String(r.attacker.lost).padStart(6)}  savunan ${String(r.defender.lost).padStart(6)}  xp ${String(r.xp).padStart(8)}  yükArb ${r.defender.counts.cargo_wagon ?? 0}`);
}
console.log('');
console.log('girdi duyarlılığı (counterK=1):');
const variants = {
  'temel                 ': {},
  'gece görüşü 0 (ekran)  ': { nv: 0 },
  'tapınak 0 (ekran)      ': { temple: 0 },
  'saldıranda masonry yok ': { noMasonry: true },
  'savunan casus kuş yok  ': { noBird: true },
  'sur yok                ': { noWall: true },
  'kahraman yok           ': { noHero: true },
};
for (const [ad, v] of Object.entries(variants)) {
  const a = { ...attacker }; const d = { ...defender };
  if (v.temple != null) a.temple = v.temple;
  if (v.noMasonry) { a.tech = { ...attacker.tech }; delete a.tech.masonry; }
  if (v.noHero) { a.heroes = []; a.heroCount = 0; }
  if (v.noBird) { d.counts = { ...defender.counts }; delete d.counts.spy_bird; }
  if (v.noWall) { d.counts = { ...defender.counts }; delete d.counts.wall; }
  const r = simulate({ ...base, attacker: a, defender: d,
    nightVisionAttacker: v.nv != null ? v.nv : 14 });
  console.log(`  ${ad} saldıran ${String(r.attacker.lost).padStart(6)}  savunan ${String(r.defender.lost).padStart(6)}  xp ${String(r.xp).padStart(8)}`);
}
