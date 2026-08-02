/**
 * ⭐ CASUSLUK DENGE TARAMASI — `node packages/catalog/scripts/spy-balance.mjs`
 *
 * Erken / orta / geç oyun senaryolarında iki soruya tablo üretir:
 *   1. Bu savunmaya karşı 1 bilgi kuşu sızdırmak için kaç kuş (ve kaç kaynak) gerekir?
 *   2. Casusluk seviye farkı bu eşiği nasıl oynatır?
 *
 * Ağırlıkları (SPY_CONSTANTS) değiştirip yeniden koşarak kalibrasyon yapılır; kilitlenen
 * değerler `packages/catalog/test/spy.test.ts` altın testlerine işlenir.
 * (Önce `pnpm --filter @mobilwar/catalog build` — script dist'ten okur.)
 */
import { SPY_CONSTANTS, spyInterception, spyLevelFor, spyEffectiveDiff, UNITS_BY_ID } from '../dist/index.js';

const BIRD_COST = UNITS_BY_ID['spy_bird'].gold + UNITS_BY_ID['spy_bird'].food;   // 300
const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n);

/** Bu savunmaya 1 bilgi kuşu sızdıran en küçük kuş sayısı (ikili arama). */
function birdsNeeded(def, myEsp) {
  let lo = 1, hi = 2_000_000;
  const leaks = (n) => spyInterception({
    birds: n, myEspionage: myEsp, theirEspionage: def.esp,
    towers: def.towers, elves: def.elves, defenderBirds: def.birds,
  }).infoBirds >= 1;
  if (!leaks(hi)) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (leaks(mid)) hi = mid; else lo = mid + 1; }
  return lo;
}

const SCENARIOS = [
  ['ERKEN', [
    { name: 'savunmasız köy',   esp: 1,  towers: 0,    elves: 0,      birds: 0 },
    { name: 'ilk kuleler',      esp: 1,  towers: 10,   elves: 100,    birds: 0 },
    { name: 'tedbirli komşu',   esp: 3,  towers: 30,   elves: 300,    birds: 20 },
  ]],
  ['ORTA', [
    { name: 'orta şehir',       esp: 6,  towers: 150,  elves: 2_000,  birds: 50 },
    { name: 'savunmacı',        esp: 8,  towers: 300,  elves: 5_000,  birds: 300 },
  ]],
  ['GEÇ', [
    { name: 'kale şehir',       esp: 14, towers: 1_000, elves: 20_000, birds: 1_000 },
    { name: 'paranoyak',        esp: 18, towers: 2_500, elves: 50_000, birds: 5_000 },
  ]],
];

console.log(`Ağırlıklar: kuş ${SPY_CONSTANTS.wBird} · kule ${SPY_CONSTANTS.wTower} · elf ${SPY_CONSTANTS.wElf} · üs ${SPY_CONSTANTS.espBase}^±${SPY_CONSTANTS.espClamp}\n`);

for (const [cag, defs] of SCENARIOS) {
  console.log(`══ ${cag} ═══════════════════════════════════════════════════════`);
  for (const def of defs) {
    console.log(`\n▶ ${def.name}  (esp ${def.esp} · kule ${def.towers} · elf ${fmtK(def.elves)} · kuş ${def.birds})`);
    for (const dEsp of [-2, -1, 0, +1, +2]) {
      const myEsp = Math.max(0, def.esp + dEsp);
      const n = birdsNeeded(def, myEsp);
      if (n == null) { console.log(`  esp ${String(dEsp).padStart(2)} → SIZMA İMKÂNSIZ`); continue; }
      const tier = spyLevelFor(spyEffectiveDiff(myEsp, n, def.esp));
      const r = spyInterception({ birds: n, myEspionage: myEsp, theirEspionage: def.esp,
        towers: def.towers, elves: def.elves, defenderBirds: def.birds });
      console.log(
        `  esp ${String(dEsp).padStart(2)} → ${String(n).padStart(7)} kuş`
        + ` · ${fmtK(n * BIRD_COST).padStart(7)} kaynak`
        + ` · ölen ${fmtK(r.killed).padStart(6)} · engel ${fmtK(r.blocked).padStart(5)}`
        + ` · kademe ${tier}`,
      );
    }
  }
  console.log('');
}

/* Kullanıcının 256/300 örneği: K_vur = 280 olacak savunma (280 kule, eşit esp). */
console.log('══ 256/300 ÖRNEĞİ (280 kule · eşit esp) ═══════════════════════');
for (const n of [256, 300]) {
  const r = spyInterception({ birds: n, myEspionage: 5, theirEspionage: 5,
    towers: 280, elves: 0, defenderBirds: 0 });
  console.log(`  ${n} kuş → ölen ${r.killed} · bilgi kuşu ${r.infoBirds}`);
}
