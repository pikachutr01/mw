import { simulate } from '@mobilwar/engine';

const TR = {
  dwarf: 'Cüce', elf: 'Elf', cavalry: 'Süvari', pegasus: 'Pegasus', dragon: 'Ejderha',
  mangonel: 'Mancınık', ogre: 'Ogre', shaman: 'Şaman', spy_bird: 'Casus Kuş',
  cargo_wagon: 'Yük Arabası', gnome: 'Gnom', chaos: 'Kaos', wall: 'Sur',
};
const rows = [];

function run(id, ad, a, d) {
  const r = simulate({
    attacker: { counts: a.counts, tech: a.tech ?? {}, heroes: [], temple: 0, heroCount: 0 },
    defender: {
      counts: d.counts, tech: d.tech ?? {}, heroes: [], temple: 0, heroCount: 0, wallIntegrity: 1,
    },
    night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'senaryo',
  });
  const fmt = (before, after) => Object.entries(before)
    .filter(([k]) => k !== 'wall')
    .map(([k, v]) => `${TR[k]} ${v}→${Math.round(after[k] ?? 0)}`).join(' · ');
  rows.push({
    id, ad,
    sGirdi: Object.entries(a.counts).map(([k, v]) => `${TR[k]} ${v}`).join(' · '),
    sTek: Object.entries(a.tech ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—',
    dGirdi: Object.entries(d.counts).map(([k, v]) => `${TR[k]} ${v}`).join(' · '),
    dTek: Object.entries(d.tech ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—',
    kazanan: r.winner === 'attacker' ? 'saldıran' : r.winner === 'defender' ? 'savunan' : 'berabere',
    tur: r.turns,
    sKalan: fmt(a.counts, r.attacker.counts),
    dKalan: fmt(d.counts, r.defender.counts),
    sKayip: r.attacker.lost, dKayip: r.defender.lost,
    xp: r.xp, altin: r.debris.gold, yemek: r.debris.food,
    sur: r.defender.wallIntegrity == null ? '—' : `%${(r.defender.wallIntegrity * 100).toFixed(1)}`,
  });
}

/* A · Saf takas oranı — mDef bölücüsünü ve karşı yönü birlikte ölçer */
run('A1', 'Cüce simetrik (savunan kıl payı kazanır)', { counts: { dwarf: 1000 } }, { counts: { dwarf: 1000 } });
run('A2', 'Cüce 1,2× — EN HASSAS NOKTA, iki taraf da kanıyor', { counts: { dwarf: 1200 } }, { counts: { dwarf: 1000 } });
run('A3', 'Cüce 1,5×', { counts: { dwarf: 1500 } }, { counts: { dwarf: 1000 } });
run('A4', 'Cüce 2×', { counts: { dwarf: 2000 } }, { counts: { dwarf: 1000 } });

/* B · Aynı şekil, FARKLI mDef — "hasar başına ölüm" sapmasını yalıtır */
run('B1', 'Süvari simetrik (mDef 845)', { counts: { cavalry: 1000 } }, { counts: { cavalry: 1000 } });
run('B2', 'Süvari 1,2×', { counts: { cavalry: 1200 } }, { counts: { cavalry: 1000 } });
run('B3', 'Ejderha 1,2× (mDef 13.000)', { counts: { dragon: 1200 } }, { counts: { dragon: 1000 } });
run('B4', 'Şaman 1,2× (mDef 750)', { counts: { shaman: 1200 } }, { counts: { shaman: 1000 } });

/* C · Teknik merdiveni — yalnız SALDIRANDA, hassas oranda */
run('C1', 'Zırh 0  (taban)', { counts: { dwarf: 1200 } }, { counts: { dwarf: 1000 } });
run('C2', 'Zırh 10', { counts: { dwarf: 1200 }, tech: { armor: 10 } }, { counts: { dwarf: 1000 } });
run('C3', 'Zırh 20', { counts: { dwarf: 1200 }, tech: { armor: 20 } }, { counts: { dwarf: 1000 } });
run('C4', 'Demircilik 10', { counts: { dwarf: 1200 }, tech: { blacksmithing: 10 } }, { counts: { dwarf: 1000 } });
run('C5', 'Demircilik 20', { counts: { dwarf: 1200 }, tech: { blacksmithing: 20 } }, { counts: { dwarf: 1000 } });
run('C6', 'Tılsım 20', { counts: { dwarf: 1200 }, tech: { talisman: 20 } }, { counts: { dwarf: 1000 } });

/* D · Teknik SAVUNANDA — karşı yönün ölçeklenmesi */
run('D1', 'Savunan Zırh 10', { counts: { dwarf: 1200 } }, { counts: { dwarf: 1000 }, tech: { armor: 10 } });
run('D2', 'Savunan Demircilik 10', { counts: { dwarf: 1200 } }, { counts: { dwarf: 1000 }, tech: { blacksmithing: 10 } });

/* E · Sur */
run('E1', 'Sur 2', { counts: { dwarf: 1500 } }, { counts: { dwarf: 1000, wall: 2 } });
run('E2', 'Sur 5', { counts: { dwarf: 1500 } }, { counts: { dwarf: 1000, wall: 5 } });

/* F · Kayıp-oranı (frac): yük arabası + casus kuş */
run('F1', 'Yük + kuş, savunan kaybeder', { counts: { dwarf: 1500 } },
  { counts: { dwarf: 1000, cargo_wagon: 1000, spy_bird: 1000 } });
run('F2', 'Yük + kuş, savunan kıl payı kaybeder', { counts: { dwarf: 1200 } },
  { counts: { dwarf: 1000, cargo_wagon: 1000, spy_bird: 1000 } });

/* G · Gerçek savaşın 1/10 ölçekli hâli — sapmanın orada da çıktığını doğrular */
run('G1', 'Gerçek savaşın 1/10 ölçeği (tekniksiz)',
  {
    counts: {
      dwarf: 716, elf: 649, cavalry: 531, pegasus: 553, dragon: 216,
      mangonel: 231, ogre: 173, shaman: 531, cargo_wagon: 578, gnome: 400, chaos: 77,
    },
  },
  {
    counts: {
      dwarf: 1003, elf: 900, cavalry: 800, pegasus: 750, dragon: 300,
      mangonel: 350, ogre: 250, shaman: 600, spy_bird: 352, cargo_wagon: 500,
      gnome: 400, chaos: 100, wall: 2,
    },
  });

/* Çıktı: markdown tablo + okunur blok */
console.log('| # | Senaryo | Saldıran | Savunan | Motor: kazanan/tur | Motor: saldıran kalan | Motor: savunan kalan | xp | enkaz altın |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.id} | ${r.ad} | ${r.sGirdi}${r.sTek !== '—' ? ` <br>[${r.sTek}]` : ''} | ${r.dGirdi}${r.dTek !== '—' ? ` <br>[${r.dTek}]` : ''} | ${r.kazanan} / ${r.tur} | ${r.sKalan} | ${r.dKalan} | ${r.xp} | ${r.altin} |`);
}
