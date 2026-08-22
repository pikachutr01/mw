/// ⭐⭐ SİMÜLATÖR — saf kurallar. Ekrandan bağımsız, ölçülebilir.
///
/// ⚠️ Buradaki kararların hepsi sessiz kırılıyor: yanlış kelepçelenmiş bir «Tekrar» sayısı
/// sunucudan 400 alır ve ekranda ham zod hatası görünür; sıfırı yükten düşürmeyi unutmak
/// motora «bu birim savaşa girdi ama sıfır adet» der; yüzdeyi yanlış yuvarlamak sur
/// bütünlüğünü olduğundan sağlam gösterir.
library;

import '../../gen/facts.g.dart';
import 'simulate_model.dart';

/// Kutudaki metni adede çevirir. ⚠️ Boş / bozuk / negatif → 0.
int simAmount(String? raw) {
  final n = int.tryParse((raw ?? '').trim());
  if (n == null || n < 0) return 0;
  return n;
}

/// ⚠️⚠️ SIFIRLAR YÜKTEN DÜŞÜYOR ve bu bir sadeleştirme değil, **motorun ayrımı**: bir
/// anahtarın hiç olmaması «bu birim savaşa girmedi», `0` olması ise «girdi ve hepsi öldü»
/// demek. Sıfırları göndermek sonuç tablosunu yanlış doldururdu.
Map<String, int> simCounts(Map<String, String?> raw) {
  final out = <String, int>{};
  for (final e in raw.entries) {
    final n = simAmount(e.value);
    if (n > 0) out[e.key] = n;
  }
  return out;
}

/// «Tekrar» kutusu — sunucu 1..50 istiyor (`simulateRequest.repeat`).
///
/// ⚠️ Kelepçe İSTEMCİDE de var: aşan bir sayı sunucudan düz bir zod hatası döndürüyor
/// (`{formErrors, fieldErrors}`, `message` alanı YOK) ve ekranda okunmaz bir metin çıkardı.
int simRepeat(String? raw) {
  final n = int.tryParse((raw ?? '').trim()) ?? 1;
  if (n < 1) return 1;
  if (n > 50) return 50;
  return n;
}

/// Kahramanın harcadığı puan.
int heroSpent(MwSimHero h) => h.fAtk + h.fDef + h.mAtk + h.mDef;

/// Seviyenin verdiği puan bütçesi.
///
/// ⚠️ Aşım ENGELLENMİYOR (web'de de öyle, bilerek): *"seviye 10 kahramana 40 puan
/// verseydim"* simülatörün cevaplaması gereken bir soru. Sayaç yalnız uyarı rengine dönüyor.
int heroBudget(MwSimHero h) => h.level * kHeroPointsPerLevel;

bool heroOverBudget(MwSimHero h) => heroSpent(h) > heroBudget(h);

/// ⚠️ Tamamen boş kahraman satırı yüke GİRMİYOR: seviye 0 ve puansız bir kahraman motora
/// «savaşa bir kahraman katıldı» der ve çıkma ihtimalini boş yere değiştirirdi.
List<MwSimHero> simHeroes(List<MwSimHero> rows) =>
    rows.where((h) => h.level > 0 || heroSpent(h) > 0).toList();

/// Savaştırılabilir mi?
///
/// ⚠️ Ölçüt «İKİ tarafta da en az bir birim» DEĞİL, «en az bir tarafta»: tek taraflı bir
/// kurulum meşru bir soru (*"bu orduyu boş şehre sokarsam ne olur"*) ve motor cevaplıyor.
/// Tamamen boş iki taraf ise sunucuya gitmeye değmez.
bool simCanRun({
  required Map<String, int> attackerCounts,
  required Map<String, int> defenderCounts,
}) => attackerCounts.isNotEmpty || defenderCounts.isNotEmpty;

/// Kazananın oyuncuya görünen adı.
String simWinnerLabel(String winner) => switch (winner) {
  'attacker' => 'Saldıran kazandı',
  'defender' => 'Savunan kazandı',
  _ => 'Berabere',
};

/// Sur / Büyü Kalkanı bütünlüğü → yüzde metni.
///
/// ⚠️ Bir ondalık basamak korunuyor (`%99,9`): tam sayıya yuvarlamak, çizilmek üzere olan
/// bir suru «%100» gösterirdi ve simülatörün amacı tam olarak o farkı görmek.
/// ⚠️ Ondalık ayracı VİRGÜL — sayı biçimi uygulamanın geri kalanıyla aynı olmalı.
String integrityText(num? integrity) {
  if (integrity == null) return '—';
  final yuzde = (integrity * 1000).round() / 10;
  final metin = yuzde == yuzde.roundToDouble()
      ? '${yuzde.round()}'
      : yuzde.toStringAsFixed(1).replaceAll('.', ',');
  return '%$metin';
}

/// Ele geçirme ihtimali → yüzde metni. ⚠️ `integrityText` ile aynı biçim.
String chanceText(num chance) => integrityText(chance);

/// Bir birimin «Kalan» hücresi.
///
/// ⚠️⚠️ `null` dönüşü «çizme» demek ve üç ayrı sebebi var: girdi yok, sonuç yok, ya da
/// sonuçta bu anahtar hiç geçmiyor. Üçünü de `0` göstermek, savaşa hiç girmemiş bir birimi
/// «hepsi öldü» diye okuturdu.
({String text, bool wiped})? remainingCell({
  required String unitId,
  required int entered,
  required MwSimSideResult? result,
}) {
  if (result == null || entered <= 0) return null;
  if (kLevelBased.contains(unitId)) {
    final b = unitId == 'wall' ? result.wallIntegrity : result.shieldIntegrity;
    if (b == null) return null;
    return (text: integrityText(b), wiped: b <= 0);
  }
  final kalan = result.counts[unitId];
  if (kalan == null) return null;
  return (text: '$kalan', wiped: kalan <= 0);
}

/// ⚠️ Taş Ustalığı yalnız SAVUNMA yapılarını ölçekliyor; saldıranda kutu çizmek hiçbir
/// etkisi olmayan bir alan sunmak olurdu. Kural `facts.g.dart`tan geliyor.
bool techEditable(String techId, {required bool attacker}) =>
    !(attacker && kDefenderOnlyTech.contains(techId));

/// Çoklu koşuda kim kaç kere kazandı.
({int attacker, int defender, int draw}) simTally(List<MwSimResult> results) {
  var a = 0;
  var d = 0;
  var b = 0;
  for (final r in results) {
    switch (r.winner) {
      case 'attacker':
        a++;
      case 'defender':
        d++;
      default:
        b++;
    }
  }
  return (attacker: a, defender: d, draw: b);
}
