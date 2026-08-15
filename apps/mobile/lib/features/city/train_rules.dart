/// ⭐ «ÜRET» DÜĞMESİNİN KAPISI — emir verilebilir mi?
///
/// Saf fonksiyon, deponun deseni (`routing_rules.dart`, `city-progress.ts` ile aynı gerekçe):
/// bir widget'ın `build`ine gömülseydi sınanamazdı. Oysa buradaki her koşul sunucunun bir
/// reddinin aynası ve yanlışı **iki yönde de** kötü:
///   • gereğinden gevşek → oyuncu düğmeye basar, sunucu reddeder, sebebi anlaşılmaz
///   • gereğinden sıkı   → oyuncu yapabileceği bir şeyi yapamaz ve sebebini göremez
///
/// ⚠️ Kaynak yeterliliği İSTEMCİDE hesaplanıyor ama **otorite sunucu**: aradaki saniyelerde
/// kaynak değişebiliyor. Buradaki hesap yalnız düğmeyi erkenden kapatmak için.
library;

import 'catalog_model.dart';

/// Karşılanmayan ön koşullar — boşsa hepsi tamam.
///
/// ⚠️ `structures` `buildings` DEĞİL: Sur ve Büyü Kalkanı `defenses` tablosunda yaşıyor ama
/// ön koşulda bir **yapı** olarak yazılı (`CityDetail.structureLevels`). Yalnız `buildings`e
/// bakmak Sur'u daima 0 gösteriyor ve Sur ön koşullu her savunma birimi kilitli kalıyordu —
/// web'de ve sunucuda aynı hata yaşandı.
List<NamedRequirement> unmetRequirements(
  CatalogUnit unit, {
  required Map<String, int> structures,
  required Map<String, int> techs,
}) {
  return unit.requirements.where((r) {
    final have = r.kind == 'building'
        ? (structures[r.id] ?? 0)
        : (techs[r.id] ?? 0);
    return have < r.level;
  }).toList();
}

/// ⭐ Emir sınırı — savaşçıda **Baraka**, savunma biriminde **Sur** seviyesi.
///
/// ⚠️ En az 1: seviye 0 olan bir şehirde sınır 0 çıkar ve oyuncu HİÇ emir veremezdi.
int bandLimitFor(int structureLevel) => structureLevel < 1 ? 1 : structureLevel;

/// Düğme açık mı?
///
/// ⚠️ Sıra ÖNEMLİ değil (hepsi `&&`) ama her koşulun ayrı ayrı yazılması bilinçli: hangisinin
/// kapattığını okumak, tek bir birleşik ifadeden çok daha kolay.
bool canTrain({
  /// Girilen adet. ⚠️ 0 ya da negatifse kapalı — boş kutuyla emir gitmesin.
  required int count,

  /// Toplam maliyet karşılanıyor mu?
  required bool afford,

  /// Karşılanmayan ön koşul var mı?
  required bool hasUnmet,

  /// Bant dolu mu (`emir sayısı >= sınır`)?
  required bool slotsFull,

  /// ⭐ Karşılıklı kilit: bu şehirde Baraka yükseltiliyorsa asker üretilemez (§13.11.5a).
  required bool locked,

  /// Uçuşta bir istek var mı? (çift gönderim koruması)
  required bool busy,
}) {
  if (count <= 0) return false;
  if (!afford) return false;
  if (hasUnmet) return false;
  if (slotsFull) return false;
  if (locked) return false;
  if (busy) return false;
  return true;
}

/// Toplam maliyet — **adetle çarpılır**.
///
/// ⚠️ Çarpansız süre de aynı şekilde çarpılmalı, yoksa «indirim etiketi» tek birimde doğru,
/// 100 birimde saçma görünürdü.
({int gold, int food, num seconds, num? baseSeconds}) trainTotal(
  CatalogUnit u,
  int count,
) => (
  gold: u.gold * count,
  food: u.food * count,
  seconds: u.seconds * count,
  baseSeconds: u.baseSeconds == null ? null : u.baseSeconds! * count,
);
