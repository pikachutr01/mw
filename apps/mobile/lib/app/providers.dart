/// SAĞLAYICILAR — Riverpod bağımlılık grafiği.
///
/// ⚠️ **`@riverpod` codegen'i KULLANILMIYOR.** `build_runner` ikinci bir üretim zinciri
/// demekti; depoda tek codegen kapısı var (`contracts:check`) ve öyle kalıyor
/// (MOBIL_MIMARI.md §2). Elle yazılan sağlayıcı biraz daha uzun, karşılığında tek kapı.
///
/// ⚠️ Künye ve depo **önyüklemede** kuruluyor (`bootstrap.dart`) ve buraya `override` ile
/// giriyor. Alternatif olan `FutureProvider` zinciri, künyeye ihtiyaç duyan HER sağlayıcıyı
/// async yapardı — oysa künye uygulama ömrü boyunca değişmiyor.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/client_hints.dart';
import '../core/device_identity.dart';
import '../core/http_transport.dart';
import '../core/session.dart';
import '../core/storage.dart';

/// Önyüklemede override edilir. Override edilmeden okunursa bilerek patlar: sessizce
/// varsayılan bir künye üretmek, cihaz sinyalini aylarca yanlış toplamak demekti.
final kunyeProvider = Provider<IstemciKunyesi>(
  (ref) => throw StateError('kunyeProvider önyüklemede override edilmeli'),
);

final depoProvider = Provider<KaliciDepo>((ref) => GuvenliDepo());

final kimlikProvider = Provider<CihazKimligi>(
  (ref) => CihazKimligi(ref.watch(depoProvider)),
);

/// Tek cihaz çakışması. Doluysa kapanamaz bir perde gösterilir.
class CakismaNotifier extends Notifier<OturumCakismasi?> {
  @override
  OturumCakismasi? build() => null;

  void ayarla(OturumCakismasi? c) => state = c;
}

final cakismaProvider = NotifierProvider<CakismaNotifier, OturumCakismasi?>(
  CakismaNotifier.new,
);

/// Oturum durumu. **Tek doğruluk kaynağı `MwApi`** — burası onun UI'ya yansıması.
/// İki yerde ayrı ayrı tutulsaydı, yenilemenin oturumu değiştirdiği anlar kaçardı.
class OturumNotifier extends Notifier<Oturum?> {
  @override
  Oturum? build() => null;

  void ayarla(Oturum? o) => state = o;
}

final oturumProvider = NotifierProvider<OturumNotifier, Oturum?>(
  OturumNotifier.new,
);

final apiProvider = Provider<MwApi>((ref) {
  return MwApi(
    gonderici: dioGonderici(),
    oturumDeposu: OturumDeposu(ref.watch(depoProvider)),
    kimlik: ref.watch(kimlikProvider),
    kunye: ref.watch(kunyeProvider),
    // ⚠️ `ref.read` (watch değil): geri çağrılar gelecekte çalışıyor, sağlayıcıyı yeniden
    // kurmamalı. `watch` burada döngü kurardı.
    onCakisma: (c) => ref.read(cakismaProvider.notifier).ayarla(c),
    onOturumDustu: () => ref.read(oturumProvider.notifier).ayarla(null),
  );
});

/// Giriş/kayıt/çıkış — oturum yazan tek yer.
class KimlikDogrulama {
  const KimlikDogrulama(this._ref);

  final Ref _ref;

  MwApi get _api => _ref.read(apiProvider);

  Future<void> girisYap({
    required String kullaniciAdi,
    required String parola,
    required int worldId,
  }) async {
    final g = await _api.istek(
      'POST',
      '/api/v1/auth/login',
      govde: {'username': kullaniciAdi, 'password': parola, 'worldId': worldId},
    );
    await _oturumaGec(g);
  }

  Future<void> kayitOl({
    required String eposta,
    required String parola,
    required String kullaniciAdi,
    required int worldId,
  }) async {
    final g = await _api.istek(
      'POST',
      '/api/v1/auth/register',
      govde: {
        'email': eposta,
        'password': parola,
        'username': kullaniciAdi,
        'worldId': worldId,
      },
    );
    await _oturumaGec(g);
  }

  Future<void> cikisYap() async {
    // ⚠️ Sunucuya ulaşılamasa bile YEREL oturum düşer: aksi hâlde ağı olmayan oyuncu
    // uygulamadan çıkamazdı (web'de aynı karar).
    try {
      await _api.istek('POST', '/api/v1/auth/logout');
    } catch (_) {
      // yut
    }
    await _api.oturumuAyarla(null);
    _ref.read(oturumProvider.notifier).ayarla(null);
    _ref.read(cakismaProvider.notifier).ayarla(null);
  }

  Future<void> _oturumaGec(Object? govde) async {
    final o = govde is Map<String, dynamic>
        ? Oturum.sunucuYanitindan(govde)
        : null;
    if (o == null) {
      throw const MwApiHatasi(0, 'Sunucu beklenmeyen bir yanıt döndürdü.');
    }
    await _api.oturumuAyarla(o);
    _ref.read(oturumProvider.notifier).ayarla(o);
    _ref.read(cakismaProvider.notifier).ayarla(null);
  }
}

final kimlikDogrulamaProvider = Provider<KimlikDogrulama>(KimlikDogrulama.new);

/// Kayıt/giriş formundaki dünya seçici. ⚠️ Oturum GEREKTİRMEZ (`/worlds` herkese açık).
final dunyalarProvider = FutureProvider<List<({int id, String ad})>>((
  ref,
) async {
  final g = await ref.read(apiProvider).istek('GET', '/api/v1/worlds');
  final liste = (g is Map ? g['worlds'] : null) as List<dynamic>? ?? const [];
  return liste
      .whereType<Map<String, dynamic>>()
      .map((w) => (id: (w['id'] as num).toInt(), ad: w['name'] as String))
      .toList();
});
