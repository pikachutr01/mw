/// API İSTEMCİSİ — başlıklar, yenileme ve hata sınıflandırması.
///
/// Web'deki karşılığı `apps/web/src/lib/api.ts`. Üç davranış bire bir taşınıyor, üçü de gerçek
/// hatalardan doğdu (MOBIL_MIMARI.md §3.4):
///
///   1. **Yenileme uçuşta tek söz** — iki eşzamanlı 401 iki yenileme başlatırsa, ikincisi
///      artık iptal edilmiş jetonla gider ve OTURUMU DÜŞÜRÜR.
///   2. **Oturum yalnız GERÇEK reddde düşer (401/403).** 502/503 geçici arızadır ve kimlik
///      doğrulama kararı değildir; eskiden her `!ok` oturumu siliyordu ve API yeniden
///      başlarken oyuncu jetonu hâlâ geçerliyken giriş ekranına atılıyordu.
///   3. **409 `session_conflict`** ayrı ele alınır — hata fırlatılır AMA oturum korunur;
///      oyuncuya "bu cihazda devam et" seçeneği sunulacak.
library;

import 'dart:async';

import 'client_hints.dart';
import 'device_identity.dart';
import 'session.dart';

/// Ham taşıma — **dikiş**. Üretimde dio, testte fixture döndüren bir fonksiyon.
/// ⚠️ Mock değil: beklenti/`verify` yok, gerçek bayt/JSON akıyor.
typedef Gonderici = Future<HamYanit> Function(HamIstek istek);

class HamIstek {
  const HamIstek({
    required this.yontem,
    required this.yol,
    required this.basliklar,
    this.govde,
  });

  final String yontem;
  final String yol;
  final Map<String, String> basliklar;
  final Object? govde;
}

class HamYanit {
  const HamYanit(this.durum, [this.govde]);

  final int durum;
  final Object? govde;

  bool get basarili => durum >= 200 && durum < 300;
}

/// API hatası. `code` sunucunun makine-okur kodu (`maintenance`, `session_conflict`,
/// `email_unverified`, `rate_limited` …).
class MwApiHatasi implements Exception {
  const MwApiHatasi(this.durum, this.mesaj, {this.code, this.govde});

  final int durum;
  final String mesaj;
  final String? code;
  final Object? govde;

  @override
  String toString() =>
      'MwApiHatasi($durum${code == null ? '' : ' $code'}): $mesaj';
}

/// Tek cihaz çakışması — oturum DÜŞMEZ, oyuncuya devralma seçeneği sunulur.
class OturumCakismasi {
  const OturumCakismasi({this.platform, this.gorulme});

  final String? platform;
  final String? gorulme;
}

class MwApi {
  MwApi({
    required Gonderici gonderici,
    required OturumDeposu oturumDeposu,
    required CihazKimligi kimlik,
    required IstemciKunyesi kunye,
    this.onCakisma,
    this.onOturumDustu,
    DateTime Function()? saat,
    Future<void> Function(Duration)? bekle,
    // ⚠️ Aşağıdaki iki `ignore` gerçek bir yanlış öneriyi susturuyor: `prefer_initializing_formals`
    // `required this._kimlik` diyor, ama o adlandırılmış parametreyi `_kimlik:` yapar ve Dart
    // **alt çizgiyle başlayan adlandırılmış argümanı kabul etmiyor** — çağrı DERLENMİYOR
    // (ölçüldü, 2026-08-15). Alan private olmalı, parametre public; ikisi aynı ad olamaz.
  }) : _gonder = gonderici,
       _depo = oturumDeposu,
       // ignore: prefer_initializing_formals
       _kimlik = kimlik,
       // ignore: prefer_initializing_formals
       _kunye = kunye,
       _saat = saat ?? DateTime.now,
       _bekle = bekle ?? Future<void>.delayed;

  final Gonderici _gonder;
  final OturumDeposu _depo;
  final CihazKimligi _kimlik;
  final IstemciKunyesi _kunye;
  final DateTime Function() _saat;
  final Future<void> Function(Duration) _bekle;

  /// Tek cihaz çakışması görülünce çağrılır (kapanamaz modal açılacak).
  final void Function(OturumCakismasi)? onCakisma;

  /// Oturum gerçekten düştüğünde çağrılır (giriş ekranına dönülecek).
  final void Function()? onOturumDustu;

  Oturum? _oturum;
  bool _yuklendi = false;

  /// ⭐ Uçuştaki yenileme. İkinci bir yenileme BAŞLATILMAZ, bunun sonucu beklenir.
  Future<bool>? _yenilemeUcusta;

  /// Yenileme geçici arızayla başarısız olduysa bu ana kadar tekrar denenmez.
  /// ⚠️ Olmasaydı API kapalıyken saniyede onlarca yenileme isteği giderdi.
  DateTime _yenilemeKapali = DateTime.fromMillisecondsSinceEpoch(0);

  Oturum? get oturum => _oturum;

  Future<Oturum?> oturumuYukle() async {
    if (_yuklendi) return _oturum;
    _oturum = await _depo.oku();
    _yuklendi = true;
    return _oturum;
  }

  Future<void> oturumuAyarla(Oturum? o) async {
    _oturum = o;
    _yuklendi = true;
    await _depo.yaz(o);
    if (o == null) onOturumDustu?.call();
  }

  /// Yetkili istek. `yenilemeYok` yalnız yenileme çağrısının kendisi için (sonsuz döngü).
  Future<Object?> istek(
    String yontem,
    String yol, {
    Object? govde,
    bool yenilemeYok = false,
  }) async {
    await oturumuYukle();

    // ⭐ PROAKTİF YENİLEME — 401 beklenmez. Jetonun son %10'una girildiyse önce tazele.
    final o = _oturum;
    if (!yenilemeYok &&
        o?.refreshAt != null &&
        !_saat().isBefore(o!.refreshAt!)) {
      await _yenile();
    }

    var yanit = await _gonderHazirla(yontem, yol, govde);

    // 401 emniyet ağı: proaktif yenileme kaçırmışsa (ör. sunucu ömrü kısalttı) bir kez dene.
    if (yanit.durum == 401 && !yenilemeYok && _oturum != null) {
      if (await _yenile()) {
        yanit = await _gonderHazirla(yontem, yol, govde);
      }
    }

    // ⚠️ Geçici yukarı-akış arızası — BİR kez sessizce tekrarlanır. Oturuma dokunulmaz.
    if (const {502, 503, 504}.contains(yanit.durum) && !yenilemeYok) {
      await _bekle(const Duration(milliseconds: 800));
      yanit = await _gonderHazirla(yontem, yol, govde);
    }

    if (yanit.basarili) return yanit.govde;

    final hata = _hataCoz(yanit);

    // ⚠️ 409 `session_conflict`: oturum GEÇERLİ, yalnız sahiplik başka kopyada. Düşürme.
    if (yanit.durum == 409 && hata.code == 'session_conflict') {
      onCakisma?.call(_cakismaCoz(yanit.govde));
    }
    throw hata;
  }

  Future<HamYanit> _gonderHazirla(
    String yontem,
    String yol,
    Object? govde,
  ) async {
    return _gonder(
      HamIstek(
        yontem: yontem,
        yol: yol,
        basliklar: await _basliklar(govdeVar: govde != null),
        govde: govde,
      ),
    );
  }

  Future<Map<String, String>> _basliklar({required bool govdeVar}) async {
    final id = await _kimlik.deviceId();
    return {
      // ⚠️ Gövdesiz istekte `content-type` YAZILMAZ: Fastify boş gövdeye
      // "Body cannot be empty..." 400'ü veriyor (web'de yaşandı).
      if (govdeVar) 'content-type': 'application/json',
      'x-device-id': id,
      'x-client-instance': await _kimlik.instanceId(),
      ..._kunye.basliklar(),
      if (_oturum != null) 'authorization': 'Bearer ${_oturum!.accessToken}',
    };
  }

  /// ⭐ Yenileme — uçuşta tek söz.
  Future<bool> _yenile() {
    final o = _oturum;
    if (o == null) return Future.value(false);
    if (_saat().isBefore(_yenilemeKapali)) return Future.value(false);

    return _yenilemeUcusta ??= _yenileGercek(
      o.refreshToken,
    ).whenComplete(() => _yenilemeUcusta = null);
  }

  Future<bool> _yenileGercek(String refreshToken) async {
    try {
      // ⚠️ Künye BURADA da gönderiliyor: yenileme, giriş sonrası cihaz sinyalinin yazıldığı
      // EN SIK yol. Yalnız girişe koysaydık aylarca açık kalan oturumun künyesi ilk günden
      // kalma olurdu (`auth.service.ts` → `issueSession` → `devices.record`).
      final yanit = await _gonder(
        HamIstek(
          yontem: 'POST',
          yol: '/api/v1/auth/refresh',
          basliklar: await _basliklar(govdeVar: true),
          govde: {'refreshToken': refreshToken},
        ),
      );

      // ⚠️⚠️ OTURUM YALNIZ GERÇEK REDDE DÜŞER.
      if (yanit.durum == 401 || yanit.durum == 403) {
        await oturumuAyarla(null);
        return false;
      }
      if (!yanit.basarili) {
        _yenilemeKapali = _saat().add(const Duration(seconds: 10));
        return false;
      }

      final g = yanit.govde;
      final yeni = g is Map<String, dynamic>
          ? Oturum.sunucuYanitindan(g, simdi: _saat())
          : null;
      if (yeni == null) {
        await oturumuAyarla(null);
        return false;
      }
      await oturumuAyarla(yeni);
      return true;
    } catch (_) {
      // Ağ hatası jeton hakkında hiçbir şey söylemez → oturum korunur.
      _yenilemeKapali = _saat().add(const Duration(seconds: 10));
      return false;
    }
  }

  MwApiHatasi _hataCoz(HamYanit y) {
    final g = y.govde;
    if (g is Map) {
      final code =
          g['code'] ?? (g['error'] is Map ? (g['error'] as Map)['code'] : null);
      final mesaj = g['message'] ?? g['error'];
      return MwApiHatasi(
        y.durum,
        mesaj is String ? mesaj : 'İstek başarısız (${y.durum})',
        code: code is String ? code : null,
        govde: g,
      );
    }
    return MwApiHatasi(y.durum, 'İstek başarısız (${y.durum})', govde: g);
  }

  OturumCakismasi _cakismaCoz(Object? govde) {
    // Sunucu gövdesi: {code, message, holder:{platform, seenAt}}
    final tutan = govde is Map ? govde['holder'] : null;
    if (tutan is Map) {
      return OturumCakismasi(
        platform: tutan['platform'] as String?,
        gorulme: tutan['seenAt'] as String?,
      );
    }
    return const OturumCakismasi();
  }
}
