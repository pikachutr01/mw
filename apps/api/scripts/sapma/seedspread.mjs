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
const a=[], d=[], xp=[], dg=[];
for (let s=0; s<400; s++) {
  const r = simulate({ attacker, defender, night:false, nightVisionAttacker:14, nightVisionDefender:0, seed:`t${s}` });
  a.push(r.attacker.lost); d.push(r.defender.lost); xp.push(r.xp); dg.push(r.debris.gold);
}
const st = (v) => { const s=v.slice().sort((x,y)=>x-y); const m=v.reduce((p,c)=>p+c,0)/v.length;
  return { min:s[0], p05:s[Math.floor(v.length*0.05)], med:s[v.length>>1], p95:s[Math.floor(v.length*0.95)], max:s[s.length-1], ort:Math.round(m) }; };
console.log('saldıran kayıp :', JSON.stringify(st(a)));
console.log('savunan kayıp  :', JSON.stringify(st(d)));
console.log('deneyim        :', JSON.stringify(st(xp)));
console.log('enkaz altın    :', JSON.stringify(st(dg)));
console.log('');
console.log('BINARY  saldıran 27065 · savunan 60433 · xp 834221 · enkaz 992468124');
