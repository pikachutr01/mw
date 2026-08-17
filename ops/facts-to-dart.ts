/**
 * ⭐⭐ OYUN OLGULARI → DART — `apps/mobile/lib/gen/facts.g.dart`.
 *
 *   pnpm facts:build   → dosyayı yazar
 *   pnpm facts:check   → yazmadan karşılaştırır, fark varsa ÇIKIŞ KODU 1 (CI kırılır)
 *
 * ⚠️⚠️ **NEDEN ÜRETİLİYOR, ELLE YAZILMIYOR.** Kullanıcı isteği (2026-08-17): *"Askerlerin
 * etkilendiği teknikler vs web ve mobil tarafında tutarlı olmalı. Belki bunun için hem mobili
 * hem web'i besleyen ortak bir yapı düşünülebilir."*
 *
 * Taşınan iki şey **farklı türden** ve ayrımı korumak şart:
 *   • `UNIT_INFO` · `BUILDING_INFO` · `TECH_INFO` → elle yazılmış **arayüz kopyası**
 *   • teknik listesi · vuruş fazı · birim türü      → savaş motorunun kataloğundan
 *                                                     **TÜRETİLMİŞ olgular**
 *
 * İkincisini elle Dart'a kopyalamak mobili yalancı yapardı ve bu soyut bir risk değil:
 * `unit-facts.ts` başlığı oyunun kendi dokümanının motorla **dört yerde** çeliştiğini
 * sayıyor (Kaos'un Zırh'tan etkilenmesi · Ogre'nin Demircilik'ten etkilenmemesi · Büyü
 * Kalkanı'nı Tılsım'ın ölçeklemesi · Elf'in Büyücülük'ten etkilenmemesi). Elle yazılan bir
 * mobil listesi bu dört yanlışı oyuncuya öğretmeye devam ederdi.
 *
 * ─ Neden yeni bir paket DEĞİL ────────────────────────────────────────────────────────────
 * Kaynak dosyalar `apps/web/src/lib/` altında ve oradan bir **paket** import edemez (sınır
 * `packages/catalog/src/scoring.ts`te yazılı). Üç seçenek vardı:
 *   • dosyaları yeni bir pakete taşımak → web'in importları değişir, dört dosya kıpırdar,
 *   • üreteci `packages/contracts`a koymak → "sözleşme" adı oyun metnini taşımaya başlar,
 *   • **üreteci `ops/`a koymak** → `ops/assets-sync.mjs` ZATEN aynı işi yapıyor: web'den alır,
 *     mobile koyar, `--check` ile sürüklenmeyi kırar. Aynı desen, sıfır yeni kavram.
 * Üçüncüsü seçildi.
 *
 * ⚠️ Betik **Node tarafında** koşuyor (Flutter SDK'sı gerekmiyor) → `facts:check` `ci.yml`e
 * `assets:check`in yanına giriyor.
 *
 * ⚠️ **Config'e bağlı olgular BİLEREK dışarıda.** `tech-facts.ts`teki `nightGapClosed`,
 * `roadTimeFactor`, `colonizationSteps`, `spyTierLabels` dünya ayarlarını parametre alıyor;
 * onlar sabit veri değil, **fonksiyon**. Sabit bir tabloya dökmek, panelden ayar değiştiren
 * bir dünyada sessizce yanlış olurdu. Mobil o tablolara ihtiyaç duyduğunda ya sunucudan
 * gelecekler ya da hesap Dart'a portlanacak — kopyalanmayacaklar.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME_MAX, NAME_MIN, NAME_RULE_MESSAGE, UNITS_BY_ID } from '@mobilwar/catalog';
import { BUILDING_INFO, TECH_INFO, UNIT_INFO } from '../apps/web/src/lib/info-texts.ts';
import { HERO_SKILLS } from '../apps/web/src/lib/hero-skills.ts';
import { unitStrikeLabel, unitTechNames } from '../apps/web/src/lib/unit-facts.ts';

const here = dirname(fileURLToPath(import.meta.url));
const hedef = join(here, '..', 'apps', 'mobile', 'lib', 'gen', 'facts.g.dart');

/**
 * Dart dize değişmezi.
 *
 * ⚠️ `$` KAÇIRILMAK ZORUNDA: Dart'ta dize içi `$ad` bir interpolasyondur ve metinde geçen bir
 * `$` derleme hatasına ya da (daha kötüsü) sessizce yanlış bir çıktıya yol açar.
 * ⚠️ Satır sonu `\n`e çevriliyor: kaynak metinler tek satır ama biri çok satırlı yazılırsa
 * üretilen Dart bozulmasın.
 */
function dartStr(s: string): string {
  const esc = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\$/g, '\\$')
    .replace(/\r?\n/g, '\\n');
  return `'${esc}'`;
}

const entries = (o: Record<string, string>): string =>
  Object.entries(o)
    .map(([k, v]) => `  ${dartStr(k)}: ${dartStr(v)},`)
    .join('\n');

/** Katalogdaki her birim için türetilmiş olgular. Sıra katalogdan; alfabetik değil. */
const unitIds = Object.keys(UNITS_BY_ID);

const unitInfoLines = Object.entries(UNIT_INFO)
  .map(([id, t]) => {
    const extra = t.extra == null ? '' : `, extra: ${dartStr(t.extra)}`;
    return `  ${dartStr(id)}: MwUnitInfo(desc: ${dartStr(t.desc)}${extra}),`;
  })
  .join('\n');

const techNameLines = unitIds
  .map((id) => [id, unitTechNames(id)] as const)
  .map(([id, names]) => `  ${dartStr(id)}: [${names.map(dartStr).join(', ')}],`)
  .join('\n');

/** ⚠️ Yalnız DOLU olanlar yazılıyor: `null` "vuruş satırı çizilmez" demek ve haritada
 *  bulunmaması bunu zaten anlatıyor. */
const strikeLines = unitIds
  .map((id) => [id, unitStrikeLabel(id)] as const)
  .filter((p): p is readonly [string, string] => p[1] != null)
  .map(([id, label]) => `  ${dartStr(id)}: ${dartStr(label)},`)
  .join('\n');

const kindLines = unitIds
  .map((id) => `  ${dartStr(id)}: ${dartStr(UNITS_BY_ID[id]!.kind)},`)
  .join('\n');

/**
 * ⭐ Kahraman yetenekleri — anahtar · simge · etiket, **sıra dâhil** (`hero-skills.ts`).
 *
 * ⚠️ Sıra rastgele DEĞİL: fiziksel saldırı → fiziksel savunma → büyü saldırı → büyü savunma.
 * Oyunun kendi ekranındaki sıra bu; iki istemcide farklı olsaydı sayılar yanlış okunurdu.
 */
const heroSkillLines = HERO_SKILLS.map(
  (s) =>
    `  (key: ${dartStr(s.key)}, icon: ${dartStr(s.icon)}, ` +
    `label: ${dartStr(s.label)}),`,
).join('\n');

const next = `// dart format off
// ⚠️⚠️ ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.
//
// Kaynak: \`ops/facts-to-dart.ts\` · \`pnpm facts:build\`
// Kapı:   \`pnpm facts:check\` (CI) — web ile mobil ayrışırsa derleme kırılır.
//
// ⚠️ \`dart format off\` ŞART: biçimlendirici bu dosyaya dokunursa \`facts:check\` HER koşuda
//    kırılır — üreteç bir çıktı üretir, formatçı başkasını ve ikisi asla eşitlenmez.
//    \`contracts.g.dart\` de aynı satırı taşıyor; ölçülerek öğrenildi (2026-08-17).
//
// İçindekiler iki türden:
//   • \`kUnitInfo\` · \`kBuildingInfo\` · \`kTechInfo\` → elle yazılmış arayüz kopyası
//   • \`kUnitTechNames\` · \`kUnitStrike\` · \`kUnitKind\` → savaş motorunun kataloğundan
//     TÜRETİLMİŞ olgular. Bunları elle yazmak mobili yalancı yapar; gerekçe üreteçte.
library;

/// Birimin bilgi kutusundaki metinler.
class MwUnitInfo {
  const MwUnitInfo({required this.desc, this.extra});

  /// Ana açıklama.
  final String desc;

  /// «Özel» başlığı altındaki ek not; çoğu birimde yok.
  final String? extra;
}

const Map<String, MwUnitInfo> kUnitInfo = {
${unitInfoLines}
};

/// Birimi ölçekleyen tekniklerin Türkçe adları, Akademi ekranındaki sırayla.
///
/// ⚠️ **Boş liste GERÇEK bir bilgidir** (Yük Arabası, Casus Kuş): "bu birimi hiçbir savaş
/// tekniği güçlendirmiyor". Bölümü hiç çizmemek "bilgi eksik" gibi okunurdu.
const Map<String, List<String>> kUnitTechNames = {
${techNameLines}
};

/// Birimin hangi faz(lar)da hasar verdiği. ⚠️ Haritada YOKSA satır çizilmez.
const Map<String, String> kUnitStrike = {
${strikeLines}
};

/// \`warrior\` · \`defense\` — «Alan» satırının yalnız savaşçıda çizilmesi için.
const Map<String, String> kUnitKind = {
${kindLines}
};

const Map<String, String> kBuildingInfo = {
${entries(BUILDING_INFO)}
};

const Map<String, String> kTechInfo = {
${entries(TECH_INFO)}
};

/// ⭐ KAHRAMAN YETENEKLERİ — dört anahtar, oyunun kendi sırasıyla.
///
/// ⚠️ Sıra fiziksel saldırı → fiziksel savunma → büyü saldırı → büyü savunma. İki istemcide
/// farklı olsaydı sayılar yanlış okunurdu.
/// ⚠️ Büyü yetenekleri ziyan DEĞİL: kahramanın büyü tabanı fizikselle aynı (1200, binary'den
/// doğrulandı). Bu yüzden ekranda büyüden caydıran bir uyarı yok.
const List<({String key, String icon, String label})> kHeroSkills = [
${heroSkillLines}
];

/// ⭐ OYUNCUNUN YAZDIĞI ADLARIN SINIRI — şehir ve kahraman için aynı.
///
/// ⚠️ Sınır orijinalden geliyor (J2ME «Şehir Adı» formu) ve **sunucu doğrulaması aynı
/// sayılara bakıyor**. İstemcide elle yazılsaydı, kutu sunucunun reddedeceği bir adı kabul
/// edip düğmeyi açardı — web'de tam bu yaşandı (kutu 2-24 diyordu, sunucu 3-10 istiyordu).
const int kNameMin = ${NAME_MIN};
const int kNameMax = ${NAME_MAX};
const String kNameRuleMessage = ${dartStr(NAME_RULE_MESSAGE)};
`;

const check = process.argv.includes('--check');
if (check) {
  let current: string | null = null;
  try {
    current = readFileSync(hedef, 'utf8');
  } catch {
    current = null;
  }
  if (current !== next) {
    console.error("✗ facts.g.dart güncel değil — 'pnpm facts:build' çalıştırıp sonucu commit'leyin.");
    process.exit(1);
  }
  console.log('✓ Oyun olguları kaynakla senkron.');
} else {
  mkdirSync(dirname(hedef), { recursive: true });
  writeFileSync(hedef, next, 'utf8');
  console.log(
    `✓ lib/gen/facts.g.dart (${Object.keys(UNIT_INFO).length} birim · ` +
      `${Object.keys(BUILDING_INFO).length} yapı · ${Object.keys(TECH_INFO).length} teknik)`,
  );
}
