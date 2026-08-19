/// ⭐⭐ KOMUTA MERKEZİ KURALLARI — sıra değişimi · anlık görüntü notu · tablo hücresi ·
/// sayfa kelepçesi · arama sorgusu. **Saf fonksiyonlar.**
///
/// ⚠️ Buradaki kararların üçü de ekranda **sessizce yanlış** olabilecek türden: seviye taşıyan
/// bir kalemi adet gibi yazmak, sırası olmayan oyuncuya «0.» demek, sunucunun kabul etmeyeceği
/// bir aramayı göndermek. Üçü de testle kilitli.
library;

import '../../gen/facts.g.dart';

/// Sıra değişiminin yönü — rengi çağıran seçiyor.
///
/// ⚠️ `null` (önceki anlık görüntü yok) ile `0` (değişmedi) **ayrı**: ilki "henüz
/// karşılaştıracak bir şey yok", ikincisi "karşılaştırdık, aynı". İkisini birleştirmek yeni
/// oyuncuya "sıran değişmedi" demek olurdu.
enum MwChangeTone { neutral, up, down }

MwChangeTone changeTone(int? change) {
  if (change == null || change == 0) return MwChangeTone.neutral;
  return change > 0 ? MwChangeTone.up : MwChangeTone.down;
}

/// ⭐ Orijinalde değişim sütunu çıplak bir sayı (0, 2, -1); yönü okunur kılmak için ok
/// ekleniyor (web'le aynı kalıp).
///
/// ⚠️ Veri yoksa «-» — «0» DEĞİL: sıfır "değişmedi" diye okunur ve bu, hiç ölçülmemiş bir
/// oyuncu için yanlış bir iddia olurdu.
String changeMark(int? change) {
  if (change == null) return '-';
  if (change == 0) return '0';
  return change > 0 ? '▲$change' : '▼${-change}';
}

/// «5 / 812» — sıra ve toplam. ⚠️ Sıra yoksa «—»: `0` yazmak "en kötü sıradasın" gibi
/// okunurdu, oysa oyuncu henüz hiç sıralanmamış.
String rankText(int? rank, int total) => rank == null ? '—' : '$rank / $total';

/// ⭐ ANLIK GÖRÜNTÜ NOTU — puanın ve sıranın neden donuk olduğunu ekranda söyler.
///
/// ⚠️⚠️ Bu not olmadan oyuncu puanını artırıp sırasının değişmemesini **hata sanıyor**
/// (§13.17.2, canlıda bildirildi). Notun kendisi de bir dönem yalan söylemişti: yanındaki
/// puan canlı sütundan geliyordu ve saniyesinde değişiyordu. Artık iki sayı da aynı anlık
/// görüntüden.
///
/// ⚠️ «sıradaki güncelleme» BİLEREK yok (kullanıcı, 2026-08-03): oyuncunun bilmesi gereken
/// tek şey verinin ne kadar taze olduğu, ileriye dönük bir takvim değil.
String snapshotNote({required String? takenAt, required String nextAt}) {
  final t = takenAt;
  if (t != null && t.isNotEmpty) return 'güncelleme ${_hhmm(t)}';
  return 'ilk güncelleme ${_hhmm(nextAt)}';
}

/// ⚠️⚠️ **SAAT TÜRKİYE SAATİNDE** (kullanıcı, 2026-08-04 — ikinci bildirimi).
///
/// Web'de bir dönem `timeZone: 'UTC'` zorlanıyordu; gerekçe "oyunun kuralları UTC'de yaşıyor"
/// idi ve kendi içinde tutarlıydı ama YANLIŞ tarafı seçmişti: ekranı kuralın saatine
/// taşıyordu. Sonuç, oyuncunun 22:51'de tetiklediği sıralamayı ekranda **19:51** görmesiydi.
///
/// ⚠️ Dart'ta IANA saat dilimi desteği **paket ister** (`timezone`, ~1 MB veri). Onun yerine
/// damga `toLocal()` ile cihazın saatine çevriliyor: oyuncu zaten Türkiye'de ve cihaz saati
/// oyunun saatiyle aynı. ⚠️ Yurt dışındaki bir oyuncuda bu ayrışır — kabul edilen bir
/// yaklaşım, çünkü alternatifi tek bir «hh:mm» için megabaytlık bir bağımlılık.
String _hhmm(String iso) {
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '—';
  return '${t.hour.toString().padLeft(2, '0')}:'
      '${t.minute.toString().padLeft(2, '0')}';
}

/// ⭐ TABLO HÜCRESİ — adet mi seviye mi?
///
/// ⚠️⚠️ Sur, Büyü Kalkanı ve Tapınak `defenses` tablosunda **SEVİYE** tutuyor, adet değil
/// (§13.11.1b). Çıplak sayı yazsaydık «Sur 5» beş adet sur gibi okunurdu.
/// ⚠️ Küme `facts.g.dart`ten ÜRETİLİYOR (`kLevelBased`), elle yazılmıyor: katalog değişirse
/// istemcinin sessizce yanlış kalmaması için (`facts:check` kapısı).
String cellAmount(String id, int n, String Function(int) fmt) =>
    kLevelBased.contains(id) ? 'sv. $n' : fmt(n);

/// ⭐ TOPLAM SÜTUNU — seviye taşıyan kalemler **toplanamaz**.
///
/// ⚠️ Üç şehirde 5'er seviye sur «15 sur» demek değil. Web de burada «-» yazıyor.
String totalAmount(String id, int n, String Function(int) fmt) =>
    kLevelBased.contains(id) ? '-' : fmt(n);

/// Tabloda gösterilecek satırlar — **hiç sahip olunmayan tür elenir**.
///
/// ⚠️ Süzgeç TOPLAMA bakıyor, tek tek şehirlere değil: bir şehirde 0 olan birim başka bir
/// şehirde varsa satır kalmalı, yoksa oyuncu o birimi hiç göremezdi.
List<({String id, String name})> ownedTypes(
  List<({String id, String name})> types,
  Map<String, int> totals,
) => [
  for (final t in types)
    if ((totals[t.id] ?? 0) > 0) t,
];

/// Sıralama sayfası kelepçesi. ⚠️ Sayfa **1 tabanlı** (sunucu da öyle) — posta kutusunun
/// 0 tabanlı sayfalamasıyla karıştırma; ikisi ayrı uç ve ayrı sözleşme.
int clampRankingPage(int page, int pages) {
  if (page < 1) return 1;
  final son = pages < 1 ? 1 : pages;
  return page > son ? son : page;
}

/// ⭐ ARAMA SORGUSU GEÇERLİ Mİ?
///
/// ⚠️ Sunucu 2 karakterden kısa sorguda **boş liste** dönüyor (`prefixPattern` indeksi ancak
/// önekle çalışıyor). İstemci bunu bilmeden istek atsaydı oyuncu "sonuç yok" görür ve aramanın
/// bozuk olduğunu sanardı — kutunun altında sebebi yazmak dürüst olan.
///
/// ⚠️ **Kırpılmış** uzunluk: iki boşluk yazmak aramayı başlatmamalı.
bool canSearch(String query) => query.trim().length >= 2;

/// ⭐ ASKERÎ UNVAN — basamak → rozet dosyası ve Türkçe adı.
///
/// ⚠️ Tablo `facts.g.dart`ten üretiliyor. Elle yazılsaydı rozet **sessizce** çizilmezdi:
/// `MwIcon` bulunamayan dosyada hata vermiyor, aynı ölçüde boşluk bırakıyor.
/// ⚠️ Bilinmeyen basamak `null` — sunucuya yeni bir unvan eklenirse ekran boş rozet çizmek
/// yerine satırı hiç çizmiyor.
({String id, String name})? meritOf(int? tier) =>
    tier == null ? null : kMeritTiers[tier];
