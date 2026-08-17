/// ⭐⭐ DÜNYA EKRANININ KOORDİNAT ÖNCELİĞİ — hangi diyar gösterilecek.
///
/// Web'deki `lib/world-coords.ts` ile **aynı kural**, aynı gerekçe.
///
/// ⚠️⚠️ Bu kural web'de **canlı bir hataya** yol açtı (kullanıcı, 2026-08-16): «Kendi diyarıma
/// dön» düğmesi yalnız seçimi boşaltıyordu ve derin bağlantıyla açılmış sayfada YANLIŞ yere
/// gidiyordu — zincir `seçim → adres → ev` diye ilerlediği için seçim boşalınca sıra **eve
/// değil adrese** düşüyordu. Casusluk raporundan Dünya'ya geçen oyuncu düğmeye basınca kendi
/// diyarına değil raporun diyarına dönüyordu. Doğru davranış iki parçalı: seçimi bırak **ve**
/// adresi temizle.
///
/// ⚠️ Karar burada **saf bir fonksiyonda** çünkü bileşenin içinde kalsaydı ancak elle
/// tıklayarak denenebilirdi — hata tam da öyle kaçmıştı (`routing_rules.dart`, `train_rules.dart`
/// ile aynı desen).
library;

typedef MwRealm = ({int k, int d});

/// Kıta 1..10, diyar 1..500 (§13.16).
const int kMaxContinent = 10;
const int kMaxRealm = 500;

/// Ekranda gösterilecek diyar.
///
/// Öncelik: **elle seçim → adres → aktif şehir → 1:1**.
///
/// ⚠️ Adres, evin ÖNÜNDE olmak zorunda: derin bağlantıyla («Dünyada Bul», casusluk raporu,
/// bildirim) gelen oyuncu ilk açılışta hedefi görmeli, kendi diyarını değil.
///
/// ⚠️ `k` ve `d` **ayrı ayrı** çözülüyor, çift olarak değil — web'de de öyle. Oyuncu yalnız
/// kıtayı değiştirdiğinde diyar numarası yerinde kalsın diye.
MwRealm visibleCoords(MwRealm? sel, MwRealm? fromUrl, MwRealm? home) => (
  k: sel?.k ?? fromUrl?.k ?? home?.k ?? 1,
  d: sel?.d ?? fromUrl?.d ?? home?.d ?? 1,
);

/// «Kendi diyarıma dön» düğmesine basılınca ne olmalı.
///
/// ⚠️ Eve ait koordinat `sel`e **yazılmıyor**, bilerek: `sel = null` "sabitlemeyi bırak, aktif
/// şehri izle" demek. Oyuncu sonradan şehir değiştirirse görünüm onu takip etmeli; koordinatı
/// sabitleseydik takip ölürdü.
typedef MwHomeAction = ({MwRealm? sel, bool clearUrl});

MwHomeAction homeAction(MwRealm? fromUrl) =>
    (sel: null, clearUrl: fromUrl != null);

/// Adresten gelen koordinat — geçersizse `null`.
///
/// ⚠️ Kelepçeleme ATMA DEĞİL: `11:900` gibi bir adres 10:500'e kırpılıyor, reddedilmiyor.
/// Reddetseydik bozuk bir bağlantı oyuncuyu sessizce kendi diyarına atardı ve o "bağlantı
/// çalışmadı" diye okunurdu; kırpma en azından yakın bir yere götürüyor.
MwRealm? realmFromPath(String? k, String? d) {
  final ki = int.tryParse(k ?? '');
  final di = int.tryParse(d ?? '');
  if (ki == null || di == null || ki < 1 || di < 1) return null;
  return (k: ki.clamp(1, kMaxContinent), d: di.clamp(1, kMaxRealm));
}
