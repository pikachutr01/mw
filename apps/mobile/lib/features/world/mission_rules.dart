/// ⭐ SEFER FORMUNUN POLİTİKA KÜMELERİ — hangi görev kahraman taşır, hangisi ordusuz gider,
/// hangi formda ne seçilir. Web'deki `lib/mission-rules.ts` + `world-modal.tsx` · `FORM_RULES`.
///
/// ⚠️⚠️ **Bu kümeler SUNUCUYLA elle senkron ve senkron web'de İKİ KEZ kaçtı:**
///   • 2026-08-03: sunucu kahramanı zaten taşıyabiliyordu (`march()` → `reserveHeroes`), form
///     hiç kahraman seçtirmiyordu → özellik aylardır yazılıydı ve **ulaşılamıyordu**.
///   • 2026-08-11: `allowEmptyArmy` sunucuda destek ve teleport için açıktı, istemci kümesi
///     yalnız `found_city` diyordu → oyuncu *"sadece kahramanı seçip gönderemiyorum"* dedi.
///
/// Ayrışmanın iki yönü de kötü ama farklı biçimde: **eksikse** düğme pasif kalır ve sunucudaki
/// izin görünmez olur (sessiz, bu yüzden tehlikeli); **fazlaysa** form açılır ve sunucu
/// `no_units` ile geri çevirir (gürültülü, çabuk fark edilir).
///
/// ⚠️ Bu yüzden kümeler ekrandan **ayrı** duruyor: saf veri oldukları için sınanabiliyorlar.
/// Widget'ın içindeyken sınanamıyorlardı ve iki kaymanın da bekçisi yoktu.
library;

/// ⭐ KAHRAMAN GÖNDERİLEBİLEN GÖREVLER.
///
/// ⚠️ Nakliye ve casusluk DIŞARIDA: nakliyenin işi kaynak taşımak (kahramanın `carry`si yok),
/// casuslukta yalnız Casus Kuş gider.
const Set<String> kHeroMissions = {
  'attack',
  'support',
  'teleport',
  'found_city',
};

/// ⭐ ORDUSUZ GİDİLEBİLEN GÖREVLER — kahraman **tek başına** gidebilir.
///
/// ⚠️ Saldırı burada YOK ve olmamalı: `sendAttack` ortak yoldan geçmiyor, boş orduyu her
/// hâlükârda reddediyor. Eklenseydi form açılır, sunucu geri çevirirdi.
/// ⚠️ Nakliye de YOK: kahraman kaynak taşıyamaz, ordusuz nakliyenin anlamı olmaz.
const Set<String> kArmyOptional = {'found_city', 'support', 'teleport'};

/// Form gönderilebilir mi — «en az bir birim ya da (izinliyse) bir kahraman».
///
/// Sunucudaki `march()` kuralının birebir aynası.
bool hasCrew(String type, int unitCount, int heroCount) {
  if (unitCount > 0) return true;
  return kArmyOptional.contains(type) &&
      kHeroMissions.contains(type) &&
      heroCount > 0;
}

/// Formda hangi birimler listelenir.
enum MwUnitScope {
  /// Casus Kuş HARİÇ her savaşçı.
  warriors,

  /// Yalnız Casus Kuş.
  spy,

  /// ⭐ Casus Kuş DAHİL her savaşçı — destek, teleport ve şehir kurma.
  ///
  /// ⚠️ Gerekçe bir çıkmazdı: şehir terk etmek barakanın TAMAMEN boş olmasını istiyor
  /// (`abandonBlockers`), ama casus kuş yalnız casusluğa katılabildiği için şehirden
  /// ÇIKARILAMIYORDU — yani kuşu olan şehir hiç terk edilemiyordu.
  all,

  /// Birim seçilmez.
  none,
}

typedef MwFormRule = ({MwUnitScope units, bool cargo});

/// Hangi görevde ne seçilir — tek tabloda, dallanma formun içine dağılmasın diye.
///
/// ⭐ Şehir kurma `all` + kargo açık (2026-08-07): kuş şehir kurmaya katılabiliyor ve TEK
/// BAŞINA gidebiliyor (sunucuda `allowSpyBird`). Kargo bayrağı kapalıyken Yük Arabası listede
/// seçilebiliyordu ama oyuncu hiçbir şey taşıyamıyordu.
const Map<String, MwFormRule> kFormRules = {
  'attack': (units: MwUnitScope.warriors, cargo: false),
  'spy': (units: MwUnitScope.spy, cargo: false),
  'transport': (units: MwUnitScope.warriors, cargo: true),
  'support': (units: MwUnitScope.all, cargo: true),
  'found_city': (units: MwUnitScope.all, cargo: true),
  'teleport': (units: MwUnitScope.all, cargo: false),
};

/// ⚠️ Bilinmeyen tip savaşçı+kargosuz varsayıyor: sunucuya yeni bir görev eklenirse form
/// çökmesin, en dar biçimde açılsın. Yanlış açılan bir formu sunucu reddediyor; hiç açılmayan
/// bir form ise sessiz.
MwFormRule formRule(String type) =>
    kFormRules[type] ?? (units: MwUnitScope.warriors, cargo: false);

/// ⭐ SERBEST ORDU = barakadaki − mağaraya söz verilenler (kullanıcı kuralı, 2026-08-11).
///
/// Sunucu bunu `reserveUnits` içinde zorluyor; burası aynı sayıyı **ekranda** gösteriyor ki
/// oyuncu reddedilecek bir emri hiç kuramasın.
Map<String, int> freeUnits(Map<String, int> inCity, Map<String, int> promised) {
  final out = <String, int>{};
  inCity.forEach((id, n) {
    final kalan = n - (promised[id] ?? 0);
    if (kalan > 0) out[id] = kalan;
  });
  return out;
}

/// Seçilen ordunun taşıma kapasitesi. ⚠️ `carry` sunucudan gelen katalogdan okunuyor.
int carryCapacity(Map<String, int> units, int Function(String id) carryOf) {
  var toplam = 0;
  units.forEach((id, n) {
    if (n > 0) toplam += carryOf(id) * n;
  });
  return toplam;
}

/// ⭐⭐ FORM GÖNDERİLEBİLİR Mİ — tek karar, tek yerde.
///
/// ⚠️ Widget'ın içine dağılsaydı sınanamazdı ve buradaki dallanma az değil: beş bağımsız
/// koşul ve ikisi göreve özel. `train_rules.dart` ile aynı gerekçe.
///
/// ⚠️ **Sunucunun kapısı yine üstte**: `blocked` sunucudan gelen `option.enabled`ın tersi.
/// Dünya listesindeki kısayoldan doğrudan forma girilebildiği için bu kontrol ŞART — acemi
/// korumasındaki bir hedefe saldırı formu açılabilir ama gönderilemez.
bool canSendMission({
  required String type,
  required bool blocked,
  required int unitCount,
  required int heroCount,
  required bool cargoFits,
  required bool affordCargo,
  required int cargoTotal,
  required bool pending,
}) {
  if (blocked || pending) return false;
  if (!hasCrew(type, unitCount, heroCount)) return false;

  final rule = formRule(type);
  if (rule.cargo && (!cargoFits || !affordCargo)) return false;
  // ⚠️ Nakliyede kargo ZORUNLU: boş nakliyenin anlamı yok. Destek ve şehir kurmada isteğe
  // bağlı — oralarda asıl iş birlik taşımak.
  if (type == 'transport' && cargoTotal <= 0) return false;
  return true;
}

/// Görev tipi → ekranda görünen ad, simge ve kısa tanıtım (§13.14: İngilizce id görünmez).
///
/// ⚠️ Uzun kural paragrafları BİLEREK yok (web'de kullanıcı kaldırttı): formda yalnız oyuncunun
/// O AN karar vermek için ihtiyaç duyduğu sayı var (ör. kalan saldırı hakkı).
typedef MwMissionInfo = ({String title, String icon, String hint});

const Map<String, MwMissionInfo> kMissionInfo = {
  'attack': (title: 'Saldırı', icon: 'attack', hint: 'Orduyu hedefe gönder.'),
  'spy': (
    title: 'Casusluk',
    icon: 'spy_out',
    hint: 'Casus kuşlarla bilgi topla.',
  ),
  'transport': (
    title: 'Nakliye',
    icon: 'transport_out',
    hint: 'Altın ve yemek gönder.',
  ),
  'support': (
    title: 'Destek',
    icon: 'support_out',
    hint: 'Birlikleri kalıcı olarak taşı.',
  ),
  'found_city': (
    title: 'Şehir Kur',
    icon: 'found_city',
    hint: 'Buraya yeni bir şehir kur; yanında kaynak da götürebilirsin.',
  ),
  'teleport': (
    title: 'Teleport',
    icon: 'teleport',
    hint: 'Anlık transfer, kaynak taşınmaz.',
  ),
};
