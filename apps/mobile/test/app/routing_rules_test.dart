/// ⚠️⚠️ YÖNLENDİRME KAPISI — misafir/oturumlu ayrımı ve DÖNGÜ YOKLUĞU.
///
/// İki ayrı arıza sınıfı ölçülüyor:
///
///   1. **Sızıntı** — misafirin oturum isteyen bir ekrana ulaşması. Ekran açılır, her istek
///      401 döner, oyuncu boş bir sayfaya bakar. Sessiz, çünkü hiçbir yerde hata basılmaz.
///   2. **Döngü** — A → B → A. go_router uygulamayı kırmızı hata ekranına çevirir, üstelik
///      yalnız o yola giden oyuncuda; geliştiricinin kendi akışında hiç görünmeyebilir.
///
/// ⭐ İkincisi tek tek örneklerle değil, **her yol için taranan bir değişmezle** kapatılıyor:
/// bir yönlendirmenin hedefi artık yönlendirmiyor olmalı. Yeni bir rota eklendiğinde de
/// geçerli kalan tek test biçimi bu.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/app/routing_rules.dart';

/// Sınanan yollar — misafir kümesi + oturum isteyen birkaç gerçek rota + kenar durumlar.
const _allPaths = <String>[
  kLandingPath,
  kAuthPath,
  '/simulate',
  '/help',
  '/help/sefer',
  '/destek',
  '/armies',
  '/city',
  '/world',
  '/messages',
  '/command',
  '/command/rankings',
  '/options',
  '/barracks',
  '/buildings',
  '/temple',
  '/helpdesk', // ⚠️ tuzak: `/help` ile aynı ön eke sahip AMA ayrı bir rota
  '/bilinmeyen',
];

void main() {
  group('misafir — oturum istemeyen yollar', () {
    /// ⚠️⚠️ `/simulate` bu listede YOK ve olmamalı (kullanıcı, 2026-08-22):
    /// *"Uygulamada simülatöre oturumsuz ulaşılamasın"*. Web'de misafire açık kalmaya
    /// devam ediyor; ayrışan şey yalnız uygulamanın kapısı.
    test('⭐ misafir kümesi geçebilir', () {
      for (final p in ['/', kAuthPath, '/help', '/destek']) {
        expect(
          authRedirect(location: p, signedIn: false),
          isNull,
          reason: '$p misafire açık olmalı',
        );
      }
    });

    test('alt yollar da açık (`/help/sefer`)', () {
      expect(authRedirect(location: '/help/sefer', signedIn: false), isNull);
    });

    test('⚠️⚠️ oturum isteyen yol ana sayfaya çevrilir (sızıntı yok)', () {
      for (final p in ['/armies', '/city', '/world', '/messages', '/command']) {
        expect(
          authRedirect(location: p, signedIn: false),
          kLandingPath,
          reason: '$p oturumsuz açılırsa 401 yağmuru ve boş ekran olur',
        );
      }
    });

    test('⚠️ ÖN EK BENZERLİĞİ misafir yapmaz — `/helpdesk` ≠ `/help`', () {
      // Düz `startsWith` yazılsaydı bu yol sessizce misafire açılırdı.
      expect(isGuestPath('/helpdesk'), isFalse);
      expect(
        authRedirect(location: '/helpdesk', signedIn: false),
        kLandingPath,
      );
    });

    test('⚠️ `/` ön ek kuralına GİRMEZ — girseydi her şey misafire açılırdı', () {
      // Her yol '/' ile başlıyor; kural elle dışlanmasaydı `isGuestPath` hep true dönerdi.
      expect(isGuestPath('/armies'), isFalse);
    });
  });

  group('oturumlu', () {
    test('karşılama ve giriş ekranında durmaz → oyuna alınır', () {
      expect(authRedirect(location: kLandingPath, signedIn: true), kHomePath);
      expect(authRedirect(location: kAuthPath, signedIn: true), kHomePath);
    });

    test('oyun ekranlarına dokunulmaz', () {
      for (final p in ['/armies', '/city', '/world', '/command/rankings']) {
        expect(authRedirect(location: p, signedIn: true), isNull);
      }
    });

    test(
      '⚠️ misafir ekranları oturumluya da AÇIK — kümeyi «yalnız misafir» okumak hataydı',
      () {
        // Yardım ve destek iki tarafa da açık. Ters okunsaydı oyuncu destek talebinden
        // atılırdı. (Simülatör artık yalnız oturumlu; ayrı testi aşağıda.)
        for (final p in ['/help', '/destek']) {
          expect(
            authRedirect(location: p, signedIn: true),
            isNull,
            reason: '$p oturumluya kapatılmamalı',
          );
        }
      },
    );
  });

  group('⭐⭐ döngü yokluğu — yapısal değişmez', () {
    /// Bir yönlendirmenin HEDEFİ artık yönlendirmiyor olmalı. Sağlanmazsa go_router
    /// A → B → A çemberine girer ve uygulama kırmızı ekrana düşer.
    for (final signedIn in [true, false]) {
      test('${signedIn ? 'oturumlu' : 'misafir'}: her hedef sabit noktadır', () {
        for (final p in _allPaths) {
          final target = authRedirect(location: p, signedIn: signedIn);
          if (target == null) continue;
          expect(
            authRedirect(location: target, signedIn: signedIn),
            isNull,
            reason:
                '$p → $target → ... : hedef yeniden yönlendiriyor, bu bir DÖNGÜ',
          );
        }
      });
    }

    test('⭐ açılış yolu (`/armies`) iki durumda da çözülebilir', () {
      // Misafir açılışta `/armies`e düşüyor (go_router `initialLocation`); kural onu ana
      // sayfaya almalı ve orada durmalı.
      expect(authRedirect(location: kHomePath, signedIn: false), kLandingPath);
      expect(authRedirect(location: kLandingPath, signedIn: false), isNull);
      expect(authRedirect(location: kHomePath, signedIn: true), isNull);
    });
  });

  /// ⭐⭐ SİMÜLATÖR YALNIZ OTURUMLU (kullanıcı, 2026-08-22).
  ///
  /// ⚠️ Kararın ekrana yansıması var: simülatör birim adlarını ve sırasını
  /// `GET /cities/:id/catalog`tan alıyor ve o uç oturum + şehir sahipliği istiyor. Misafire
  /// açık kalsaydı adları derlenmiş bir kopyadan okumak gerekirdi ve bu, kataloğu Dart'a
  /// üretmeme kararını delerdi.
  group('simülatör kapısı', () {
    test('⭐⭐ misafir simülatöre giremiyor, karşılamaya düşüyor', () {
      expect(
        authRedirect(location: '/simulate', signedIn: false),
        kLandingPath,
      );
    });

    test('⭐ oturumlu oyuncu simülatöre girebiliyor', () {
      expect(authRedirect(location: '/simulate', signedIn: true), isNull);
    });

    test('misafir kümesinde değil', () {
      expect(isGuestPath('/simulate'), isFalse);
      expect(kGuestPaths, isNot(contains('/simulate')));
    });
  });
}
