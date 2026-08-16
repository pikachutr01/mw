/// ⭐ AKTİVİTE NOKTALARI — aktif şehirde süren iş varsa ilgili sekmede küçük yeşil nokta.
///
/// Web'deki `lib/city-activity.tsx` · `cityActivity` karşılığı ve **aynı kuralları** taşıyor
/// (kullanıcı, 2026-08-17: *"web tarafında olduğu gibi hangi sayfada aktif yükseltme veya
/// üretim varsa o sayfanın bağlantısında yeşil bir nokta görünür"*).
///
/// ⚠️ **ŞEHİR BAZLI**: başka şehre geçince o şehrin işleri okunuyor. Oyuncunun bir başka
/// şehrindeki üretim burada nokta yakmaz — nokta "şu an baktığın şehirde ne oluyor" sorusunun
/// cevabı.
///
/// ⚠️ Saf fonksiyon ve ayrı dosyada, deponun deseni: bir widget'ın `build`ine gömülseydi
/// sınanamazdı. Web'de ayrılma sebebi ek olarak **döngüsel bağımlılıktı** (`Shell → CityTabs →
/// Shell`); mobilde de üç tüketici olacak (sekme şeridi · Şehir listesi · ileride sol menü) ve
/// ortak yaprak modül aynı döngüyü baştan imkânsız kılıyor.
library;

import '../features/city/city_model.dart';

/// Rota → o şehirde o ekrana ait süren iş var mı?
///
/// ⚠️ **Akademi noktası araştırmayı BAŞLATAN şehirde yanar.** Akademiler ortak, yani teknik
/// başka şehirde de araştırılıyor olabilir; ama iptal yalnız başlatan şehirden yapılıyor ve
/// nokta oyuncuyu **eyleme götürebileceği** yere çağırmalı. Bu yüzden `cityId` süzgeci şart.
///
/// ⚠️ Savunma noktası sur ONARIMINDA da yanıyor: onarım bir emir değil ama şehirde süren bir
/// iş ve oyuncunun görmesi gereken bir durum.
///
/// ⚠️ Mağara (Yapılar) ve Tapınak (kahraman diriltme) alanları `CityDetail`te henüz yok;
/// eklendiklerinde bu tablo büyüyecek. Bugün yazmamak, olmayan veriye dayanan sessiz bir
/// yanlıştan iyi.
Map<String, bool> cityActivity(CityDetail? d, int? cityId) {
  if (d == null) return const {};
  return {
    '/barracks': d.queues.any((q) => q.category == 'unit'),
    '/defense':
        d.queues.any((q) => q.category == 'defense') || d.wallRepair != null,
    '/buildings': d.queues.any((q) => q.category == 'building'),
    '/academy': d.techQueues.any((q) => q.cityId == cityId),
  };
}
