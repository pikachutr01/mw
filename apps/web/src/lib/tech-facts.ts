/**
 * ⭐ TEKNİK BİLGİ KUTUSUNUN **TÜRETİLMİŞ** KISMI — kaynağı savaş motorunun kendi kataloğu.
 *
 * Kullanıcı isteği (2026-08-11): Akademi'deki tekniklere de Baraka'daki gibi bilgi kutusu;
 * *"Buradaki değerlerin yerine gerçek motorda ölçülen değerleri dinamik olarak alsın."*
 * `lib/unit-facts.ts`in ikizi: metin `info-texts.ts`te, sayı ve liste burada.
 *
 * ⚠️⚠️ **Referans dokümanın oranları YANLIŞ, motorunki doğru.** `tekniklere_ve_yapilara_iliskin_
 * on_bilgiler.txt` şöyle diyor ve iki yerde ölçümle çürütüldü (`techs.ts`):
 *   • *"Tılsım … %5"* → savaşçılarda gerçekte **%6** (Kaos ve Ejderha ölçümleri bağımsız
 *     olarak tutturuyor). ⚠️ **Büyü Kalkanı'nda ise gerçekten %5** — binary'de ayrı bir
 *     ölçekleyici var (2026-08-11 ölçümü). Kutu bu istisnayı `rateByUnit`ten türetip yazıyor.
 *   • *"Zırh … Kaos hariç"*, *"Tılsım … Mancınık hariç tüm üniteler"* → gerçek liste farklı.
 * Oranı ve listeyi elle yazsaydık kutu bu yanlışları oyuncuya öğretmeye devam ederdi.
 *
 * ⚠️⚠️ **PANELDEN AYARLANABİLEN SABİT BURADA KULLANILMAZ.** `combat.nightBase` ve `spy.*`
 * yönetici panelinden değiştirilebiliyor ama şehir yükünde istemciye GELMİYOR. Varsayılandan
 * okusaydık yönetici sayıyı değiştirdiği an kutu yalan söylerdi (ekranın kendi kuralı:
 * *"oranlar panelden ayarlanabiliyor, ikinci bir hesap yeri açmak ekranın yanılması demek"*).
 * Çözüm: o iki teknikte yalnız **yapısal** (ayarlanamayan) büyüklükler gösteriliyor —
 * gerekçesi `nightGapClosed` ve `spyTierLabels` başlıklarında.
 */
import {
  MAX_CITIES, SPY_LEVELS, TECHS_BY_ID, UNITS_BY_ID, maxCities, type SpyLevel,
} from '@mobilwar/catalog';
import {
  DEFAULT_MAP_CONFIG, nightMultiplier, type CombatConfig, type MapConfig,
} from '@mobilwar/engine';

/** Teknik hangi büyüklüğü ölçekliyor — motordaki `stat` kodunun oyuncu diline çevrisi. */
const STAT_EFFECT: Readonly<Record<string, string>> = {
  atk: 'vuruş gücünü',
  matk: 'büyü vuruş gücünü',
  pmit: 'fiziksel korumasını',
  mmit: 'büyü korumasını',
};

/** `0.06` → `"%6"`; motorun oranı ondalıklıysa (`0.055`) virgüllü yazılır. */
function pct(rate: number): string {
  const v = rate * 100;
  return `%${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}`;
}

/**
 * ⭐ «Etkisi» satırı — oran ve ölçeklenen büyüklük **katalogtan**.
 *
 * Savaş statına dokunmayan teknikler (`stat: null`) burada `null` döner; onların etkisi
 * `techNotes()` içinde, kendi mekaniklerinden türetiliyor.
 */
export function techEffectLine(techId: string): string | null {
  const def = TECHS_BY_ID[techId];
  if (!def?.stat) return null;
  const what = STAT_EFFECT[def.stat];
  if (!what) return null;
  const base = `Her seviye, etkilediği birimlerin ${what} ${pct(def.rate)} artırır.`;

  /**
   * ⭐ **BİRİME ÖZEL ORAN İSTİSNASI** (2026-08-11). Tılsım savaşçılarda %6 ama **Büyü
   * Kalkanı'nda %5** — binary'de iki ayrı ölçekleyici var (`FUN_00411988` ↔ `FUN_00413744`)
   * ve bu, kullanıcının binary ölçümüyle doğrulandı (`docs/SAMAN_KALKAN_TESTLERI.md` D2).
   *
   * ⚠️ İstisna **yazılmak zorunda**: kutu tek bir oran gösterip Kalkan'ı da o listeye koyunca
   * oyuncuya yanlış öğretiyor — üstelik Kalkan pahalı bir yapı, oyuncu %6 sanıp yatırım
   * kararını ona göre veriyor. Metin elle değil `rateByUnit`ten türetiliyor ki yeni bir
   * istisna eklendiğinde kutu kendiliğinden doğrulansın.
   */
  const overrides = Object.entries(def.rateByUnit ?? {});
  if (overrides.length === 0) return base;
  const parts = overrides.map(([id, r]) => `${UNITS_BY_ID[id]?.name.tr ?? id} ${pct(r)}`);
  return `${base} İstisna: ${parts.join(' · ')}.`;
}

/**
 * Tekniğin ölçeklediği birimlerin **Türkçe adları**, katalogdaki sırayla.
 *
 * ⚠️ Sıra `TECHS_BY_ID[id].units` dizisinin kendi sırası — o dizi savaş motorunun okuduğu
 * listenin ta kendisi ve yeniden sıralamak `catalogHash`i kaydırmadan da olsa iki ekranda
 * farklı görünmesine yol açardı.
 */
export function techUnitNames(techId: string): string[] {
  return (TECHS_BY_ID[techId]?.units ?? []).map((u) => UNITS_BY_ID[u]?.name.tr ?? u);
}

/* ── Savaş dışı tekniklerin gerçek etkileri ─────────────────────────────────── */

/**
 * ⭐ GECE GÖRÜŞ — **kaybın yüzde kaçının kapandığı**, seviyeye göre.
 *
 * ⚠️⚠️ Neden mutlak çarpan değil de "kapanan pay": mutlak değer `combat.nightBase`e bağlı ve o
 * sayı panelden ayarlanabiliyor, istemciye de gelmiyor. Kapanan pay ise **taban ne olursa olsun
 * aynı**, çünkü motordaki formül `m(L) = f(L)·(1−taban) + taban` ve
 * `(m(L) − m(0)) / (1 − m(0)) = f(L)` — taban sadeleşiyor.
 *
 * ⚠️ `f(L)`yi elle yazmıyoruz (`1 − 3/(L+3)`); `nightMultiplier`ı iki kez çağırıp oranı
 * çıkarıyoruz. Böylece motor eğriyi değiştirirse kutu kendiliğinden düzelir.
 *
 * ⚠️ `cfg` parametresi **testin sırf kendisi için** var değil: taban sadeleşmesi bir iddia ve
 * ancak iki farklı tabanla koşularak ispatlanabiliyor (`tech-facts.test.ts`). Bir gün savaş
 * config'i istemciye gelirse fonksiyon zaten hazır.
 */
export function nightGapClosed(level: number, cfg?: CombatConfig): number {
  const floor = nightMultiplier(0, cfg);
  if (floor >= 1) return 1;             // gece cezası kapalıysa "kayıp" da yok
  return (nightMultiplier(level, cfg) - floor) / (1 - floor);
}

/**
 * ⭐ HARİTACILIK — yol süresinin kaçta kaçına indiği.
 *
 * Motorda `yol = k · mesafe^p / (1 + adım·seviye)` (`travel.ts`). Yalnız **yol** terimi bölünüyor;
 * seferin sabit hazırlık süresi ve kıta/diyar geçiş süreleri etkilenmiyor — kutu bunu yazıyor.
 *
 * ⚠️ `adım` **sunucudan gelen harita config'inden** okunuyor (`city.map`), varsayılandan değil:
 * panelden ayarlanabiliyor ve Dünya ekranındaki süre önizlemesi de aynı sayıyı kullanıyor.
 */
export function roadTimeFactor(level: number, map?: MapConfig): number {
  const step = map?.cartographyStep ?? DEFAULT_MAP_CONFIG.cartographyStep;
  return 1 / (1 + step * Math.max(0, level));
}

/** ⭐ SÖMÜRGECİLİK — hangi seviyede kaç şehir. Kural katalogda (`maxCities`), tavan `MAX_CITIES`. */
export function colonizationSteps(): { level: number; cities: number }[] {
  const out: { level: number; cities: number }[] = [];
  let previous = maxCities(0);
  for (let level = 1; level <= 60 && previous < MAX_CITIES; level++) {
    const cities = maxCities(level);
    if (cities > previous) { out.push({ level, cities }); previous = cities; }
  }
  return out;
}

/**
 * ⭐ CASUSLUK — bilgi kademeleri, motorun kendi listesinden (`SPY_LEVELS`).
 *
 * ⚠️ Kademelerin **sayısı ve sırası yapısaldır**, panelden ayarlanamaz — o yüzden burada
 * gösterilebiliyor. Kuş bonusunun tavanı (`spy.birdBonusCap`) ise ayarlanabilir ve istemciye
 * gelmiyor; kutu onu **sayı vermeden** anlatıyor.
 *
 * ⚠️ Etiketler elle yazılı çünkü `SPY_LEVELS` yalnız kimlik taşıyor (`'armyTypes'`), oyuncuya
 * gösterilecek metin taşımıyor. Eksik bir kimlik gelirse `?? id` ile ham kimliğe düşer ve
 * `tech-facts.test.ts` bunu yakalar.
 */
const SPY_TIER_TEXT: Readonly<Record<SpyLevel, string>> = {
  resources: 'Altın ve yemek',
  economy: '+ Maden ve Çiftlik seviyesi',
  armyTotals: '+ Toplam savaşçı ve savunma sayısı',
  armyTypes: '+ Hangi birimlerden var',
  armyCounts: '+ Her birimin tek tek sayısı',
  full: '+ Teknikler, Kale, Sur ve Büyü Kalkanı',
};

export function spyTierLabels(): { gap: string; text: string }[] {
  /**
   * Eşikler `spyLevelFor`un kuralından: `fark < 0` → ilk kademe, sonrası sırayla 0, 1, 2 …
   * ve son kademe "ve üzeri". Yani i. kademenin eşiği `i − 1`.
   */
  const last = SPY_LEVELS.length - 1;
  return SPY_LEVELS.map((id, i) => ({
    gap: i === 0 ? 'Geride' : i === 1 ? 'Eşit' : i === last ? `+${i - 1} ve üzeri` : `+${i - 1}`,
    text: SPY_TIER_TEXT[id] ?? id,
  }));
}
