/** 3. TUR — kalan şüpheli: Zırh/Tılsım Kaos'a değiyor mu? + Şaman'ın Demircilik grubu. */
import { simulate } from '@mobilwar/engine';

const go = (ac, dc, tech = {}) => simulate({
  attacker: { counts: ac, tech, heroes: [], temple: 0, heroCount: 0 },
  defender: { counts: dc, tech: {}, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1 },
  night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'tur3',
});

const say = (id, not, ac, dc, tech, birim) => {
  const r = go(ac, dc, tech);
  const k = Math.round(r.attacker.counts[birim] ?? 0);
  const d = Math.round(r.defender.counts[birim] ?? 0);
  console.log(`| ${id} | ${not} | ${r.winner === 'attacker' ? 'saldıran' : 'savunan'} / ${r.turns}`
    + ` |  | **${k}** |  | **${d}** |  | ${r.xp.toLocaleString('tr-TR')} |  |`);
};

console.log('### N · Zırh ve Tılsım Kaos\'a değiyor mu? (saldıran Kaos 1200 · savunan Kaos 1000)');
console.log('');
console.log('| # | Saldıran teknik | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
say('N1', 'yok (= H1 kıyas)', { chaos: 1200 }, { chaos: 1000 }, {}, 'chaos');
say('N2', '**Zırh 20**', { chaos: 1200 }, { chaos: 1000 }, { armor: 20 }, 'chaos');
say('N3', '**Tılsım 20**', { chaos: 1200 }, { chaos: 1000 }, { talisman: 20 }, 'chaos');
say('N4', 'Zırh 20 + Tılsım 20', { chaos: 1200 }, { chaos: 1000 }, { armor: 20, talisman: 20 }, 'chaos');
say('N5', 'SAVUNANDA Zırh 20', { chaos: 1200 }, { chaos: 1000 }, {}, 'chaos');

console.log('');
console.log('### O · Şaman gerçekten Demircilik grubunda mı? (saldıran Şaman 1200 · savunan Şaman 1000)');
console.log('');
console.log('| # | Saldıran teknik | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
say('O1', 'yok (= B4 kıyas)', { shaman: 1200 }, { shaman: 1000 }, {}, 'shaman');
say('O2', '**Demircilik 18**', { shaman: 1200 }, { shaman: 1000 }, { blacksmithing: 18 }, 'shaman');
say('O3', 'Demircilik 18 + Büyücülük 20', { shaman: 1200 }, { shaman: 1000 }, { blacksmithing: 18, sorcery: 20 }, 'shaman');

console.log('');
console.log('### P · Zırh/Tılsım diğer birimlerde (Cüce dışı — C2/C3/C6 yalnız Cüce\'yi sınamıştı)');
console.log('');
console.log('| # | Saldıran | Saldıran teknik | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [id, birim, ad, n] of [['P1', 'cavalry', 'Süvari', 1200], ['P2', 'dragon', 'Ejderha', 1200],
  ['P3', 'ogre', 'Ogre', 1200], ['P4', 'mangonel', 'Mancınık', 1200]]) {
  for (const [sfx, tech, tad] of [['a', { armor: 20 }, '**Zırh 20**'], ['b', { talisman: 20 }, '**Tılsım 20**']]) {
    const r = go({ [birim]: n }, { [birim]: 1000 }, tech);
    console.log(`| ${id}${sfx} | ${ad} ${n} vs ${ad} 1000 | ${tad} |`
      + ` ${r.winner === 'attacker' ? 'saldıran' : 'savunan'} / ${r.turns} |  |`
      + ` **${Math.round(r.attacker.counts[birim] ?? 0)}** |  |`
      + ` **${Math.round(r.defender.counts[birim] ?? 0)}** |  | ${r.xp.toLocaleString('tr-TR')} |  |`);
  }
}
