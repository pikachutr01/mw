/// ⭐⭐ İSTEMCİ SAATİ — `serverNow` / `gameNow` ve geri sayım biçimleri.
///
/// Web'deki karşılığı `apps/web/src/lib/hooks.ts`. Davranış **vektörle kilitli**:
/// `packages/contracts/fixtures/clock-vectors.json` iki uygulamayı da ölçüyor.
///
/// ⚠️⚠️ Bu ailenin hatası soyut değil, canlıda **iki kez** çıktı (`BASLANGIC.md` tuzak tablosu):
/// 2026-08-02'de casusluk geri sayımı sürekli «varıyor» yazdı, 2026-08-07'de asker üretim
/// sayacı kalıcı olarak «sipariş tamamlandı» gösterdi. İkisinin de sebebi aynı: **oyun
/// saatindeki bir damgayı gerçek saatle karşılaştırmak.**
///
/// İki saat, iki iş:
///   • `serverNow` — sunucunun gerçek saati (cihaz saati + ölçülen sapma). Geçmiş kayıtları
///     (sohbet damgaları) bununla yaşlanır; bakımda da akmaya devam eder.
///   • `gameNow`   — oyun saati. Geri sayımların TAMAMI bunu kullanır ve **bakımda DONAR**.
///
/// ⚠️ Cihaz saati sunucununkinden dakikalarca sapabiliyor; hiçbir hesap ham `DateTime.now()`
/// kullanmamalı. Sapma bir kez ölçülüp her okumaya ekleniyor.
library;

/// ⚠️ Bakım eşiği — `packages/contracts/fixtures/clock-vectors.json` · `pauseThresholdMs` ile
/// **aynı sayı** ve orada gerekçesiyle yazılı. Tek zaman çizgisinde `gameNow` ile `serverNow`
/// arasında duraklama dışında meşru bir fark yok; 2 sn ağ gecikmesi ve sorgu süresi için pay.
const int kPauseThresholdMs = 2000;

/// Zaman çıpaları. ⚠️ Tekil (singleton) DEĞİL, sağlayıcıdan geçiyor: testte sahte bir cihaz
/// saatiyle kurulabilmesi şart — bu dosyanın ölçtüğü şeylerin çoğu "saat kaç" sorusunun
/// cevabına bağlı.
class MwClock {
  MwClock({int Function()? deviceNow})
    : _deviceNow = deviceNow ?? (() => DateTime.now().millisecondsSinceEpoch);

  final int Function() _deviceNow;

  /// Sunucu saati − cihaz saati. Her okumaya ekleniyor.
  int _skewMs = 0;

  /// Bakımda donmuş an; dünya çalışıyorsa `null`.
  int? _pausedAtMs;

  /// Sunucunun yanıtındaki damgaları işler.
  ///
  /// ⚠️ `gameNow` verilmeyen uçlar bakım durumunu **bozmamalı**, yalnız güncellememeli:
  /// uçların çoğu `serverNow` gönderiyor ama `gameNow` göndermiyor ve onların her biri
  /// perdeyi sessizce kaldırırdı.
  void noteServerTime(String? serverNowIso, [String? gameNowIso]) {
    final s = DateTime.tryParse(serverNowIso ?? '')?.millisecondsSinceEpoch;
    if (s == null) return;
    _skewMs = s - _deviceNow();

    if (gameNowIso == null) return;
    final g = DateTime.tryParse(gameNowIso)?.millisecondsSinceEpoch;
    if (g == null) return;
    // Sunucu bakımdaysa `gameNow` donmuş `paused_at`i taşır → belirgin biçimde geride kalır.
    // ⚠️ `>` — `>=` DEĞİL: tam eşikte duraklama sayılmaz (vektörle kilitli).
    _pausedAtMs = s - g > kPauseThresholdMs ? g : null;
  }

  /// ⭐ Bakım durumunu DOĞRUDAN bildirir — `world:maintenance` WS olayı için.
  ///
  /// ⚠️ `noteServerTime`in eşik sezgisinden daha kesin: perde açılır açılmaz geri sayımlar
  /// donsun diye olay geldiği anda çağrılıyor, sunucunun bir sonraki yanıtı beklenmiyor.
  void noteMaintenance(bool paused, [String? pausedAtIso]) {
    if (!paused) {
      _pausedAtMs = null;
      return;
    }
    // Damga yoksa "şimdi"ye donduruyoruz: yanlış an, ama akmaya devam etmekten iyi.
    _pausedAtMs =
        DateTime.tryParse(pausedAtIso ?? '')?.millisecondsSinceEpoch ??
        serverNow();
  }

  /// Sunucunun gerçek saati (cihaz saati + ölçülen sapma).
  int serverNow() => _deviceNow() + _skewMs;

  /// Oyun saati — geri sayımların TAMAMI bunu kullanmalı. Bakımda DONAR.
  int gameNow() => _pausedAtMs ?? serverNow();

  /// Kalan süre, `2 sa 04 dk 17 sn` biçiminde. Bitmişse `null`.
  ///
  /// ⚠️ Varsayılan çıpa **oyun saati**: geri sayımı çizilen damgaların hepsi o ölçekte.
  /// Gerçek zamanda tutulan bir değer için `now` AÇIKÇA geçilmeli.
  String? remaining(String? iso, {int? now}) =>
      _left(iso, now ?? gameNow(), formatDuration);

  /// `remaining` ile aynı, yalnız günlerce süren aralıklar için.
  ///
  /// ⚠️ Varsayılan çıpa **gerçek saat** — `remaining`in TERSİ ve bu bilinçli asimetri web'den
  /// bire bir taşındı: tek çağıranı tatil paneli ve oradaki damga gün ölçeğinde.
  String? remainingLong(String? iso, {int? now}) =>
      _left(iso, now ?? serverNow(), formatLongDuration);

  /// `remaining` ile aynı, yalnız saat biçiminde (`04:31`).
  String? remainingClock(String? iso, {int? now}) =>
      _left(iso, now ?? gameNow(), formatClock);

  /// ⭐ Geçmişe bakan göreli süre — sohbet damgaları.
  ///
  /// ⚠️⚠️ Çıpa `serverNow()`, `gameNow()` DEĞİL — ve bu, ekranın geri kalanının tam tersi.
  /// Sohbet damgası bir oyun olayı değil, **geçmiş kaydıdır**; bakım kaydırmasından
  /// etkilenmez. `gameNow()` kullansaydık bakım boyunca bütün mesajların yaşı DONARDI.
  String timeAgo(String? iso, {int? now}) =>
      formatTimeAgo(iso, now: now ?? serverNow());

  static String? _left(String? iso, int now, String Function(num) bicim) {
    if (iso == null) return null;
    final t = DateTime.tryParse(iso)?.millisecondsSinceEpoch;
    if (t == null) return null;
    final ms = t - now;
    if (ms <= 0) return null;
    return bicim(ms / 1000);
  }
}

/// ⚠️ TS'teki `Math.max(0, Math.round(x))`ın karşılığı.
///
/// Dart `.round()` yarımı sıfırdan UZAĞA yuvarlıyor (`(-2.5).round() == -3`), JS ise
/// `+∞`a (`Math.round(-2.5) === -2`). Fark yalnız negatif yarımlarda var ve buradaki
/// sıfır kelepçesi onların hepsini zaten 0'a indiriyor — yani iki dil aynı sonucu veriyor.
/// Ölçüldü değil, türetildi; vektörlerdeki `-5` girdisi de bunu ekranda doğruluyor.
int _saniye(num totalSeconds) {
  final r = totalSeconds.round();
  return r < 0 ? 0 : r;
}

String _pad(int n) => n.toString().padLeft(2, '0');

/// ⭐ **Saniye hassasiyeti her zaman** (kullanıcı kararı): saatlik geri sayımlarda da saniye
/// yazar. Önceden `2 sa 04 dk` gösteriliyordu; oyuncu ekrana bakıp *"donmuş mu?"* diye
/// tereddüt ediyordu ve son dakikaya kadar varışın tam anını göremiyordu.
String formatDuration(num totalSeconds) {
  final s = _saniye(totalSeconds);
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final sec = s % 60;
  if (h != 0) return '$h sa ${_pad(m)} dk ${_pad(sec)} sn';
  if (m != 0) return '$m dk ${_pad(sec)} sn';
  return '$sec sn';
}

/// ⭐ **GÜNLERCE SÜREN** geri sayımlar için kaba biçim: `29 gün 23 sa`.
///
/// ⚠️ `formatDuration`ın YERİNE GEÇMEZ, yanına konuldu. Oradaki «saniye hassasiyeti her zaman»
/// kuralı ordu hareketleri için doğru; ama tatilin 30 günlük üst sınırı o biçimde
/// **`719 sa 59 dk 00 sn`** diye çıkıyor — okunmuyor, üstelik saniyesi boş yere titriyor.
String formatLongDuration(num totalSeconds) {
  final s = _saniye(totalSeconds);
  if (s < 86400) return formatDuration(s);
  final gun = s ~/ 86400;
  final sa = (s % 86400) ~/ 3600;
  return sa != 0 ? '$gun gün $sa sa' : '$gun gün';
}

/// Dar yerler için **saat biçimi**: `04:31` · `2:04:27`. Orijinal oyunun kendi gösterimi budur
/// (`images/scr_mobil02`) ve saniye hassasiyetini kaybetmeden simgenin altına sığıyor.
String formatClock(num totalSeconds) {
  final s = _saniye(totalSeconds);
  final h = s ~/ 3600;
  final rest = '${_pad((s % 3600) ~/ 60)}:${_pad(s % 60)}';
  return h != 0 ? '$h:$rest' : rest;
}

/// ⭐ `3 saniye önce` · `12 dakika önce` · `4 gün önce` · `2 ay önce`.
///
/// ⚠️ `remaining` ailesinin **tersi**: o geleceğe bakar ve geçmiş bir damgaya `null` döner;
/// bu geçmişe bakar ve GELECEK bir damgayı «az önce» sayar — sunucu ile cihaz saati
/// arasındaki küçük kayma yüzünden yeni gönderilmiş bir mesaj birkaç saniye ileride
/// görünebiliyor ve *"-2 saniye önce"* yazmak kabul edilemez.
///
/// ⚠️ Ay = 30 gün, yıl = 365 gün (yaklaşık). Takvim doğruluğu gerekmiyor: «2 ay önce» zaten
/// kaba bir ifade.
String formatTimeAgo(String? iso, {required int now}) {
  if (iso == null) return '—';
  final t = DateTime.tryParse(iso)?.millisecondsSinceEpoch;
  if (t == null) return '—';

  final s = _saniye((now - t) / 1000);
  if (s < 60) return '${s < 1 ? 1 : s} saniye önce';

  final dk = s ~/ 60;
  if (dk < 60) return '$dk dakika önce';

  final sa = dk ~/ 60;
  if (sa < 24) return '$sa saat önce';

  final gun = sa ~/ 24;
  if (gun < 30) return '$gun gün önce';

  final ay = gun ~/ 30;
  if (ay < 12) return '$ay ay önce';

  return '${gun ~/ 365} yıl önce';
}
