/// ⭐ ŞEHİR EKRANININ İSTEMCİDE TÜRETİLEN İKİ SAYACI — üretim bandı ve kaynak sayacı.
///
/// Web'deki karşılığı `apps/web/src/lib/city-progress.ts`. Davranış **vektörle kilitli**:
/// `packages/contracts/fixtures/city-progress-vectors.json` iki uygulamayı da ölçüyor.
///
/// ⚠️⚠️ İkisinin de ÇIPASI farklı ve bu, çağıranın dikkat etmesi gereken asıl şey:
///   • `unitProgress`         → `clock.gameNow()`   (`startedAt` oyun saatinde, bakımda DONAR)
///   • `extrapolateResources` → `clock.serverNow()` (yanıtın gerçek okunma anı)
/// Yanlış çıpa seçmek iki kez canlı hata üretti; gerekçeler aşağıda.
library;

/// `unitProgress`e giren alanlar — sunucunun kuyruk satırının tamamı gerekmiyor.
///
/// ⚠️ Sunucunun `done`/`remaining` alanları BİLEREK yok: onlar son okuma anındaki hâl, yani
/// tanımı gereği bayat. Tipte hiç bulunmamaları, birinin yanlışlıkla onlara dayanmasını
/// **derleme zamanında** imkânsız kılıyor.
class ProgressInput {
  const ProgressInput({
    required this.startedAt,
    required this.count,
    this.perUnitSeconds,
  });

  final String startedAt;
  final int? count;
  final num? perUnitSeconds;
}

class UnitProgress {
  const UnitProgress({
    required this.produced,
    required this.remaining,
    required this.unitStart,
    required this.unitEnd,
    required this.finished,
  });

  /// Şimdiye kadar üretilmiş adet.
  final int produced;

  /// Kalan sipariş.
  final int remaining;

  /// Sıradaki tek askerin penceresi (epoch ms).
  final int unitStart;
  final int unitEnd;

  /// Siparişin tamamı bitti (sunucudaki bitiş görevi birazdan satırı kapatacak).
  final bool finished;
}

/// ⭐ ÜRETİM BANDI — tamamen deterministik, hiçbir istek atmadan.
///
/// **Çözdüğü hata (2026-07-28, kullanıcı bildirdi):** bir askerin üretimi bitince çubuk
/// %100'de donuyor, geri sayım "birazdan"da kalıyor ve **bir sonraki sunucu okumasına kadar**
/// yenilenmiyordu. Yoklama 5 sn'den 60 sn'ye indirildiği için bu, anlık bir takılmadan
/// **bir dakikalık donmaya** dönüşmüştü.
///
/// **Neden WS ile değil:** üretim **tembeldir** (tick YOK). Sunucu bir askerin üretildiğini
/// ancak şehir okunduğunda fark ediyor; asker başına olay yayınlaması için her aktif kuyruğa
/// zamanlayıcı koymak, yani mimarinin temel kararını geri almak gerekirdi.
///
/// **Neden asker başına istek de değil:** yüksek Baraka'da 1 sn'lik birimde **dakikada 60
/// istek** ederdi.
///
/// ⚠️⚠️ `now` **oyun saati** olmalı. Bir ara gerçek saat kullanıldı ve canlıda görünen bir
/// hataydı: sayaç dünyanın toplam duraklama süresi kadar ileri gidiyor (canlıda ~196 sn) ve
/// `perUnitSeconds` bundan küçük olan birimlerde bant **kalıcı olarak "sipariş tamamlandı"**
/// gösteriyordu.
UnitProgress? unitProgress(ProgressInput q, int now) {
  final perMs = (q.perUnitSeconds ?? 0) * 1000;
  final count = q.count ?? 0;
  if (perMs <= 0 || count <= 0) return null;

  final start = DateTime.tryParse(q.startedAt)?.millisecondsSinceEpoch;
  if (start == null) return null;

  // ⚠️ `floor` — `truncate` DEĞİL. `now` başlangıçtan önceyse (cihaz saati sapmışsa) ikisi
  // farklı sonuç verir; sıfır kelepçesi ikisini de 0 yapıyor ama kural JS'teki `Math.floor`
  // ile aynı kalsın diye açıkça `floor` yazılı.
  final ham = ((now - start) / perMs).floor();
  final produced = ham < 0 ? 0 : (ham > count ? count : ham);
  final unitStart = start + (produced * perMs).toInt();

  return UnitProgress(
    produced: produced,
    remaining: count - produced,
    unitStart: unitStart,
    unitEnd: unitStart + perMs.toInt(),
    finished: produced >= count,
  );
}

class ResourceInput {
  const ResourceInput({
    required this.gold,
    required this.food,
    required this.goldPerHour,
    required this.foodPerHour,
    required this.serverNow,
  });

  final num gold;
  final num food;
  final num goldPerHour;
  final num foodPerHour;

  /// Sunucunun bu değerleri okuduğu an (yanıttaki `serverNow`).
  final String serverNow;
}

/// ⭐ KAYNAK SAYACI — yoklamayla değil, üretim hızıyla **ekstrapolasyonla** akar.
///
/// Sunucu kaynağı tembel biriktiriyor; istemci aradaki saniyeleri saniyede bir çiziyor.
/// Otorite yine sunucu: çıpa her okumada tazeleniyor.
///
/// ⚠️ Tatil kontrolü YOK ve olmamalı: sunucu tatilde hızları **0** döndürüyor, sayaç
/// kendiliğinden duruyor. Ayrıca kontrol koymak «0/sa ⇒ tatilde» yanlış çıkarımını koda
/// sokardı — madeni olmayan yeni bir şehrin de üretimi 0'dır.
///
/// ⚠️ Bilinen küçük tutarsızlık: dünya BAKIMDA iken oyun saati donuyor ama bu sayaç gerçek
/// saatle akmaya devam ediyor ve sonraki okumada geri sıçrıyor. **Web'de de aynen böyle** ve
/// bilerek aynı bırakıldı: iki istemcinin ayrışması, bir ekranın bakım sırasında birkaç dakika
/// şişkin görünmesinden pahalı. Düzeltilecekse İKİ tarafta birden.
///
/// ⚠️ Negatif geçen süre sıfıra kelepçeleniyor: cihaz saati sunucunun gerisindeyse sayaç
/// **geriye** akardı.
({num gold, num food}) extrapolateResources(ResourceInput r, int now) {
  final anchor = DateTime.tryParse(r.serverNow)?.millisecondsSinceEpoch;
  final gecenSaat = anchor == null
      ? 0.0
      : (() {
          final h = (now - anchor) / 3600000;
          return h < 0 ? 0.0 : h;
        })();

  return (
    gold: r.gold + r.goldPerHour * gecenSaat,
    food: r.food + r.foodPerHour * gecenSaat,
  );
}
