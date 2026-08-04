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
  /** Yalnız saldıran: savaşta ORTAYA ÇIKAN (enkaz+yağma havuzu) ve fiilen TAŞINAN ganimet. */
  lootBreakdown: {
    revealed: { gold: number; food: number };
    carried: { gold: number; food: number };
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
    effectivePlunderRate?: number;
    effectiveRates?: { gold: number; food: number };
  };
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
      integrity,
      destroyed: r.wall?.destroyed ?? (integrity != null && integrity <= 0),
    }
    : null;

  const notes: string[] = [];
  if (battle.night) notes.push('Savaş GECE gerçekleşti — vuruş gücü düştü (Gece Görüşü etkili).');

  // ⭐ Savunma tabanı (§13.11.10): "en kötü ihtimalle 4'lük garnizon ayakta kalır" kuralının
  //    gerçekten işlediği raporda GÖRÜNÜR olmalı — yoksa oyuncu sayıları hata sanır.
  const restored = Object.entries(r.defender.floorRestored ?? {}).filter(([, n]) => n > 0);
  if (restored.length > 0) {
    notes.push(
      `Savunma tabanı devreye girdi: ${restored.map(([id, n]) => `${nameOf(id)} ${n}`).join(', ')} korundu.`,
    );
  }

  if (integrity != null && integrity < 1 && wallLevel > 0) {
    notes.push(integrity <= 0
      ? 'SUR TAMAMEN YIKILDI — onarımı bitene kadar savunma birimi üretilemez.'
      : `Sur bütünlüğü %${Math.round(integrity * 100)}'e düştü.`);
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

  // Ganimet: saldıran ne ALDIĞINI, savunan ne KAYBETTİĞİNİ görür.
  let loot: { gold: number; food: number } | null = null;
  let lootBreakdown: BattleReport['lootBreakdown'] = null;
  if (r.loot) {
    loot = side === 'attacker' ? r.loot.taken : r.loot.fromPlunder;
    if (side === 'attacker') {
      lootBreakdown = {
        revealed: {
          gold: r.loot.fromDebris.gold + r.loot.fromPlunder.gold,
          food: r.loot.fromDebris.food + r.loot.fromPlunder.food,
        },
        carried: r.loot.taken,
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
  out.push(`${outcome} — ${r.turns} tur${r.night ? ' (gece savaşı)' : ''}`);
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
    if (r.lootBreakdown) {
      out.push(`  Ortaya çıkan: ${tr(r.lootBreakdown.revealed.gold)} altın, ${tr(r.lootBreakdown.revealed.food)} yemek`
        + ` · Taşınan: ${tr(r.lootBreakdown.carried.gold)} altın, ${tr(r.lootBreakdown.carried.food)} yemek`);
    }
    out.push('');
  }

  for (const n of r.notes) out.push(n);
  return out.join('\n').trimEnd();
}
