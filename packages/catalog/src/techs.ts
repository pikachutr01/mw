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
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ 2026-08-10 — TABAN FİYATLAR SAVAŞ MOTORUNDAKİ ÖLÇÜLMÜŞ ETKİYE GÖRE SIRALANDI
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * Eski tabanlar dokümandan gelen kaba gruplardı ve **savaşın en değerli tekniği olan Zırh en
 * ucuz gruptaydı** (100/100). Yeni sıralama üç ölçüden çıkıyor:
 *
 *  1. **Oran** — %6'lık teknikler (Zırh · Tılsım · Taş Ustalığı) yapısal olarak %5'liklerden
 *     değerli: mitigasyon kanalı `net = pay − mit×adet` denklemindeki tek "sıfır kayıp"
 *     kilidini açtığı için kazanç doğrusal değil **eşikli**.
 *  2. **Faz sayısı** — tip-1 birimler savaşta 4, tip-2 birimler 3 faz vuruyor. Bu, tip-1
 *     ölçekleyen **Okçuluk**'u tip-2 ölçekleyen **Demircilik**'ten %33 değerli yapıyor; eski
 *     fiyatlar ikisini de 100/100 diyordu.
 *  3. **Liste genişliği ve çarptığı sayının büyüklüğü** — İçgüdü'nün listesi dar (3 birim) ama
 *     oyunun en büyük statlarını çarpıyor (Kaos `hp` 220.000).
 *
 * ⚠️ **Teknikler binalara göre daha sert yükseldi (×1,7 – ×7).** Sebep asimetri: bina fiyatı 5
 * şehir için 5 kez ödenir, teknik BİR kez ödenir ve beş şehri birden güçlendirir; üstelik teknik
 * seviyesi tavansız. `1,5 < 1,8` oran farkı bu asimetriyi tek başına dengelemiyordu.
 *
 * ⚠️ **Sıra değişti, mutlak fiyat değil.** Her taban yükseldi; değişen şey birbirlerine göre
 * konumları. En büyük çarpan Zırh'ta (×7), en küçüğü Gece Görüş (×1,7) ve Kimya'da (×1,8) —
 * yani ikisi listede **geriye** düştü. Ölçüm sıralaması dokümanın grup mantığından farklı çıktı
 * ve ölçüm kazandı.
 */
export const TECHS: readonly TechDef[] = [
  {
    id: 'archery', name: { tr: 'Okçuluk' }, rate: 0.05, stat: 'atk',
    units: ['elf', 'pegasus', 'archer_tower', 'ballista'],
    baseGold: 450, baseFood: 400,
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
    baseGold: 400, baseFood: 350,
  },
  {
    id: 'chemistry', name: { tr: 'Kimya' }, rate: 0.05, stat: 'atk',
    units: ['mangonel', 'oil_cauldron', 'mangonel_tower'],
    baseGold: 350, baseFood: 300,
  },
  {
    id: 'instinct', name: { tr: 'İçgüdü' }, rate: 0.05, stat: 'atk',
    units: ['dragon', 'ogre', 'chaos'],
    baseGold: 650, baseFood: 550,
  },
  {
    /* ⭐ 2026-07-29: BÜYÜ KALKANI BU LİSTEDEN ÇIKARILDI. Binary'de Büyücülük uygulayıcısı
     * (FUN_004118e8 → FUN_004124cc) yalnız SAVAŞÇI listesini gezip magicHp'yi ölçekler; Sur/Kalkan
     * nesnelerine hiç dokunmaz. Kalkanın magicHp'si zaten 0 → etkisiz. Kalkanı güçlendiren TILSIM. */
    id: 'sorcery', name: { tr: 'Büyücülük' }, rate: 0.05, stat: 'matk',
    units: ['shaman', 'pegasus', 'dragon', 'chaos'],
    baseGold: 600, baseFood: 500,
  },
  {
    /**
     * ⚠️⚠️ **KAOS BU LİSTEDE — "Kaos hariç" ifadesi YANLIŞMIŞ** (2026-08-09).
     *
     * Liste oyunun kendi doküman metninden kurulmuştu: *"Zırh giyen ünitelerin fiziksel defans
     * gücünü %6 arttırır (Kaos hariç tüm savaşçılar)"*. Binary ölçümü metni çürüttü —
     * `Kaos 1200 vs Kaos 1000` savaşında Zırh 20 vermek saldıranın kalanını **635 → 720-722**
     * çıkarıyor; motorda hiç değişmiyordu. Savunana verilince de simetrik biçimde **635 → 602**
     * düşürüyor (§9.6 N2/N5).
     *
     * ⚠️ Bu, projede metin ile ölçümün çeliştiği ilk yer değil ve kural yine aynı: **ölçüm
     * kazanır.** Kaos savaşın `lossMag`inin %90'ını taşıdığı için bu tek satır, gerçek savaştaki
     * sapmanın büyük kısmını üretiyordu.
     */
    id: 'armor', name: { tr: 'Zırh' }, rate: 0.06, stat: 'pmit',
    units: ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre', 'shaman', 'gnome',
      'chaos', 'oil_cauldron', 'guard'],
    baseGold: 700, baseFood: 700,
  },
  {
    // "Savunma ünitelerinin fiziksel savunma gücünü %6 arttırır" (Okçu Kulesi, Mangonel, Balista, Sur)
    id: 'masonry', name: { tr: 'Taş Ustalığı' }, rate: 0.06, stat: 'pmit',
    units: ['archer_tower', 'mangonel_tower', 'ballista', 'wall'],
    baseGold: 550, baseFood: 450,
  },
  {
    /* "Büyü savunma gücünü %5 arttırır" — Mancınık/Kaos/Yük/Casus HARİÇ.
     * ⭐ 2026-07-29: BÜYÜ KALKANI EKLENDİ. Binary'de Tılsım uygulayıcısı (FUN_00411988) savaşçıların
     * mAtk'ini ölçekledikten sonra AYRICA `ordu+0x98` = KALKAN nesnesini alıp FUN_00413744 ile onun
     * mAtk'ini `mAtk × (1 + sv×0,05)` yapar — kalkanın MİTİGASYONU budur. İkizi: Taş Ustalığı →
     * FUN_00411a28 → `ordu+0x10` = SUR (FUN_004136a4, pAtk+pDef). Dokümanın "Büyücülük … Büyü
     * Kalkanı" ifadesi yanıltıcı: Büyücülük büyü VURUŞ gücünü (magicHp) ölçekler, kalkanın 0. */
    /**
     * ⚠️⚠️ **KAOS ve MANCINIK BU LİSTEDE** (2026-08-09). Eski liste yine doküman metnindeki
     * *"Mancınık/Kaos/Yük/Casus HARİÇ"* ifadesine dayanıyordu; ölçüm onu da çürüttü:
     * `Kaos 1200 vs Kaos 1000` + Tılsım 20 → kalan **635 → 740-741** (§9.6 N3).
     * ⚠️ Mancınık için doğrudan bir ayrım ölçümü YOK (P4b motorla tuttu ama Mancınık bu listede
     * olmadığı için o test de "boş"tu); eklenmedi. Ölçülene sadık kalıyoruz.
     */
    /**
     * ⚠️⚠️ **ORAN %5 DEĞİL %6** (2026-08-09, iki bağımsız ölçümle). Doküman metni *"Büyü savunma
     * gücünü %5 arttırır"* diyor ama binary öyle davranmıyor. Tılsım 20 ile:
     *   `Kaos 1200 vs Kaos 1000`       → binary 740-741, motor %5'te 725, **%6'da 740** ✔
     *   `Ejderha 1200 vs Ejderha 1000` → binary 880-881, motor %5'te 859, **%6'da 880** ✔
     * Tek bir oran iki farklı birimi birden tutturuyor — tesadüf değil. Kardeşi Zırh de zaten
     * %6 ve o ölçümde ilk denemede tutmuştu; ikisi aynı aileden.
     */
    id: 'talisman', name: { tr: 'Tılsım' }, rate: 0.06, stat: 'mmit',
    units: ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'ogre', 'gnome', 'shaman',
      'chaos', 'oil_cauldron', 'guard', 'magic_shield'],
    baseGold: 700, baseFood: 600,
  },
  // ── Savaş statlarına doğrudan etkisi olmayan teknikler ───────────────────────
  { id: 'espionage', name: { tr: 'Casusluk' }, rate: 0, stat: null, units: [], baseGold: 300, baseFood: 250 },
  { id: 'cartography', name: { tr: 'Haritacılık' }, rate: 0, stat: null, units: [], baseGold: 250, baseFood: 200 },
  { id: 'colonization', name: { tr: 'Sömürgecilik' }, rate: 0, stat: null, units: [], baseGold: 1200, baseFood: 1000 },
  { id: 'night_vision', name: { tr: 'Gece Görüş' }, rate: 0, stat: null, units: [], baseGold: 500, baseFood: 450 },
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
