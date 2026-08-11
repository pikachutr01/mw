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
     * ⭐⭐⭐ **ŞAMAN 2026-08-12'de EKLENDİ — ve bu, 2026-08-09'da verilmiş YANLIŞ bir kararın
     * geri alınmasıdır.** O gün aynı `FUN_0041279c` okunmuş, Şaman'ın id 7 ile bu grupta olduğu
     * GÖRÜLMÜŞ, ama şu gerekçeyle eklenmemişti:
     *
     *   > *"motorda Şaman `hp` üzerinden hasar vermiyor, dolayısıyla `atk` ölçeklemesi ona hiç
     *   > dokunmaz; gerçek savaşta eklemek kaybı 29.448 → 29.450 yaptı"*
     *
     * ⚠️ **Gerekçedeki hata:** Şaman `hp`si hasar VERMEK için okunmuyor, **EMMEK** için okunuyor.
     * `combat.ts` → `dealType`: `pool -= shamanShield(def, ...)` ve `shamanShield` faz 1-2'de tam
     * olarak `sh.stats.poolHp × adet` çıkarıyor. Yani `atk` ölçeklemesi Şaman'ın **emme gücünü**
     * doğrudan büyütüyor — motordaki tek okuma yeri orası. O günkü sonda da bu yüzden sessiz
     * kaldı: aradığı şey *"Şaman'ın hasar verdiği bir kurulum"*du, oysa aranması gereken
     * *"Şaman'ın emdiği miktarın gelen havuza oranla BÜYÜK olduğu bir kurulum"*.
     *
     * ── Ölçüm (kullanıcının rastgele kurduğu gerçek savaş, 2026-08-12) ───────────────────────
     * Saldıranda **1.200 Şaman**, Demircilik 14 → emme `200 × 1,7 × 1.200 = 408.000`
     * (eskiden 240.000; savunanın faz-1 havuzu ~1,9M, yani fark havuzun **%9'u** ve bu beş tur
     * boyunca birikiyor).
     *
     * | | binary | eski motor | **yeni motor** |
     * |---|---|---|---|
     * | saldıran kaybı | 4.512 | 5.316 (+%17,8) | **4.541 (+%0,6)** |
     * | savunan kaybı | 8.760 | 8.807 (+%0,5) | **8.708 (−%0,6)** |
     * | kahraman XP | 8.404 | 10.695 (+%27,3) | **8.574 (+%2,0)** |
     *
     * ⭐ **Ders:** "denendi, etkisi yok" kaydı, sondanın **yanlış kanalı** araması yüzünden
     * kurulmuş olabilir. Bir eşlemeyi binary'den okuduysan, sonda etkisiz çıktığında önce
     * *"bu stat motorda NEREDE okunuyor"* sorusunu yeniden sor.
     *
     * ⚠️ Dokümanın Demircilik listesi (*"Cüce, Süvari, Ogre, Gnom, Tuzak, Muhafız"*) bu grupta
     * **ikinci kez** yanlış çıkıyor: Ogre 2026-08-09'da çıkarıldı, Şaman şimdi eklendi. Metnin
     * *"yakın vuruş yapan üniteler"* tanımı Şaman'ı dışarıda bırakıyor (Şaman tip 1) ama binary
     * anahtarı tip'e değil **birim indeksine** bakıyor.
     *
     * ⚠️ Casus Kuş (8) ve Yük Arabası (9) de aynı grupta ama `hp`leri 0 → ölçeklenecek bir şey
     * yok. Katalog listesine yazılmadılar; yazılsa `catalogHash` boşuna kayardı.
     */
    id: 'blacksmithing', name: { tr: 'Demircilik' }, rate: 0.05, stat: 'atk',
    units: ['dwarf', 'cavalry', 'gnome', 'shaman', 'trap', 'guard'],
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
    /**
     * ⭐⭐⭐ **SUR'DA ORAN %5** (kullanıcı ölçümü, 2026-08-12) — `docs/SUR_TESTLERI.md` B grubu.
     *
     * Sur'un yıpranması, `1,8^Sv` ve `durum` sadeleştiği için yalnız iki orana bağlı:
     *   `düşüş = 100 × (Alan/mDef) × (havuz/P)/Sv − 100 × (pAtk_ölçekli/mDef)`
     * A grubu (seviye taraması, Taş Ustalığı 0) **8/8 birebir** tuttu → `Alan/mDef` ve
     * `pAtk/mDef` doğru. Geriye tek serbest sayı kaldı: Taş Ustalığı'nın oranı.
     *
     * B grubu onu **doğrudan** ölçtü. Sur sv4 sabit, yalnız Taş Ustalığı değişiyor; Sur%
     * teknikle DOĞRUSAL ve eğim = `100 × pAtk × oran / mDef` = `8,3333 × oran`:
     *
     * | TU | 5 | 10 | 17 | 20 |
     * |---|---|---|---|---|
     * | ölçülen eğim | 0,4170 | 0,4170 | 0,4168 | 0,4167 |
     *
     * Dört bağımsız tahmin, yayılım **0,00025** → `oran = 0,4169 / 8,3333 = `**`0,05003`**.
     * Motorun %6'sı 0,5 eğim veriyordu; oran tam olarak **5/6** kadar fazlaydı.
     *
     * ⚠️ Dokümanın *"fiziksel savunma gücünü **%6** arttırır"* ifadesi Sur için **yanlış** —
     * ve bu, Tılsım'daki durumun aynadaki hâli: orada doküman %5 derken savaşçılarda %6 çıkmıştı.
     * Metnin oran sayıları bu projede güvenilmez; ölçüm kazanıyor.
     *
     * ⚠️⚠️ **KULE/BALİSTA ÖLÇÜLMEDİ — bilerek %6'da bırakıldı.** Ölçüm yalnız Sur'u kapsıyor ve
     * Sur binary'de ayrı bir kod yolundan geçiyor (`gradeStat`, kademeli yapı) — tıpkı Büyü
     * Kalkanı'nın Tılsım'da kendi ölçekleyicisi (`FUN_00413744`, %5) olması gibi. Okçu Kulesi ·
     * Mangonel Kulesi · Balista normal `applyTech` yolundan geçiyor ve onların oranı **hiç
     * ölçülmedi**; ölçülmemiş bir dengeyi kaydırmamak için status quo korundu.
     * Kapatan ölçüm satırı: `docs/SUR_TESTLERI.md` §6.
     */
    id: 'masonry', name: { tr: 'Taş Ustalığı' }, rate: 0.06, stat: 'pmit',
    rateByUnit: { wall: 0.05 },
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
    /**
     * ⭐⭐⭐ **MANCINIK 2026-08-12'de EKLENDİ — binary'de Tılsım'ın SÜZGECİ YOK.**
     *
     * Kullanıcının rastgele kurduğu gerçek savaşta Şaman düzeltmesinden sonra geriye **tek**
     * yapısal aykırı kaldı: her birim ±%1,8 içindeyken Mancınık saldıranda −%8,2, savunanda
     * −%16,4 sapıyordu. Ghidra bunu doğrudan açıkladı — teknik uygulayıcılarının **iki ayrı
     * ailesi** var:
     *
     * ```
     *   atk aileleri (Okçuluk · Demircilik · Kimya · İçgüdü)
     *       FUN_004123fc / FUN_00412464 / …   →  if (FUN_0041279c(birim) == <grup>) { ölçekle }
     *                                             ⇧ GRUP SÜZGECİ VAR
     *   Zırh · Büyücülük · Tılsım
     *       FUN_00412528 / FUN_004124cc / FUN_004125c8  →  if (seviye != 0) { ölçekle }
     *                                                        ⇧ SÜZGEÇ YOK, HERKESE UYGULANIR
     * ```
     *
     * `FUN_00411988` (Tılsım) hem savaşçı listesini (`FUN_004125c8`) hem savunma yapılarını
     * (`FUN_004130c4`) baştan sona geziyor ve ikisinde de birim kontrolü yok.
     *
     * ⭐ **Altı getter'ın altısı da bu turda yerine oturdu** ve her tekniğin dokunduğu stat
     * bağımsızca doğrulandı:
     * `b5c` = +0x00 Can (atk aileleri) · `b9c` = +0x08 BüyüCan (Büyücülük) ·
     * `b7c`+`afc` = +0x10/+0x18 (Zırh, **iki** çift) · `b1c` = +0x20 (Tılsım) ·
     * `b3c` = +0x28 (hiçbir teknik).
     *
     * ⚠️ **Dokümanın birim başına «Etkilendiği Teknikler» listeleri SÜZGEÇ DEĞİL, betimleme.**
     * Mancınık maddesi *"Zırh, Kimya"* diyor ve *"Büyü güçleri yoktur"* — ikincisi doğru ama
     * `magicHp` hakkında (Mancınık büyü havuzuna katkı vermez). Tılsım'ın ölçeklediği stat ise
     * `mAtk` = **faz-3 mitigasyonu** ve Mancınık'ta 240. Klasik ⚠️ *stat adları yanılsaması*.
     * Aynı doküman aynı biçimde iki kez daha yanılmıştı (Zırh'ta *"Kaos hariç"*, Büyücülük'te
     * *"Büyü Kalkanı"*) — ikisi de aynı «süzgeç yok» gerçeğinin belirtisiydi.
     *
     * Ölçüm: Mancınık kalanı saldıranda 159 → **172** (binary 173), savunanda 51 → **61**
     * (binary 61). Savaşın tamamında ortalama sapma %2,18 → **%0,24**.
     *
     * ⚠️ **KAPSAM DIŞI BIRAKILDI (ölçülmedi):** aynı okuma savunma YAPILARININ tamamına da
     * Tılsım verilmesini gerektiriyor (`archer_tower` · `trap` · `mangonel_tower` · `ballista`);
     * listede yalnız `oil_cauldron` ve `guard` var. Bu savaşta savunma yapısı YOKTU, yani
     * ölçülmedi ve savunma dengesini kör bir okumayla değiştirmek istemedim.
     * Ayrılmış ölçüm seti: `docs/TILSIM_SUZGEC_TESTLERI.md`.
     * ⚠️ Casus Kuş ve Yük Arabası da süzgeçsiz kapsamda ama `NO_ROUND_LOSS` oldukları için
     * `mAtk`leri hiç okunmuyor → ölçülemez, listeye yazılmadı (özet boşuna kaymasın).
     */
    id: 'talisman', name: { tr: 'Tılsım' }, rate: 0.06, stat: 'mmit',
    units: ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre', 'gnome',
      'shaman', 'chaos', 'oil_cauldron', 'guard', 'magic_shield'],
    /**
     * ⚠️⚠️ **KALKAN %5, SAVAŞÇILAR %6** (kullanıcı ölçümü, 2026-08-11).
     *
     * 2026-08-09'da oran Kaos ve Ejderha ölçümleriyle %5 → %6 yapıldı ve bu doğruydu — ama
     * `magic_shield` aynı listede olduğu için **sessizce** o da %6'ya çıktı. Oysa kalkanın
     * ölçekleyicisi **ayrı bir fonksiyon**: savaşçılar `FUN_00411988`, kalkan `FUN_00413744`
     * ve Ghidra'da okunan sabiti **0,05**.
     *
     * Ölçüm bunu yakaladı (`docs/SAMAN_KALKAN_TESTLERI.md` D2): 50 Ejderha vs 60 Ejderha +
     * Kalkan sv3, savunan Tılsım 6 → binary **%87,6-88,6**, motor **%100,0**. %6'da çarpan
     * 1,36 olup net hasarı tamamen sıfırlıyordu; %5'te 1,30 ve kalkan bir miktar yıpranıyor.
     *
     * ⭐ Neden yalnız bu satır yakaladı: kalkanın mitigasyonu `Sv × 1,8^Sv` ile büyürken gücü
     * yalnız `1,8^Sv` ile büyüyor, yani net hasarın işaret değiştirdiği bir **uçurum** var.
     * D2 tam o uçurumun üstünde; diğer 19 senaryo bu parametreye duyarsız.
     */
    rateByUnit: { magic_shield: 0.05 },
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
