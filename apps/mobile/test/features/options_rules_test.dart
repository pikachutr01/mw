/// ⭐ SEÇENEKLER KURALLARI — tema tercihinin diske gidip gelmesi.
///
/// ⚠️ Bu dosyanın derdi küçük ama arıza sınıfı sinsi: tema tercihi **diskte dize** olarak
/// duruyor ve iki yönlü dönüşümün bozulması sessizce "tercih hatırlanmıyor"a dönüşür — hata
/// yok, yalnız oyuncu her açılışta yanlış temayı görür.
library;

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/options/options_rules.dart';

void main() {
  group('tema tercihi', () {
    /// ⚠️⚠️ Değerler WEB'LE aynı olmak ZORUNDA (`localStorage['mw-theme']`): aynı kavramı iki
    /// istemcide farklı adlandırmak, ileride tercihi hesaba taşımak istediğimizde iki farklı
    /// biçimi birbirine çevirmek demek olurdu.
    test('⭐ diske yazılan dizeler web ile birebir', () {
      expect(themeModeToString(ThemeMode.system), 'system');
      expect(themeModeToString(ThemeMode.light), 'light');
      expect(themeModeToString(ThemeMode.dark), 'dark');
    });

    test('okuma yazmanın tersi', () {
      for (final m in ThemeMode.values) {
        expect(themeModeFromString(themeModeToString(m)), m);
      }
    });

    /// ⚠️ Bozuk ya da eksik değer `system`e düşüyor, PATLAMIYOR: tercih oyuncunun elinin
    /// altındaki bir dosyada ve bozuk bir değer yüzünden uygulamanın açılmaması orantısız
    /// olurdu. «Hiç seçim yapılmamış» ile «değer bozuk» aynı yere düşüyor; ikisi de doğru.
    test('⭐ bilinmeyen değer ve null → system', () {
      expect(themeModeFromString(null), ThemeMode.system);
      expect(themeModeFromString(''), ThemeMode.system);
      expect(themeModeFromString('koyu'), ThemeMode.system);
      // ⚠️ Büyük harf eşleşmiyor: `switch` birebir dize karşılaştırması yapıyor.
      expect(themeModeFromString('Dark'), ThemeMode.system);
    });

    test('seçenek listesi üç tane ve «Sistem» başta', () {
      expect(kThemeChoices, hasLength(3));
      expect(kThemeChoices.first.mode, ThemeMode.system);
      expect(
        kThemeChoices.map((c) => c.mode).toSet(),
        ThemeMode.values.toSet(),
      );
    });
  });

  /// ⭐ CİHAZ KÜNYESİ — arıza sınıfı: aynı telefon web'de ve mobilde iki farklı adla
  /// görünürse oyuncu «çıkar» derken hangisini çıkardığını bilemez. Bu yüzden testler
  /// web'deki `describe()` / `browserOf()` ile **aynı çıktıyı** kilitliyor.
  group('cihaz künyesi', () {
    test('platform etiketleri web ile birebir', () {
      expect(platformLabel('web'), 'Tarayıcı');
      expect(platformLabel('android'), 'Android');
      expect(platformLabel('ios'), 'iPhone / iPad');
    });

    /// ⚠️ Bilinmeyen platform GİZLENMİYOR, ham değeriyle yazılıyor: sunucu yarın yeni bir
    /// platform eklediğinde oyuncu o cihazı listede görebilmeli. `null` başka bir durum —
    /// elde hiçbir şey yok, o zaman genel etiket.
    test('⭐ bilinmeyen platform ham geçiyor, null genel etikete düşüyor', () {
      expect(platformLabel('windows-phone'), 'windows-phone');
      expect(platformLabel(null), 'Bilinmeyen cihaz');
      expect(platformLabel(''), 'Bilinmeyen cihaz');
    });

    /// ⚠️⚠️ ASIL TUZAK BU: Edge ve Opera kendilerini `Chrome/` olarak da tanıtıyor, Chrome
    /// da kendini `Safari/` olarak tanıtıyor. Sıra genelden özele olsaydı Edge «Chrome»,
    /// Chrome «Safari» görünürdü. Testler gerçek User-Agent dizeleriyle yazıldı.
    test('⭐⭐ tarayıcı sırası: Edge ve Opera Chrome sanılmıyor', () {
      const edge =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
      const opera =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0';
      const chrome =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const safari =
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
          '(KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      const firefox =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 '
          'Firefox/121.0';

      expect(browserOf(edge), 'Edge');
      expect(browserOf(opera), 'Opera');
      expect(browserOf(chrome), 'Chrome');
      expect(browserOf(safari), 'Safari');
      expect(browserOf(firefox), 'Firefox');
    });

    test('tanınmayan User-Agent ve boş değer null', () {
      expect(browserOf('curl/8.4.0'), isNull);
      expect(browserOf(null), isNull);
      expect(browserOf(''), isNull);
    });

    /// ⚠️ Telefonda `deviceModel` dolu gelir, tarayıcıda boştur ve yerini User-Agent'tan
    /// çıkarılan tarayıcı adı alır. İkisi de yoksa yalnız platform yazılıyor: boş bir orta
    /// nokta bırakmak «bir şey eksik» hissi verirdi.
    test(
      '⭐ künye: model varsa model, yoksa tarayıcı, o da yoksa yalnız platform',
      () {
        expect(
          describeDevice(platform: 'android', deviceModel: 'SM-G991B'),
          'Android · SM-G991B',
        );
        expect(
          describeDevice(
            platform: 'web',
            userAgent: 'Mozilla/5.0 ... Firefox/121.0',
          ),
          'Tarayıcı · Firefox',
        );
        expect(describeDevice(platform: 'ios'), 'iPhone / iPad');
        expect(describeDevice(), 'Bilinmeyen cihaz');
      },
    );

    /// ⚠️ `deviceModel` BOŞ DİZE gelirse de tarayıcı adına düşmeli: sunucu bazı istemcilerde
    /// null yerine '' yolluyor ve `?? ` operatörü boş dizeyi «dolu» sayardı.
    test('⭐ boş dize model, null gibi ele alınıyor', () {
      expect(
        describeDevice(
          platform: 'web',
          deviceModel: '',
          userAgent: 'Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36',
        ),
        'Tarayıcı · Chrome',
      );
    });

    /// ⚠️ Boş alanlar PARÇASIYLA BİRLİKTE düşüyor: `null` bir IP « ·  · » gibi sarkan bir
    /// ayraç bırakmamalı.
    test('⭐ ayrıntı satırı: eksik alanlar ayracıyla birlikte düşüyor', () {
      expect(
        deviceDetails(
          gorulme: '5 dakika önce',
          ip: '88.1.2.3',
          appVersion: '1.4.0',
          osVersion: 'Android 14',
        ),
        'Son görülme 5 dakika önce · 88.1.2.3 · uygulama 1.4.0 · Android 14',
      );
      expect(deviceDetails(gorulme: 'az önce'), 'Son görülme az önce');
      expect(
        deviceDetails(gorulme: 'dün', ip: '', appVersion: '2.0.0'),
        'Son görülme dün · uygulama 2.0.0',
      );
    });
  });
}
