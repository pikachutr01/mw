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

/// Ön koşullar — **seviye taşıyan kalemler** için (yapı · teknik). Üsttekinin ikizi ama
/// girdisi `CatalogUnit` değil `CatalogUpgradable`.
///
/// ⚠️ İki ayrı fonksiyon, çünkü ortak bir arayüz çıkarmak iki modeli birbirine bağlardı ve
/// ikisi gerçekten farklı şeyler (biri adet taşır, diğeri seviye). Ortak olan yalnız ön koşul
/// listesi; onu gövdede paylaşıyorlar.
List<NamedRequirement> unmetFor(
  List<NamedRequirement> requirements, {
  required Map<String, int> structures,
  required Map<String, int> techs,
}) {
  return requirements.where((r) {
    final have = r.kind == 'building'
        ? (structures[r.id] ?? 0)
        : (techs[r.id] ?? 0);
    return have < r.level;
  }).toList();
}

/// ⭐⭐ KARŞILIKLI KİLİT (§13.11.5a) — yapı yönü.
///
/// Aynı şehirde asker üretilirken **Baraka**, araştırma sürerken **Akademi** yükseltilemez.
/// Tersi de doğru ve o taraf ilgili ekranlarda (`Baraka`, `Akademi`) uygulanıyor.
///
/// ⚠️ Dönen değer bir `bool` değil **metin**: oyuncuya "neden kapalı" diye sorduran bir pasif
/// düğme, kapalı olduğunu söyleyen bir düğmeden çok daha kötü. `null` = kilit yok.
String? buildingMutex(
  String id, {
  required bool unitBusy,
  required bool techBusy,
}) {
  if (id == 'barracks' && unitBusy) {
    return 'Asker üretimi sürerken Baraka yükseltilemez.';
  }
  if (id == 'academy' && techBusy) {
    return 'Araştırma sürerken Akademi yükseltilemez.';
  }
  return null;
}

/// ⭐ YAPI YÜKSELTME KAPISI — web'deki `Buildings` düğmesinin koşullarının aynısı.
///
/// ⚠️ `busy` burada "**bu şehirde açık bir yapı emri var**" demek, "istek uçuşta" değil:
/// inşaat aynı anda TEK ve sunucu ikinci emri reddediyor. Uçuştaki istek ayrı bir bayrak
/// (`pending`) — ikisini tek alanda birleştirmek, iptalden sonra düğmenin açılmamasına yol
/// açardı.
bool canUpgradeBuilding({
  required bool maxed,
  required bool capped,
  required bool afford,
  required bool hasUnmet,
  required bool busy,
  required bool pending,
  required bool mutex,

  /// ⭐ Mağaraya özel: onarımdayken ya da asker taşınırken seviye ilerletilemez (§13.20).
  required bool caveLocked,
}) {
  if (maxed) return false;
  if (capped) return false;
  if (!afford) return false;
  if (hasUnmet) return false;
  if (busy) return false;
  if (pending) return false;
  if (mutex) return false;
  if (caveLocked) return false;
  return true;
}

/// ⭐ ARAŞTIRMA KAPISI — web'deki `Techs` düğmesinin koşullarının aynısı.
///
/// ⚠️ `alreadyRunning` **tüm şehirlerden** bakılır (Akademiler ortak): teknik başka şehirde
/// araştırılıyorsa burada da açılamaz. Yalnız bu şehrin kuyruğuna bakmak, aynı tekniği iki
/// şehirden başlatmaya davet ederdi.
bool canResearch({
  required bool capped,
  required bool afford,
  required bool hasUnmet,

  /// Bu ŞEHİRDE başka bir araştırma sürüyor mu?
  required bool busyHere,

  /// Bu teknik (herhangi bir şehirde) zaten araştırılıyor mu?
  required bool alreadyRunning,

  /// Bu şehirde Akademi yükseltiliyor mu? (karşılıklı kilidin araştırma yönü)
  required bool academyUpgrading,
  required bool pending,
}) {
  if (capped) return false;
  if (!afford) return false;
  if (hasUnmet) return false;
  if (busyHere) return false;
  if (alreadyRunning) return false;
  if (academyUpgrading) return false;
  if (pending) return false;
  return true;
}

/// ⭐⭐ SAVUNMADA §verify İKİ AYRI KURAL (sunucudakinin aynısı):
///   • Sur / Büyü Kalkanı (`levelBased`) → **seviye tavanı**
///   • adetli savunma birimi             → **tamamen yasak** (kullanıcı şartı)
///
/// ⚠️ Savaşçı tarafında tavan TOPLAM sayıya bağlı ve istemcide hesaplanmıyor (mağara + yoldaki
/// + kuyruk toplamı yalnız sunucuda) → orada sunucu reddi kalıyor. Bu fonksiyon savunmaya özel.
bool defenseCapped({
  required VerifyCaps? caps,
  required bool levelBased,
  required int currentLevel,
}) {
  if (caps == null) return false;
  return levelBased ? currentLevel >= caps.maxDefenseLevel : true;
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
