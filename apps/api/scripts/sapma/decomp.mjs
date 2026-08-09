import { UNITS_BY_ID } from '@mobilwar/catalog';
// frac = dLM/(dLM+aLM)  ·  xp = (aLM+dLM)·(aLM/dLM)·0.001
const solve = (cargoIn, cargoOut, xp) => {
  const frac = 1 - cargoOut / cargoIn;
  const ratio = (1 - frac) / frac;              // aLM/dLM
  const dLM = xp / ((1 + ratio) * ratio * 0.001);
  return { frac, ratio, dLM, aLM: ratio * dLM };
};
const bin = solve(5000, 1533, 834221);
const eng = solve(5000, 1755, 1090641);
const f = (x) => Math.round(x).toLocaleString('tr-TR');
console.log('               ', 'frac'.padStart(8), 'aLM/dLM'.padStart(9), 'dLM'.padStart(12), 'aLM'.padStart(12));
console.log('BINARY         ', bin.frac.toFixed(4).padStart(8), bin.ratio.toFixed(5).padStart(9), f(bin.dLM).padStart(12), f(bin.aLM).padStart(12));
console.log('MOTOR          ', eng.frac.toFixed(4).padStart(8), eng.ratio.toFixed(5).padStart(9), f(eng.dLM).padStart(12), f(eng.aLM).padStart(12));
console.log('');
console.log('dLM (saldıran→savunan hasarı)  motor/binary =', (eng.dLM / bin.dLM).toFixed(4), ' ← EŞİT');
console.log('aLM (savunan→saldıran hasarı)  motor/binary =', (eng.aLM / bin.aLM).toFixed(4), ' ← MOTOR %22 FAZLA');
console.log('');
const deathsBin = 27065, deathsEng = 29448;
console.log('birim ölümü / hasar birimi  binary =', (deathsBin / bin.aLM).toFixed(5),
            ' motor =', (deathsEng / eng.aLM).toFixed(5),
            ' → binary %' + (100 * (deathsBin / bin.aLM) / (deathsEng / eng.aLM) - 100).toFixed(1), 'daha ölümcül');
console.log('');
console.log('birim       mDef  pAtk  pDef  mAtk    hp  alan  altın  yemek');
for (const id of ['dwarf','elf','cavalry','pegasus','dragon','mangonel','ogre','shaman','chaos','cargo_wagon','gnome','spy_bird']) {
  const u = UNITS_BY_ID[id];
  console.log(id.padEnd(12), String(u.mDef).padStart(5), String(u.pAtk).padStart(5), String(u.pDef).padStart(5),
              String(u.mAtk).padStart(5), String(u.hp).padStart(6), String(u.area).padStart(5),
              String(u.gold).padStart(6), String(u.food).padStart(6));
}
