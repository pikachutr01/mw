/**
 * ⭐ SAVAŞ RAPORU (SİSTEM PLANI Faz 2 çıkışı: "rapor ekranı verisi")
 *
 * Rapor `battles.result`'tan **türetilir**, ayrıca saklanmaz: motor çıktısı zaten tam kayıttır,
 * ikinci bir kopya tutmak onu bayatlatırdı.
 *
 * ⚠️ **Animasyon YOK** (kullanıcı kararı) — savaş bir metin dökümüdür.
 *
 * İki katmanlı çıktı (§13.14 adlandırma kuralı gereği):
 *   `sections` → yapısal veri (birim `id`'leri + sayılar) — istemci kendi diliyle çizer
 *   `text`     → hazır Türkçe döküm — bildirim/e-posta/hızlı görüntüleme için
 *
 * ⭐ **Görünürlük raporda da işler:** saldıran ve savunan AYNI savaşın farklı yüzünü görür.
 * Bölümler okuyanın perspektifine çevrilir (`myArmy` / `enemyArmy`); savunana özel veriler
 * (`result.defenderPrivate` — mağara kaçış dökümü) controller'da saldırandan silinir ve
 * burada da yalnız `side === 'defender'` iken okunur (§13.10.1).
 *
 * ⭐ GERİYE UYUM: 2026-07-30 zenginleştirmesinden (kahraman kimlikleri, sur seviyesi,
 * koordinatlar, mağara dökümü) ÖNCEKİ savaş satırlarında yeni alanlar YOKTUR — hepsi
 * opsiyoneldir ve yoksa rapor eski davranışına düşer (ör. "N kahraman düştü" notu).
 */
import { LEVEL_BASED, UNITS_BY_ID } from '@mobilwar/catalog';

export type ReportSide = 'attacker' | 'defender';

export interface ReportLine {
  /** Katalog `id`'si — ikon yolu ve i18n anahtarı bundan üretilir. */
  id: string;
  name: string;
  before: number;
  after: number;
  lost: number;
  /** Savunma tabanının geri getirdiği adet (§13.11.10) — yalnız savunanda. */
  restoredByFloor?: number;
}

export interface ReportSection {
  key: string;
  title: string;
  lines: ReportLine[];
}

export interface ReportHeroLine {
  name: string;
  /** Savaşa girdiği seviye. */
  level: number;
  /**
   * ⭐ Savaştan sağ çıktı mı? `false` ise etiket **«Yok Edildi»** (kullanıcı kararı 2026-08-01:
   * tek etiket). Kahraman artık her hâlükârda eve dönüyor ve orada diriltilebiliyor; eski
   * `destroyed` bayrağı (diriltilemez yok olma) tarihe karıştı.
   */
  alive: boolean;
  /** Bu savaştan kazandığı tecrübe — yalnız KENDİ kahramanlarında dolu, rakipte 0. */
  xpGained: number;
}

/** Rapordaki bir şehir: koordinat + O ANKİ ad. `name` bu alandan önceki savaşlarda yok. */
export interface ReportCoord { k: number; d: number; s: number; name?: string }

export interface BattleReport {
  battleId: number;
  side: ReportSide;
  winner: 'attacker' | 'defender' | 'draw';
  /** Bu raporu okuyan oyuncu kazandı mı? */
  won: boolean;
  turns: number;
  night: boolean;
  at: string;
  /**
   * Kaynak (saldıranın şehri) → Hedef (savunanın şehri). Eski kayıtlarda şehir silindiyse null.
   * `name` savaş ANINDAKİ ad (2026-08-04); şehir sonradan yeniden adlandırılsa bile rapor
   * anlattığı olaya sadık kalır. Bu alandan önceki savaşlarda `undefined`.
   */
  coords: {
    origin: ReportCoord | null;
    target: ReportCoord | null;
  } | null;
  sections: ReportSection[];
  /** Kahramanlar okuyanın perspektifinde; `captured` = savaştan çıkan YENİ kahraman. */
  heroes: {
    mine: ReportHeroLine[];
    enemy: ReportHeroLine[];
    captured: { name: string; mine: boolean } | null;
  };
  /** Sur bilgisi — savunanda sur hiç yoksa null. */
  wall: { level: number | null; integrity: number | null; destroyed: boolean } | null;
  /** Mağara sonucu; `escaped` YALNIZ savunanda dolar (içerik saldırana ASLA gitmez). */
  cave: {
    present: boolean;
    broken: boolean;
    required: number;
    survivingDwarves: number;
    reason: string | null;
    escaped: Record<string, number> | null;
    repairUntil: string | null;
  } | null;
  loot: { gold: number; food: number } | null;
  /**
   * Yalnız saldıran.
   *   `revealed` — savaşta ORTAYA ÇIKAN enkaz (ölen birimlerin bıraktığı). Savaşın sonucundan
   *     BAĞIMSIZ: saldıran kaybetse de enkaz oluşur, yalnız tamamı savunanın şehrine gider.
   *   `carried`  — fiilen eve taşınan yük. Saldıran kaybettiyse **null** (taşınacak şey yok).
   */
  lootBreakdown: {
    revealed: { gold: number; food: number };
    carried: { gold: number; food: number } | null;
    /**
     * ⭐ Oranca alınabilecekken TAŞIMA KAPASİTESİNE sığmayıp şehirde kalan kısım.
     * `null` = kapasite yetti, geride bir şey kalmadı → satır hiç çizilmez.
     */
    leftBehind: { gold: number; food: number } | null;
    /** Hayatta kalan ordunun toplam taşıma kapasitesi — "neden yetmedi" sorusunun ölçüsü. */
    capacity: number | null;
  } | null;
  notes: string[];
  text: string;
}

interface SideResultShape {
  alive: number;
  lost: number;
  counts: Record<string, number>;
  floorRestored: Record<string, number>;
  heroes: { level: number; durum: number; alive: boolean }[];
  wallIntegrity: number | null;
}

interface RawHeroLine {
  id: number;
  name: string;
  level: number;
  alive: boolean;
  /** ⚠️ EMEKLİ — yalnız 2026-08-01 öncesi satırlarda var; okunmuyor (`alive` yeterli). */
  destroyed?: boolean;
  xpGained: number;
}

interface BattleResultShape {
  winner: 'attacker' | 'defender' | 'draw';
  turns: number;
  attacker: SideResultShape;
  defender: SideResultShape;
  debris: { gold: number; food: number };
  loot?: {
    taken: { gold: number; food: number };
    fromDebris: { gold: number; food: number };
    fromPlunder: { gold: number; food: number };
    leftoverDebrisToDefender: { gold: number; food: number };
    /** ⚠️ Eski savaşlarda YOK (motor sonradan ekledi) → okuyucu `?.` ile korunmalı. */
    plunderNotCarried?: { gold: number; food: number };
    effectivePlunderRate?: number;
    effectiveRates?: { gold: number; food: number };
  };
  /** Hayatta kalan saldıran ordunun taşıma kapasitesi. Eski savaşlarda YOK. */
  attackerCarryCapacity?: number;
  /** ⭐ Sur tam yıkılınca iptal edilen savunma üretimi + iadesi (2026-07-30). Eski savaşlarda YOK. */
  wallProduction?: {
    canceled: { type: string; left: number }[];
    refunded: { gold: number; food: number };
  };
  /** ⭐ Mağara sonucu (§13.20.3). Eski savaşlarda YOK → alan opsiyonel. */
  cave?: {
    present: boolean;
    broken: boolean;
    level: number;
    required: number;
    survivingDwarves: number;
    reason: string | null;
  };
  /** ⭐ 2026-07-30 zenginleştirmesi — eski savaşlarda YOK. */
  heroesDetail?: {
    attacker: RawHeroLine[];
    defender: RawHeroLine[];
    captured: { name: string; side: ReportSide } | null;
  };
  wall?: { level: number; destroyed: boolean };
  coords?: {
    origin: ReportCoord | null;
    target: ReportCoord | null;
  };
  /** Savunana ÖZEL blok — controller saldıran tarafta anahtarı komple siler. */
  defenderPrivate?: {
    cave?: { escaped: Record<string, number>; repairUntil: string | null };
  };
}

export interface BattleRow {
  id: number;
  at: Date;
  night: boolean;
  winner: string;
  input: { attacker: { counts: Record<string, number> }; defender: { counts: Record<string, number> } };
  result: BattleResultShape;
  /** Eski kayıtlar için koordinat yedeği (controller'ın cities JOIN'i). */
  fallbackCoords?: BattleReport['coords'];
}

const nameOf = (id: string): string => UNITS_BY_ID[id]?.name.tr ?? id;
const tr = (n: number): string => Math.round(n).toLocaleString('tr-TR');

/** Savaş öncesi/sonrası adetleri satırlara çevirir. Hiç değişmemiş satır da gösterilir (şeffaflık). */
function linesFor(
  before: Record<string, number>,
  after: Record<string, number>,
  floorRestored: Record<string, number>,
  kind: 'warrior' | 'defense',
): ReportLine[] {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((id) => UNITS_BY_ID[id]?.kind === kind && !LEVEL_BASED.has(id));

  const lines: ReportLine[] = [];
  for (const id of ids) {
    const b = Math.max(0, Math.trunc(before[id] ?? 0));
    const a = Math.max(0, Math.trunc(after[id] ?? 0));
    if (b === 0 && a === 0) continue;
    const line: ReportLine = { id, name: nameOf(id), before: b, after: a, lost: Math.max(0, b - a) };
    const restored = floorRestored[id] ?? 0;
    if (restored > 0) line.restoredByFloor = restored;
    lines.push(line);
  }
  // En çok kaybedilen üstte — oyuncu önce "neyi kaybettim" sorusunun cevabını görür.
  return lines.sort((x, y) => y.lost - x.lost || x.id.localeCompare(y.id));
}

const toHeroLine = (h: RawHeroLine, mine: boolean): ReportHeroLine => ({
  name: h.name,
  level: h.level,
  alive: h.alive,
  // Rakibin ne kadar XP kazandığı KENDİ bilgisidir — sızdırılmaz.
  xpGained: mine ? h.xpGained : 0,
});

/**
 * ⭐⭐ «ORTAYA ÇIKAN GANİMET» — bu savaşın ÜRETTİĞİ toplam ganimet.
 *
 * ⚠️⚠️ **Bu tanım üçüncü denemede oturdu; ikisi de oyuncu tarafından bildirildi.**
 *
 *  1. En baştaki: `fromDebris + fromPlunder`. O toplam TANIMI GEREĞİ `taken`e eşit
 *     (`engine/loot.ts`: `fromPlunder = taken − fromDebris`) → «Ortaya çıkan» ile «Taşınan»
 *     her zaman aynı sayıyı gösteriyordu, iki satır hiçbir bilgi taşımıyordu.
 *
 *  2. İkinci deneme: yalnız `debris` (ölen birimlerin bıraktığı). Kaybedilen savaşta doğruydu
 *     ama **hiç ölü olmayan savaşta 0 çıkıyordu.** Oyuncu bunu bildirdi (yerel savaş #24,
 *     tohum 3839748965): savunanda yalnız 1000 casus kuş vardı, kimse ölmedi, `debris = 0`,
 *     ama şehirde ~1M altın duruyor ve 387.528 altın **alınabilir** durumdaydı. Rapor
 *     *"ortaya çıkan: 0"* diyordu — oyuncunun sorduğu soru tam olarak buydu.
 *
 *  3. Şimdiki: **alınabilir olan + savunanda kalan enkaz.** Tek formül, dallanma yok:
 *       `taken + plunderNotCarried + leftoverDebrisToDefender`
 *     • Kazanılan savaşta: yağma oranının açtığı havuzun tamamı (taşınan + taşınamayan) —
 *       oyuncunun beklediği sayı. Aradaki farkı «Taşıma kapasiten yetmedi» satırı açıklıyor.
 *     • Kaybedilen savaşta: motor `taken`/`plunderNotCarried`ı sıfırlayıp enkazın tamamını
 *       `leftoverDebrisToDefender`a yazar → sonuç **enkazın kendisi**, yani 2. denemenin
 *       doğru olduğu durum aynen korunuyor.
 *   Böylece «Taşınan ≤ Ortaya çıkan» her savaşta doğru, sezgiyle uyumlu bir ilişki.
 *
 * ⚠️ ESKİ SAVAŞLARDA `plunderNotCarried` YOK (motor sonradan ekledi). O satırlarda eski
 * anlama (`debris`) düşülüyor: uydurma bir sayı göstermektense bilinen doğruyu göstermek.
 */
function revealedLoot(r: BattleRow['result']): { gold: number; food: number } {
  const l = r.loot;
  if (!l?.plunderNotCarried) return r.debris ?? { gold: 0, food: 0 };
  return {
    gold: l.taken.gold + l.plunderNotCarried.gold + l.leftoverDebrisToDefender.gold,
    food: l.taken.food + l.plunderNotCarried.food + l.leftoverDebrisToDefender.food,
  };
}

export function buildBattleReport(battle: BattleRow, side: ReportSide): BattleReport {
  const r = battle.result;
  const won = r.winner === side;
  const enemySide: ReportSide = side === 'attacker' ? 'defender' : 'attacker';

  const attackerLines = linesFor(battle.input.attacker.counts, r.attacker.counts, {}, 'warrior');
  const defenderUnitLines = linesFor(
    battle.input.defender.counts, r.defender.counts, r.defender.floorRestored, 'warrior',
  );
  const defenderStructLines = linesFor(
    battle.input.defender.counts, r.defender.counts, r.defender.floorRestored, 'defense',
  );

  // ⭐ Bölümler OKUYANIN perspektifinde: önce kendi ordun, sonra rakibinki.
  const myLines = side === 'attacker' ? attackerLines : defenderUnitLines;
  const enemyLines = side === 'attacker' ? defenderUnitLines : attackerLines;
  const sections: ReportSection[] = [
    { key: 'myArmy', title: 'Ordun', lines: myLines },
    { key: 'enemyArmy', title: 'Rakip ordu', lines: enemyLines },
    { key: 'defenderStructs', title: 'Savunma birimleri', lines: defenderStructLines },
  ].filter((s) => s.lines.length > 0);

  // ── Kahramanlar (zenginleştirilmiş kayıtlarda) ─────────────────────────────
  const hd = r.heroesDetail;
  const heroes: BattleReport['heroes'] = {
    mine: (hd?.[side] ?? []).map((h) => toHeroLine(h, true)),
    enemy: (hd?.[enemySide] ?? []).map((h) => toHeroLine(h, false)),
    captured: hd?.captured ? { name: hd.captured.name, mine: hd.captured.side === side } : null,
  };

  // ── Sur ────────────────────────────────────────────────────────────────────
  const wallLevel = r.wall?.level
    ?? Math.max(0, Math.trunc(battle.input.defender.counts['wall'] ?? 0));
  const integrity = r.defender.wallIntegrity;
  const wall: BattleReport['wall'] = wallLevel > 0
    ? {
      level: wallLevel,
      // ⚠️ Oran YALNIZ savunana. Ekran bu alanı doğrudan basıyor; `null` bırakmak, «göstermeyi
      // unutma» sorumluluğunu istemciden alıp tek yerde çözüyor (bkz. aşağıdaki sur notu).
      integrity: side === 'defender' ? integrity : null,
      destroyed: r.wall?.destroyed ?? (integrity != null && integrity <= 0),
    }
    : null;

  /**
   * ⚠️ **GECE NOTU KALDIRILDI** (kullanıcı, 2026-08-05): *"Savaş raporunda açık açık gece
   * savaşı bilgileri yazmasın… Sadece kazanan veya kaybeden yazısının yanında ay simgesi
   * olması yeterli."* Eskiden burada *"Savaş GECE gerçekleşti — vuruş gücü düştü (Gece
   * Görüşü etkili)"* satırı vardı.
   *
   * ⚠️ `night` alanı raporda DURUYOR — kaldırılan yalnız cümle. Alan, ekranın ay simgesini
   * çizmesi için gerekli; ayrıca savaşın determinizm künyesinin bir parçası.
   */
  const notes: string[] = [];

  // ⭐ Savunma tabanı (§13.11.10): "en kötü ihtimalle 4'lük garnizon ayakta kalır" kuralının
  //    gerçekten işlediği raporda GÖRÜNÜR olmalı — yoksa oyuncu sayıları hata sanır.
  const restored = Object.entries(r.defender.floorRestored ?? {}).filter(([, n]) => n > 0);
  if (restored.length > 0) {
    notes.push(
      `Savunma tabanı devreye girdi: ${restored.map(([id, n]) => `${nameOf(id)} ${n}`).join(', ')} korundu.`,
    );
  }

  /**
   * ⭐ SUR HASARI — **saldıran ORANI görmez** (kullanıcı, 2026-08-08).
   *
   * ⚠️ Bütünlük yüzdesi savunma gücünün doğrudan ölçüsü: bir sonraki saldırının ne kadar
   * kolay olacağını söylüyor. Saldırganın bunu bedavaya öğrenmesi, arka arkaya vurup surun
   * ne zaman düşeceğini hesaplamasını sağlardı — casusluğun işini savaş raporu yapmış olurdu.
   * Saldırana yalnız **hasar var/yok** bilgisi gidiyor; savunan kendi surunun tam durumunu
   * görmeye devam ediyor. (Aynı ayrım `wallProduction` notunda da uygulanıyor.)
   */
  if (integrity != null && integrity < 1 && wallLevel > 0) {
    if (integrity <= 0) {
      notes.push(side === 'defender'
        ? 'SUR TAMAMEN YIKILDI — onarımı bitene kadar savunma birimi üretilemez.'
        : 'Rakibin suru TAMAMEN YIKILDI.');
    } else {
      notes.push(side === 'defender'
        ? `Sur bütünlüğü %${Math.round(integrity * 100)}'e düştü.`
        : 'Rakibin suru hasar gördü.');
    }
  }

  /**
   * ⭐ İptal edilen savunma üretimi + iade YALNIZ SAVUNANA görünür (kullanıcı kararı,
   * 2026-07-30): rakibin ne üretmekte olduğu casusluk gerektiren bir bilgidir, savaş raporu
   * onu bedava vermemeli.
   */
  if (side === 'defender' && r.wallProduction && r.wallProduction.canceled.length > 0) {
    const kalemler = r.wallProduction.canceled
      .map((c) => `${nameOf(c.type)} ×${c.left}`).join(', ');
    const iade = r.wallProduction.refunded;
    notes.push(
      `Sur yıkıldığı için savunma üretimi iptal edildi: ${kalemler}. `
      + `İade (her emirde 1 ünite eksik): ${tr(iade.gold)} altın, ${tr(iade.food)} yemek.`,
    );
  }

  // Kahraman notu yalnız ESKİ kayıtlarda (heroesDetail yoksa) — yenilerde kartlar konuşur.
  if (!hd) {
    const heroesDead = (side === 'attacker' ? r.attacker : r.defender).heroes.filter((h) => !h.alive);
    if (heroesDead.length > 0) {
      notes.push(`${heroesDead.length} kahraman düştü — Tapınak'ta diriltme sürecine girdi.`);
    }
  }
  if (heroes.captured?.mine) {
    notes.push(`Savaştan yeni bir kahraman çıktı: ${heroes.captured.name}!`);
  }

  /**
   * Ganimet: saldıran ne ALDIĞINI, savunan ne KAYBETTİĞİNİ görür.
   *
   * ⚠️⚠️ **İKİ HATA BURADAYDI (2026-08-08, oyuncu bildirimi + canlı veriyle doğrulandı).**
   *
   * 1. `revealed` = `fromDebris + fromPlunder` yazıyordu. Ama `fromPlunder`ın TANIMI
   *    `taken − fromDebris` (bkz. `engine/loot.ts`) — yani toplamları **her zaman `taken`e
   *    eşit**. «Ortaya çıkan» ile «Taşınan» satırları kazanılan savaşta da birbirinin
   *    kopyasıydı; iki satır hiçbir bilgi taşımıyordu.
   *
   * 2. Saldıran KAYBEDİNCE motor `taken/fromDebris/fromPlunder`ı sıfırlayıp enkazın tamamını
   *    `leftoverDebrisToDefender`a yazıyor. Yani `revealed` **sıfır** çıkıyordu ve rapor
   *    *"hiç ganimet oluşmadı"* diyordu — oysa oluşmuştu. Canlı örnek (savaş #5, tohum
   *    731518373): `debris = 84.495 altın / 82.995 yemek`, tamamı savunanın şehrine eklendi
   *    (`battle.handlers.ts`), ama saldıranın raporunda **0** yazıyordu. Oyuncu bunu
   *    *"savunana ganimet eklenmemiş"* diye bildirdi; veri doğruydu, RAPOR yalan söylüyordu.
   *
   * Düzeltme: «ortaya çıkan» artık motorun ürettiği **enkazın kendisi** (`result.debris`) —
   * ölen askerlerin bıraktığı şey. Tanımı sonuçtan bağımsız, dolayısıyla kaybedilen savaşta da
   * doğru. «Taşınan» yalnız gerçekten eve dönen yük; yoksa satır hiç yazılmıyor.
   */

  let loot: { gold: number; food: number } | null = null;
  let lootBreakdown: BattleReport['lootBreakdown'] = null;
  if (r.loot) {
    const won = r.winner === 'attacker';
    // ⭐ Kaybeden saldıranda «Ganimet» satırı YOK: taşıdığı bir şey olmadığı için «0 altın,
    //   0 yemek» yazmak bilgi değil gürültü (kullanıcı, 2026-08-08).
    loot = side === 'attacker'
      ? (won ? r.loot.taken : null)
      : r.loot.fromPlunder;
    if (side === 'attacker') {
      /**
       * ⭐⭐ ÜÇÜNCÜ EKSİK (2026-08-08, oyuncu bildirimi): rapor *"neden bu kadar az ganimet
       * çıktı"* sorusunu cevaplayamıyordu.
       *
       * Canlı örnek (savaş #14, tohum 3295440785): şehirde ~1,5M altın ve ~1,5M yemek vardı,
       * yağma oranı %34,6 (%40 × 0,866 şans) → **521 bin altın + 521 bin yemek** alınabilirdi.
       * Ama ordunun taşıma kapasitesi 159.728'di ve tam o kadar taşındı; kalan 441 bin + 441
       * bin şehirde kaldı. Veri doğruydu (`plunderNotCarried`), rapor bundan hiç söz etmiyordu:
       * oyuncu 79.862'yi görüp *"ganimet neden bu kadar az"* diye sordu. Doğru cevap "az
       * çıkmadı, **taşıyamadın**" — ve bunu raporun kendisi söylemeli.
       */
      const left = won ? (r.loot.plunderNotCarried ?? null) : null;
      const kapasiteAsildi = left != null && (left.gold > 0 || left.food > 0);
      lootBreakdown = {
        revealed: revealedLoot(r),
        carried: won ? r.loot.taken : null,
        leftBehind: kapasiteAsildi ? left : null,
        capacity: kapasiteAsildi ? (r.attackerCarryCapacity ?? null) : null,
      };
    }
    if (side === 'defender' && (r.loot.leftoverDebrisToDefender.gold > 0 || r.loot.leftoverDebrisToDefender.food > 0)) {
      notes.push(
        `Taşınamayan enkaz şehrinde kaldı: ${tr(r.loot.leftoverDebrisToDefender.gold)} altın, `
        + `${tr(r.loot.leftoverDebrisToDefender.food)} yemek.`,
      );
    }
  }

  if (side === 'attacker' && r.attacker.alive <= 0) {
    notes.push('Ordudan kimse dönmedi.');
  }

  /**
   * ⭐ MAĞARA (§13.20.3) — **iki tarafa da** bildirilir (kullanıcı isteği 2026-07-28).
   *
   * Ama aynı içerik değil: savunan kendi mağarasının tam dökümünü (kaçanlar + onarım bitişi)
   * görür; saldıran yalnız SONUCU ve **kaç cüceyle gelmesi gerektiğini** öğrenir. Mağaranın
   * İÇİ (kaç asker kaçtı) hiçbir koşulda saldırana gitmez: casusluğun bile göremediği bir
   * bilgiyi bedava vermek olurdu.
   */
  const rc = r.cave;
  let cave: BattleReport['cave'] = null;
  if (rc?.present) {
    cave = {
      present: true,
      broken: rc.broken,
      required: rc.required,
      survivingDwarves: rc.survivingDwarves,
      reason: rc.reason,
      escaped: side === 'defender' ? (r.defenderPrivate?.cave?.escaped ?? null) : null,
      repairUntil: side === 'defender' ? (r.defenderPrivate?.cave?.repairUntil ?? null) : null,
    };
    if (rc.broken) {
      notes.push(side === 'defender'
        ? 'MAĞARAN YIKILDI. İçerideki ordu şehre kaçıyor; mağara onarılana kadar kullanılamaz.'
        : `Düşmanın mağarası YIKILDI (${tr(rc.survivingDwarves)} cüce yeterli oldu).`);
    } else if (rc.reason === 'already_repairing') {
      notes.push(side === 'defender'
        ? 'Mağaran zaten onarımdaydı; yeniden yıkılmadı ve onarım süresi uzamadı.'
        : 'Düşmanın mağarası zaten yıkıktı.');
    } else if (rc.reason === 'not_enough_dwarves') {
      notes.push(side === 'defender'
        ? `Mağaran dayandı: yıkılması için ${tr(rc.required)} cüce gerekiyordu, `
          + `${tr(rc.survivingDwarves)} cüce sağ kaldı.`
        : `Mağara yıkılmadı: ${tr(rc.required)} cüce gerekiyordu, `
          + `${tr(rc.survivingDwarves)} cüce sağ kaldı.`);
    }
  }

  const coords = r.coords ?? battle.fallbackCoords ?? null;

  const report: BattleReport = {
    battleId: battle.id,
    side,
    winner: r.winner,
    won,
    turns: r.turns,
    night: battle.night,
    at: battle.at.toISOString(),
    coords,
    sections,
    heroes,
    wall,
    cave,
    loot,
    lootBreakdown,
    notes,
    text: '',
  };
  report.text = renderText(report);
  return report;
}

function renderText(r: BattleReport): string {
  const out: string[] = [];

  const outcome = r.winner === 'draw'
    ? 'Savaş berabere bitti'
    : r.won ? 'Kazandınız !' : 'Kaybettiniz !';
  // ⚠️ "(gece savaşı)" eki kaldırıldı (kullanıcı, 2026-08-05); ekranda yerini ay simgesi aldı.
  out.push(`${outcome} — ${r.turns} tur`);
  if (r.coords?.origin || r.coords?.target) {
    // Ad varsa koordinatın yanına parantezle; eski savaşlarda ad yok, satır kısalıyor.
    const c = (x: ReportCoord | null): string =>
      x ? `${x.k}:${x.d}:${x.s}${x.name ? ` (${x.name})` : ''}` : '—';
    out.push(`Kaynak: ${c(r.coords.origin)} → Hedef: ${c(r.coords.target)}`);
  }
  out.push('');

  for (const s of r.sections) {
    out.push(`${s.title}:`);
    for (const l of s.lines) {
      const restored = l.restoredByFloor ? ` [taban +${l.restoredByFloor}]` : '';
      out.push(`  ${l.name}: ${tr(l.before)} → ${tr(l.after)} (kayıp ${tr(l.lost)})${restored}`);
    }
    out.push('');
  }

  const heroText = (h: ReportHeroLine): string => {
    // ⭐ Tek etiket (kullanıcı, 2026-08-01): ölen kahraman ordusu sağ kalsa da kalmasa da
  //    «Yok Edildi» yazar; ikisi de eve dönüp tapınakta diriltiliyor.
  const durum = h.alive ? 'sağ' : 'YOK EDİLDİ';
    const xp = h.xpGained > 0 ? ` (+${tr(h.xpGained)} tecrübe)` : '';
    return `  ${h.name} (sv ${h.level}): ${durum}${xp}`;
  };
  if (r.heroes.mine.length > 0) {
    out.push('Kahramanların:');
    for (const h of r.heroes.mine) out.push(heroText(h));
    out.push('');
  }
  if (r.heroes.enemy.length > 0) {
    out.push('Rakip kahramanlar:');
    for (const h of r.heroes.enemy) out.push(heroText(h));
    out.push('');
  }

  if (r.wall?.level) {
    const pct = r.wall.integrity == null ? null : Math.round(r.wall.integrity * 100);
    out.push(`Sur: seviye ${r.wall.level}${r.wall.destroyed ? ' — YIKILDI' : pct != null ? ` — bütünlük %${pct}` : ''}`);
  }

  if (r.loot) {
    const label = r.side === 'attacker' ? 'Ganimet' : 'Yağmalanan';
    out.push(`${label}: ${tr(r.loot.gold)} altın, ${tr(r.loot.food)} yemek`);
  }
  if (r.lootBreakdown) {
    // ⚠️ `carried` yoksa satır «Ortaya çıkan»da biter — kaybeden saldırana «Taşınan: 0» yazmak
    //   bilgi değil gürültü olurdu (aynı gerekçe `loot`un null bırakılmasında).
    out.push(`  Ortaya çıkan: ${tr(r.lootBreakdown.revealed.gold)} altın, `
      + `${tr(r.lootBreakdown.revealed.food)} yemek`
      + (r.lootBreakdown.carried
        ? ` · Taşınan: ${tr(r.lootBreakdown.carried.gold)} altın, ${tr(r.lootBreakdown.carried.food)} yemek`
        : ''));
  }
  if (r.lootBreakdown?.leftBehind) {
    out.push(`  Taşıma kapasiten yetmedi (${tr(r.lootBreakdown.capacity ?? 0)}): `
      + `${tr(r.lootBreakdown.leftBehind.gold)} altın, `
      + `${tr(r.lootBreakdown.leftBehind.food)} yemek şehirde kaldı.`);
  }
  if (r.loot || r.lootBreakdown) out.push('');

  for (const n of r.notes) out.push(n);
  return out.join('\n').trimEnd();
}
