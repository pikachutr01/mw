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
 * Savunan, saldıranın ordusunun ne kadarının sağ kaldığını göremez (§13.10.1 "birleşim gizli");
 * saldıran da savunanın kasasında ne kaldığını göremez.
 */
import { LEVEL_BASED, UNITS_BY_ID } from '@mobiwar/catalog';

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

export interface BattleReport {
  battleId: number;
  side: ReportSide;
  winner: 'attacker' | 'defender' | 'draw';
  /** Bu raporu okuyan oyuncu kazandı mı? */
  won: boolean;
  turns: number;
  night: boolean;
  at: string;
  sections: ReportSection[];
  loot: { gold: number; food: number } | null;
  wallIntegrity: number | null;
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
    effectivePlunderRate: number;
  };
}

export interface BattleRow {
  id: number;
  at: Date;
  night: boolean;
  winner: string;
  input: { attacker: { counts: Record<string, number> }; defender: { counts: Record<string, number> } };
  result: BattleResultShape;
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

export function buildBattleReport(battle: BattleRow, side: ReportSide): BattleReport {
  const r = battle.result;
  const won = r.winner === side;

  const attackerLines = linesFor(
    battle.input.attacker.counts, r.attacker.counts, r.attacker.floorRestored, 'warrior',
  );
  const defenderUnitLines = linesFor(
    battle.input.defender.counts, r.defender.counts, r.defender.floorRestored, 'warrior',
  );
  const defenderStructLines = linesFor(
    battle.input.defender.counts, r.defender.counts, r.defender.floorRestored, 'defense',
  );

  const sections: ReportSection[] = [
    { key: 'attacker', title: 'Saldıran ordu', lines: attackerLines },
    { key: 'defenderUnits', title: 'Savunan ordu', lines: defenderUnitLines },
    { key: 'defenderStructs', title: 'Savunma birimleri', lines: defenderStructLines },
  ].filter((s) => s.lines.length > 0);

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

  if (r.defender.wallIntegrity != null && r.defender.wallIntegrity < 1) {
    notes.push(`Sur bütünlüğü %${Math.round(r.defender.wallIntegrity * 100)}'e düştü.`);
  }

  const heroesDead = (side === 'attacker' ? r.attacker : r.defender).heroes.filter((h) => !h.alive);
  if (heroesDead.length > 0) {
    notes.push(`${heroesDead.length} kahraman düştü — Tapınak'ta diriltme sürecine girdi.`);
  }

  // Ganimet: saldıran ne ALDIĞINI, savunan ne KAYBETTİĞİNİ görür.
  let loot: { gold: number; food: number } | null = null;
  if (r.loot) {
    loot = side === 'attacker' ? r.loot.taken : r.loot.fromPlunder;
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

  return {
    battleId: battle.id,
    side,
    winner: r.winner,
    won,
    turns: r.turns,
    night: battle.night,
    at: battle.at.toISOString(),
    sections,
    loot,
    wallIntegrity: r.defender.wallIntegrity,
    notes,
    text: renderText({ battle, side, won, sections, loot, notes }),
  };
}

function renderText(o: {
  battle: BattleRow;
  side: ReportSide;
  won: boolean;
  sections: ReportSection[];
  loot: { gold: number; food: number } | null;
  notes: string[];
}): string {
  const r = o.battle.result;
  const out: string[] = [];

  const outcome = r.winner === 'draw'
    ? 'Savaş berabere bitti'
    : o.won ? 'Savaşı KAZANDIN' : 'Savaşı KAYBETTİN';
  out.push(`${outcome} — ${r.turns} tur${o.battle.night ? ' (gece savaşı)' : ''}`);
  out.push('');

  for (const s of o.sections) {
    out.push(`${s.title}:`);
    for (const l of s.lines) {
      const restored = l.restoredByFloor ? ` [taban +${l.restoredByFloor}]` : '';
      out.push(`  ${l.name}: ${tr(l.before)} → ${tr(l.after)} (kayıp ${tr(l.lost)})${restored}`);
    }
    out.push('');
  }

  if (o.loot) {
    const label = o.side === 'attacker' ? 'Ganimet' : 'Yağmalanan';
    out.push(`${label}: ${tr(o.loot.gold)} altın, ${tr(o.loot.food)} yemek`);
    out.push('');
  }

  for (const n of o.notes) out.push(n);
  return out.join('\n').trimEnd();
}
