/// OTURUM — jetonlar ve yenilemenin ne zaman başlayacağı.
///
/// Web'deki karşılığı `apps/web/src/lib/api.ts` (`Session`, `refreshDeadline`, `toSession`).
/// Davranış birebir aynı tutuluyor; ayrışması "aynı hesap iki istemcide farklı davranıyor"
/// demek olurdu.
library;

import 'dart:convert';

import 'storage.dart';

const String kOturumKey = 'mw-session';

class Oturum {
  const Oturum({
    required this.accessToken,
    required this.refreshToken,
    required this.playerId,
    required this.worldId,
    required this.username,
    this.refreshAt,
  });

  final String accessToken;
  final String refreshToken;
  final int playerId;
  final int worldId;
  final String username;

  /// Yenilemenin başlaması gereken an — **yerel saat**.
  ///
  /// ⚠️ Sunucunun ISO damgası SAKLANMIYOR, bilerek. Cihaz saati sunucununkinden dakikalarca
  /// sapabiliyor; mutlak bir sunucu damgasını yerel saatle karşılaştırmak, saati ileri olan
  /// cihazda her istekte yenileme, geri olanda hiç yenileme yapmak demekti. Burada yalnız
  /// sunucunun KENDİ İÇİNDEKİ fark kullanılıyor ve yanıtın geldiği andaki yerel saate
  /// ekleniyor → saat sapması denklemden tamamen çıkıyor.
  ///
  /// ⚠️ `null` olabilir: hesaplanamazsa proaktif yenileme kapanır ve 401 emniyet ağı çalışır.
  /// Kimse çıkışa zorlanmaz.
  final DateTime? refreshAt;

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'playerId': playerId,
    'worldId': worldId,
    'username': username,
    'refreshAt': refreshAt?.millisecondsSinceEpoch,
  };

  static Oturum fromJson(Map<String, dynamic> j) => Oturum(
    accessToken: j['accessToken'] as String,
    refreshToken: j['refreshToken'] as String,
    playerId: (j['playerId'] as num).toInt(),
    worldId: (j['worldId'] as num).toInt(),
    username: j['username'] as String,
    // ⚠️ `isUtc: true` ŞART. Varsayılan yerel saat döndürüyor ve Dart'ta `isUtc` eşitliğin
    // PARÇASI — yazılan UTC değer okunduğunda "farklı" bir DateTime oluyordu (test yakaladı,
    // 2026-08-15). Karşılaştırmalar `isBefore` ile yapıldığı için davranış bozulmuyordu ama
    // sessiz bir tutarsızlıktı; tüm damgalar UTC'de tutuluyor.
    refreshAt: j['refreshAt'] == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(
            (j['refreshAt'] as num).toInt(),
            isUtc: true,
          ),
  );

  /// Sunucunun `/auth/*` yanıt gövdesinden oturum kurar.
  /// Gövde şekli: `auth.controller.ts` → `accessToken · refreshToken · accessExpiresAt ·
  /// refreshExpiresAt · player{id,username,worldId} · serverNow`.
  static Oturum? sunucuYanitindan(Map<String, dynamic> g, {DateTime? simdi}) {
    final at = g['accessToken'];
    final rt = g['refreshToken'];
    final p = g['player'];
    if (at is! String || rt is! String || p is! Map) return null;

    return Oturum(
      accessToken: at,
      refreshToken: rt,
      playerId: (p['id'] as num).toInt(),
      worldId: (p['worldId'] as num).toInt(),
      username: p['username'] as String,
      refreshAt: yenilemeAni(
        accessExpiresAt: g['accessExpiresAt'] as String?,
        serverNow: g['serverNow'] as String?,
        simdi: simdi ?? DateTime.now(),
      ),
    );
  }
}

/// ⭐ Ömrün son %10'una girince yenile; **en az 30 sn, en çok 10 dk** önceden.
///
/// Saf fonksiyon — `apps/web/src/lib/api.ts` · `refreshDeadline` ile birebir. Test edilebilir
/// olması şart: bu hesabın yanlışı, ya her istekte yenileme (sunucu yükü) ya da hiç yenileme
/// (oyuncu 12 saat sonra sessizce düşer) demek.
DateTime? yenilemeAni({
  required String? accessExpiresAt,
  required String? serverNow,
  required DateTime simdi,
}) {
  if (accessExpiresAt == null || serverNow == null) return null;
  final son = DateTime.tryParse(accessExpiresAt);
  final now = DateTime.tryParse(serverNow);
  if (son == null || now == null) return null;

  final omurMs = son.difference(now).inMilliseconds;
  if (omurMs <= 0) return null;

  final lead = (omurMs * 0.1).clamp(30000, 600000).toInt();
  // ⚠️ `.toUtc()` — tüm damgalar UTC'de tutuluyor (diske yazılıp okunduğunda da UTC dönüyor).
  // Karışık tutulsaydı eşitlik karşılaştırmaları sessizce yanlış sonuç verirdi.
  return simdi.add(Duration(milliseconds: omurMs - lead)).toUtc();
}

/// Oturumun kalıcı deposu. ⚠️ Jetonlar **güvenli depoda** (`GuvenliDepo`) — düz
/// `shared_preferences` yedeklenip başka cihaza taşınabiliyor.
class OturumDeposu {
  OturumDeposu(this._depo);

  final KaliciDepo _depo;

  Future<Oturum?> oku() async {
    final ham = await _depo.oku(kOturumKey);
    if (ham == null) return null;
    try {
      return Oturum.fromJson(jsonDecode(ham) as Map<String, dynamic>);
    } catch (_) {
      // Bozuk kayıt oturumu kilitlememeli: sil, misafir olarak devam et.
      await _depo.sil(kOturumKey);
      return null;
    }
  }

  Future<void> yaz(Oturum? o) async {
    if (o == null) {
      await _depo.sil(kOturumKey);
    } else {
      await _depo.yaz(kOturumKey, jsonEncode(o.toJson()));
    }
  }
}
