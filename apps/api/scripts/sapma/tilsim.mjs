import { simulate } from '@mobilwar/engine';
const go = (b, n, tech) => {
  const r = simulate({
    attacker: { counts: { [b]: 1200 }, tech, heroes: [], temple: 0, heroCount: 0 },
    defender: { counts: { [b]: 1000 }, tech: {}, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1 },
    night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'tur3',
  });
  return Math.round(r.attacker.counts[b] ?? 0);
};
console.log('Tılsım seviyesi taraması (oran %5 sabit) — hangi seviye binary\'yi verir?');
console.log('sv | Kaos (hedef 740-741) | Ejderha (hedef 880-881)');
for (let lv = 20; lv <= 34; lv += 2) {
  console.log(String(lv).padStart(2), '|', String(go('chaos', 1200, { talisman: lv })).padStart(20),
    '|', String(go('dragon', 1200, { talisman: lv })).padStart(22));
}
console.log('');
console.log('Kıyas — Zırh (DOĞRU çıkmıştı): sv 20 → Kaos', go('chaos', 1200, { armor: 20 }),
  '(hedef 720-722) · Ejderha', go('dragon', 1200, { armor: 20 }), '(hedef 866-868)');
