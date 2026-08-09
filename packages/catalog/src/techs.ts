import type { TechDef, TechId, TechStat } from './types.ts';

/**
 * §T TEKNİK SİSTEMİ — v0.6 DOKÜMAN TABANLI.
 * Kaynak: `teknik_ve_yapi_dokumantasyonu.md` — (a) her birimin "Etkilendiği Teknikler" listesi
 * (ÜYELİK), (b) TEKNİKLER bölümündeki yüzde listesi (HANGİ STAT + ORAN). Çelişkide birim listesi
 * kazanır (daha ayrıntılı). Formül LİNEER: stat × (1 + seviye × rate); seviye tavanı yok.
 *
 * Oranlar: Zırh ve Taş Ustalığı %6, diğer tüm teknikler %5.
 * Stat kodları: atk = hp (fiziksel vuruş) · matk = magicHp (büyü vuruş)
 *               pmit = pAtk + pDef (fiziksel savunma) · mmit = mAtk (büyü savunması)
 */
export const TECHS: readonly TechDef[] = [
  {
    id: 'archery', name: { tr: 'Okçuluk' }, rate: 0.05, stat: 'atk',
    units: ['elf', 'pegasus', 'archer_tower', 'ballista'],
    baseGold: 100, baseFood: 100,
  },
  {
    /**
     * ⚠️⚠️ **OGRE BU LİSTEDE DEĞİL** (2026-08-09, binary'den doğrulandı).
     *
     * Kullanıcı binary simülatörde ölçtü: `Ogre 1200 vs Ogre 1000` savaşında Demircilik 18
     * vermek sonucu **hiç değiştirmiyor** (kalan 809-811, tekniksiz koşuyla birebir aynı) ve
     * İçgüdü'nün üstüne eklenince de bir şey değişmiyor.
     *
     * Ghidra sebebi gösterdi: `FUN_0041279c` bir birim id'sini **tek bir `atk` teknik grubuna**
     * eşliyor — yani her savaşçının `atk`ini ölçekleyen **YALNIZ BİR** teknik var:
     *   grup 0 → {Elf, Pegasus}                 = Okçuluk
     *   grup 1 → {Cüce, Süvari, Şaman, Kuş, Yük, Gnom, …} = Demircilik
     *   grup 4 → {Mancınık}                     = Kimya
     *   grup 7 → {Ejderha, **Ogre**, Kaos}      = İçgüdü
     * Dört uygulayıcı (`FUN_004116b8/00411744/0041185c/00411938`) bu gruba göre süzüyor.
     *
     * ⚠️ Bu, aynı stata iki teknik binmesi diye bir şeyin **hiç olmadığı** anlamına da geliyor:
     * aşağıdaki `TECH_BY_UNIT` yorumundaki "toplanır" kuralının tek örneği Ogre'ydi ve o örnek
     * yanlışmış. Kural yine de duruyor — savunma yapıları için geçerliliği ayrıca sınanmadı.
     *
     * ⚠️ **Şaman** binary'de bu grupta (id 7) görünüyor ama motora EKLENMEDİ — denendi ve
     * ÖLÇÜLEBİLİR HİÇBİR ETKİSİ YOK: motorda Şaman `hp` üzerinden hasar vermiyor (kalkan gibi
     * davranıyor, `shieldCal`), dolayısıyla `atk` ölçeklemesi ona hiç dokunmuyor. Gerçek savaşta
     * eklemek kaybı 29.448 → 29.450 yaptı. Eklemek, ölçülemeyen bir farkı katalog kütüğüne
     * yazmak olurdu; ölçülebilir bir sonda bulunursa (Şaman'ın hasar verdiği bir kurulum) tekrar
     * bakılmalı.
     */
    id: 'blacksmithing', name: { tr: 'Demircilik' }, rate: 0.05, stat: 'atk',
    units: ['dwarf', 'cavalry', 'gnome', 'trap', 'guard'],
    baseGold: 100, baseFood: 100,
  },
  {
    id: 'chemistry', name: { tr: 'Kimya' }, rate: 0.05, stat: 'atk',
    units: ['mangonel', 'oil_cauldron', 'mangonel_tower'],
    baseGold: 200, baseFood: 160,
  },
  {
    id: 'instinct', name: { tr: 'İçgüdü' }, rate: 0.05, stat: 'atk',
    units: ['dragon', 'ogre', 'chaos'],
    baseGold: 300, baseFood: 250,
  },
  {
    /* ⭐ 2026-07-29: BÜYÜ KALKANI BU LİSTEDEN ÇIKARILDI. Binary'de Büyücülük uygulayıcısı
     * (FUN_004118e8 → FUN_004124cc) yalnız SAVAŞÇI listesini gezip magicHp'yi ölçekler; Sur/Kalkan
     * nesnelerine hiç dokunmaz. Kalkanın magicHp'si zaten 0 → etkisiz. Kalkanı güçlendiren TILSIM. */
    id: 'sorcery', name: { tr: 'Büyücülük' }, rate: 0.05, stat: 'matk',
    units: ['shaman', 'pegasus', 'dragon', 'chaos'],
    baseGold: 200, baseFood: 160,
  },
  {
    // "Zırh giyen ünitelerin fiziksel defans gücünü %6 arttırır" (Kaos hariç tüm savaşçılar)
    id: 'armor', name: { tr: 'Zırh' }, rate: 0.06, stat: 'pmit',
    units: ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre', 'shaman', 'gnome',
      'oil_cauldron', 'guard'],
    baseGold: 100, baseFood: 100,
  },
  {
    // "Savunma ünitelerinin fiziksel savunma gücünü %6 arttırır" (Okçu Kulesi, Mangonel, Balista, Sur)
    id: 'masonry', name: { tr: 'Taş Ustalığı' }, rate: 0.06, stat: 'pmit',
    units: ['archer_tower', 'mangonel_tower', 'ballista', 'wall'],
    baseGold: 250, baseFood: 200,
  },
  {
    /* "Büyü savunma gücünü %5 arttırır" — Mancınık/Kaos/Yük/Casus HARİÇ.
     * ⭐ 2026-07-29: BÜYÜ KALKANI EKLENDİ. Binary'de Tılsım uygulayıcısı (FUN_00411988) savaşçıların
     * mAtk'ini ölçekledikten sonra AYRICA `ordu+0x98` = KALKAN nesnesini alıp FUN_00413744 ile onun
     * mAtk'ini `mAtk × (1 + sv×0,05)` yapar — kalkanın MİTİGASYONU budur. İkizi: Taş Ustalığı →
     * FUN_00411a28 → `ordu+0x10` = SUR (FUN_004136a4, pAtk+pDef). Dokümanın "Büyücülük … Büyü
     * Kalkanı" ifadesi yanıltıcı: Büyücülük büyü VURUŞ gücünü (magicHp) ölçekler, kalkanın 0. */
    id: 'talisman', name: { tr: 'Tılsım' }, rate: 0.05, stat: 'mmit',
    units: ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'ogre', 'gnome', 'shaman',
      'oil_cauldron', 'guard', 'magic_shield'],
    baseGold: 250, baseFood: 200,
  },
  // ── Savaş statlarına doğrudan etkisi olmayan teknikler ───────────────────────
  { id: 'espionage', name: { tr: 'Casusluk' }, rate: 0, stat: null, units: [], baseGold: 120, baseFood: 80 },
  { id: 'cartography', name: { tr: 'Haritacılık' }, rate: 0, stat: null, units: [], baseGold: 120, baseFood: 80 },
  { id: 'colonization', name: { tr: 'Sömürgecilik' }, rate: 0, stat: null, units: [], baseGold: 400, baseFood: 300 },
  { id: 'night_vision', name: { tr: 'Gece Görüş' }, rate: 0, stat: null, units: [], baseGold: 300, baseFood: 250 },
] as const;

export const TECHS_BY_ID: Readonly<Record<string, TechDef>> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
);

/** Oyuncunun teknik seviyeleri. Verilmeyen teknik 0 sayılır. */
export type TechLevels = Partial<Record<TechId, number>>;

/**
 * Ters indeks: birim id → [[teknik, stat], ...].
 * Bir birim birden çok teknikten etkilenebilir (tek örnek: Ogre = Demircilik + İçgüdü) — bu durumda
 * bonuslar TOPLANIR, çarpılmaz: 1 + Σ(seviye × rate). Çarpım Ogre'yi ×2.25'e fırlatıyordu.
 */
export const TECH_BY_UNIT: Readonly<Record<string, ReadonlyArray<[TechId, TechStat]>>> = (() => {
  const out: Record<string, Array<[TechId, TechStat]>> = {};
  for (const t of TECHS) {
    if (!t.stat) continue;
    for (const unitId of t.units) {
      (out[unitId] ??= []).push([t.id, t.stat]);
    }
  }
  return out;
})();
