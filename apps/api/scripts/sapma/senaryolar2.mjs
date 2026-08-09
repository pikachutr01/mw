/** 2. TUR — 1. turun kör noktaları: Büyücülük · İçgüdü · Kaos · Ogre'nin çift tekniği. */
import { simulate } from '@mobilwar/engine';
import { UNITS_BY_ID } from '@mobilwar/catalog';

const TR = {
  dwarf: 'Cüce', elf: 'Elf', cavalry: 'Süvari', pegasus: 'Pegasus', dragon: 'Ejderha',
  mangonel: 'Mancınık', ogre: 'Ogre', shaman: 'Şaman', spy_bird: 'Casus Kuş',
  cargo_wagon: 'Yük Arabası', gnome: 'Gnom', chaos: 'Kaos', wall: 'Sur',
};
const rows = [];
function run(id, a, d, not = '') {
  const r = simulate({
    attacker: { counts: a.counts, tech: a.tech ?? {}, heroes: a.heroes ?? [], temple: 0, heroCount: (a.heroes ?? []).length },
    defender: { counts: d.counts, tech: d.tech ?? {}, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1 },
    night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'tur2',
  });
  const kalan = (before, after) => Object.entries(before).filter(([k]) => k !== 'wall')
    .map(([k, v]) => `${TR[k]} ${v}→${Math.round(after[k] ?? 0)}`).join(' · ');
  rows.push({
    id,
    s: Object.entries(a.counts).map(([k, v]) => `${TR[k]} ${v}`).join(' · '),
    st: Object.entries(a.tech ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—',
    d: Object.entries(d.counts).map(([k, v]) => `${TR[k]} ${v}`).join(' · '),
    dt: Object.entries(d.tech ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—',
    kaz: r.winner === 'attacker' ? 'saldıran' : r.winner === 'defender' ? 'savunan' : 'berabere',
    tur: r.turns, sk: kalan(a.counts, r.attacker.counts), dk: kalan(d.counts, r.defender.counts),
    sKayip: r.attacker.lost, dKayip: r.defender.lost, xp: r.xp, altin: r.debris.gold, not,
  });
}

const K = (n) => ({ chaos: n });

/* H · KAOS — hiç izole edilmedi, oysa gerçek savaşta lossMag'in %90'ını taşıyor */
run('H1', { counts: K(1200) }, { counts: K(1000) }, 'Kaos tekniksiz taban');
run('H2', { counts: K(1200), tech: { sorcery: 20 } }, { counts: K(1000) }, 'yalnız Büyücülük 20');
run('H3', { counts: K(1200), tech: { instinct: 15 } }, { counts: K(1000) }, 'yalnız İçgüdü 15');
run('H4', { counts: K(1200), tech: { sorcery: 20, instinct: 15 } }, { counts: K(1000) }, 'ikisi birlikte');

/* I · ŞAMAN — B4 tekniksizdi ve kimse ölmedi (boş test). Büyücülükle canlanıyor. */
run('I1', { counts: { shaman: 1200 }, tech: { sorcery: 20 } }, { counts: { shaman: 1000 } }, 'B4 + Büyücülük 20');
run('I2', { counts: { shaman: 1200 } }, { counts: { shaman: 1000 }, tech: { sorcery: 20 } }, 'Büyücülük SAVUNANDA');

/* J · EJDERHA — B3 tekniksizdi */
run('J1', { counts: { dragon: 1200 }, tech: { sorcery: 20 } }, { counts: { dragon: 1000 } }, 'B3 + Büyücülük 20');
run('J2', { counts: { dragon: 1200 }, tech: { instinct: 15 } }, { counts: { dragon: 1000 } }, 'B3 + İçgüdü 15');

/* K · OGRE — oyundaki TEK çift-teknik birimi (Demircilik + İçgüdü, ikisi de `atk`) */
run('K1', { counts: { ogre: 1200 } }, { counts: { ogre: 1000 } }, 'taban');
run('K2', { counts: { ogre: 1200 }, tech: { blacksmithing: 18 } }, { counts: { ogre: 1000 } }, 'yalnız Demircilik 18');
run('K3', { counts: { ogre: 1200 }, tech: { instinct: 15 } }, { counts: { ogre: 1000 } }, 'yalnız İçgüdü 15');
run('K4', { counts: { ogre: 1200 }, tech: { blacksmithing: 18, instinct: 15 } }, { counts: { ogre: 1000 } },
  '⭐ İKİSİ BİRLİKTE — toplama mı çarpma mı?');

/* L · PEGASUS / MANCINIK — Okçuluk ve Kimya hiç sınanmadı */
run('L1', { counts: { pegasus: 1200 }, tech: { archery: 18 } }, { counts: { pegasus: 1000 } }, 'Okçuluk 18');
run('L2', { counts: { mangonel: 1200 }, tech: { chemistry: 17 } }, { counts: { mangonel: 1000 } }, 'Kimya 17');

/* M · G'ye TEK DEĞİŞKEN ekleme — G eşleştiği için sapmanın hangi adımda doğduğunu gösterir */
const GA = {
  dwarf: 716, elf: 649, cavalry: 531, pegasus: 553, dragon: 216, mangonel: 231,
  ogre: 173, shaman: 531, cargo_wagon: 578, gnome: 400, chaos: 77,
};
const GD = {
  dwarf: 1003, elf: 900, cavalry: 800, pegasus: 750, dragon: 300, mangonel: 350,
  ogre: 250, shaman: 600, spy_bird: 352, cargo_wagon: 500, gnome: 400, chaos: 100, wall: 2,
};
const GERCEK_TEKNIK = {
  archery: 18, armor: 16, blacksmithing: 18, chemistry: 17, instinct: 15, sorcery: 20, talisman: 17,
};
run('M1', { counts: GA, tech: { sorcery: 20 } }, { counts: GD }, 'G + YALNIZ Büyücülük 20');
run('M2', { counts: GA, tech: { sorcery: 20, instinct: 15 } }, { counts: GD }, 'G + Büyücülük + İçgüdü');
run('M3', { counts: GA, tech: GERCEK_TEKNIK }, { counts: GD }, 'G + saldıranın TÜM teknikleri');
run('M4', { counts: GA, tech: GERCEK_TEKNIK }, { counts: GD, tech: { blacksmithing: 2 } },
  'G + tüm teknikler + savunanın Demircilik 2');
run('M5', {
  counts: GA, tech: GERCEK_TEKNIK,
  heroes: Array.from({ length: 5 }, () => ({ level: 0, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0 })),
}, { counts: GD, tech: { blacksmithing: 2 } }, '= gerçek savaşın 1/10\'u, TAM girdiyle');

console.log('| # | Saldıran | Saldıran teknik | Savunan | Kazanan/tur | S kalan | D kalan | S kayıp | D kayıp | XP | Enkaz altın | Not |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.id} | ${r.s} | ${r.st} | ${r.d}${r.dt !== '—' ? ` [${r.dt}]` : ''} | ${r.kaz} / ${r.tur} | ${r.sk} | ${r.dk} | ${r.sKayip} | ${r.dKayip} | ${r.xp} | ${r.altin} | ${r.not} |`);
}
console.log('');
console.log('Kaos stat:', JSON.stringify(UNITS_BY_ID['chaos']));
