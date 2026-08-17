/// ⭐⭐ HAREKET KURALLARI — başlık · renk · rozet · ordu dökümü. **Saf fonksiyonlar.**
///
/// Web'deki `components/movements.tsx` (metin ve renk) ile `queries.ts` · `armiesBadge`
/// karşılığı. Dört ayrı yer bunları okuyor — liste satırı, şerit simgesi, detay sheet'i ve alt
/// bardaki rozet — yani kural widget'ın içine yazılsaydı dördü kaçınılmaz olarak ayrışırdı.
/// Aynı gerekçeyle `train_rules.dart` de saf: ekranda ölçülemeyen karar, ölçülmeyen karardır.
library;

import 'movement.dart';

/// Görev tipi → Türkçe ad.
///
/// ⚠️ Bu adlar `titleOf`ta **cümle içinde** kullanılıyor («Şehir kurma gidiyor»), o yüzden
/// yalnız ilk harf büyük — başlık kalıbı değil. Büyütme gerekiyorsa `mwUpper` çağıran yapar.
const Map<String, String> kMissionLabel = {
  'attack': 'Saldırı',
  'return': 'Dönüş',
  'transport': 'Nakliye',
  'support': 'Destek',
  'spy': 'Casusluk',
  'found_city': 'Şehir kurma',
  'teleport': 'Teleport',
  // ⭐ Mağara işleri (§13.20): üçü de şehrin İÇİNDE geçer, hedef ve kaynak aynı şehirdir.
  'cave_store': 'Mağaraya giriş',
  'cave_withdraw': 'Mağaradan çıkış',
  'cave_return': 'Mağaradan kaçış',
};

/// `1:3:1` — koordinat yoksa uzun tire.
///
/// ⚠️ Boş dize DEĞİL: koordinatsız bir satırda ekranda «→» tek başına kalır ve oyuncu
/// verinin yüklenmediğini sanır. «—» "burada koordinat yok" diyor.
String coordText(MwCoords? c) => c == null ? '—' : '${c.k}:${c.d}:${c.s}';

/// Hareketin tonu — tek soruya cevap: **bu bana bir tehdit mi?**
///
/// ⚠️ Web ton yerine bir Tailwind sınıf adı döndürüyor (`text-danger`); Dart'ta o dize hiçbir
/// şey ifade etmez. Kural aynı, taşıyıcısı bir enum: rengi `MwColors`tan çağıran seçiyor.
enum MwTone { danger, warning, success }

/// ⭐ Tehlikeli GELEN görevler. Diğer her gelen dostanedir.
const Set<String> kHostileIncoming = {'attack', 'spy'};

/// ⭐ HAREKETİN RENGİ (kullanıcı, 2026-08-04: *"giden destekte turuncu, gelen destekte kırmızı
/// renk görünüyor"*).
///
/// ⚠️ **NE VARDI:** renk yalnız YÖNE bakıyordu — gelen kırmızı, giden turuncu. Bu, "gelen" ile
/// "tehdit"i eşitliyordu ve ikisi aynı şey değil: müttefikin gönderdiği destek de "gelen"dir.
/// Oyuncu ekranda kırmızı görüp paniğe kapılıyor, sonra hediyeyle karşılaşıyordu.
///
/// Kural üç satır:
///   • **Bana gelen ve düşmanca** (saldırı, casusluk) → kırmızı
///   • **Bana gelen ve dostane** (destek, nakliye, mağaradan kaçış) → turuncu
///   • **Benim hareketim** (giden, dönen, şehir içi) → yeşil
///
/// ⚠️ Tür `m.type`ten okunuyor ve o **sunucuda maskelenmiş** hâl: koordinatıma gelen bir
/// `found_city` bana `attack` görünüyor, rengi de kırmızı çıkıyor — doğrusu bu, çünkü oyuncunun
/// gördüğü şey bir saldırı ve maske renkte delinmemeli.
MwTone movementTone(Movement m) {
  if (m.direction != 'in') return MwTone.success;
  return kHostileIncoming.contains(m.type) ? MwTone.danger : MwTone.warning;
}

/// Hareketin başlığı — **görevin TANIMI**, tek kaynak.
///
/// Liste önizlemesi, şerit simgesi ve detay sheet'i üçü de buradan besleniyor. ⚠️ Ayrı bir
/// "önizleme etiketi" fonksiyonu YAZILMADI: ikinci bir metin kaynağı kaçınılmaz olarak
/// birincisinden kayardı (web'de aynı karar, bildirim kataloğuyla aynı kural).
///
/// Dönüş bacağında **hangi görevden dönüldüğü** yazılır («Casusluk dönüşü»), çünkü simge de
/// aslına göre seçiliyor — sadece «Dönüş» deseydik simge ile metin çelişirdi.
String titleOf(Movement m) {
  if (m.direction == 'own' && m.returnOf != null) {
    final ad = kMissionLabel[m.returnOf] ?? m.returnOf!;
    return '$ad dönüşü${m.canceled ? ' (iptal edildi)' : ''}';
  }
  final ad = kMissionLabel[m.type] ?? m.type;
  // Mağara işlerinde yön eki anlamsız: karşı taraf yok, hareket şehrin kendi içinde.
  if (m.type.startsWith('cave_')) return ad;
  return m.direction == 'in' ? '$ad yaklaşıyor' : '$ad gidiyor';
}

/// ⭐ ORDULAR ROZETİ (kullanıcı, 2026-07-28) — sayı **tüm hareketlerin toplamı**, renk ise
/// "ekrana bakmadan ne bekliyorum" sorusunun cevabı:
///   🔴 en az bir **bize gelen saldırı/casusluk** varsa (tehdit her şeyi ezer)
///   🟢 tehdit yok ama **bizim başlattığımız** bir hareket varsa (dönüşler dahil)
///   🟡 yalnızca **bize gelen nakliye/destek** varsa
///
/// ⭐ Mağara işleri `direction: 'in'` taşır ve saldırı/casusluk olmadıkları için doğal olarak
/// **sarı** düşer; oyuncunun kendi seferi varsa yeşil onu ezer — istenen sıra zaten kuralın
/// içinde, ayrı bir özel durum yazmaya gerek kalmadı.
///
/// ⚠️ Hareket yoksa `null` — `(count: 0)` DEĞİL. Rozet çizen taraf "sıfır mı?" diye ayrıca
/// bakmak zorunda kalmasın; yokluk tek biçimde ifade ediliyor.
({int count, MwTone tone})? armiesBadge(List<Movement> movements) {
  if (movements.isEmpty) return null;
  final tehdit = movements.any(
    (m) => m.direction == 'in' && kHostileIncoming.contains(m.type),
  );
  if (tehdit) return (count: movements.length, tone: MwTone.danger);
  final benim = movements.any(
    (m) => m.direction == 'out' || m.direction == 'own',
  );
  return (
    count: movements.length,
    tone: benim ? MwTone.success : MwTone.warning,
  );
}

/// ⭐ TEHDİT ALTINDAKİ ŞEHİRLERİM — şeritteki kırmızı alarm noktası bunu okuyor.
///
/// ⚠️ `movementTone` ile aynı kuraldan besleniyor ama **şehir kimliğine** indiriyor: soru
/// "bu hareket tehdit mi" değil, *"hangi kalemin altında alarm yansın"*. İkisini ayrı ayrı
/// yazmak, biri düzeltilip diğeri unutulduğunda şeridin listeyle çelişmesi demekti.
///
/// ⚠️ Çıpa `m.cityId` ve o **benim şehrim** (gelende hedef, gidende kaynak). Koordinattan
/// eşleştirmeye kalksaydık, kendi şehrime gönderdiğim nakliye de "gelen" sayılırdı.
Set<int> threatenedCityIds(List<Movement> movements) => {
  for (final m in movements)
    if (m.direction == 'in' && kHostileIncoming.contains(m.type)) m.cityId,
};

/// `{dwarf: 407}` → «Cüce 407» — ordu dökümü.
///
/// ⚠️ Ad çözümü **dışarıdan** geliyor (`catalogNamesProvider`): katalog Dart'a üretilmiyor,
/// çünkü değerleri ve adları dünya başına override edilebiliyor (`catalog_model.dart` başlığı).
/// ⚠️ Sıfır adet ELENİYOR: sunucu ölen birimi anahtarıyla göndermeye devam edebilir ve
/// «Cüce 0» satırı orduyu olduğundan kalabalık gösterirdi.
String describeUnits(
  Map<String, int> counts,
  String Function(String id) nameOf,
  String Function(int n) fmt,
) {
  final parts = <String>[];
  counts.forEach((id, n) {
    if (n > 0) parts.add('${nameOf(id)} ${fmt(n)}');
  });
  return parts.join(' · ');
}

/// `[(name: 'Baturalp', level: 7)]` → «⚔ Baturalp sv 7».
String describeHeroes(List<MwHero> heroes) =>
    heroes.map((h) => '⚔ ${h.name} sv ${h.level}').join(' · ');

/// ⛔ **BU DOSYADA SIRALAMA FONKSİYONU YOK — bilinçli.**
///
/// Hareketler şehrin altına **asıldıkları sırayla** dizilir (kullanıcı kuralı) ve o sıra
/// sunucudan hazır geliyor: `mission.controller.ts` sorgusu `ORDER BY m.created_at, m.id`.
/// İstemcide ikinci bir sıralama yazmak, aynı kuralın ayrışabilecek bir kopyası olurdu.
///
/// ⚠️ Varış sırasına dizmek **yanlış olurdu**: simgeler her saniye yer değiştirir ve oyuncunun
/// dokunmak üzere olduğu simge parmağının altından kayardı.
///
/// ⚠️ Bir ara `sortByArrival` vardı ve metinli listeyi besliyordu; liste kullanıcı kararıyla
/// kaldırılınca (2026-08-17) çağıransız kaldı, testleriyle birlikte silindi.
