/// ⭐⭐ TOAST KUYRUĞU — **kararları** ölçer, çizimi değil.
///
/// ⚠️ Buradaki kusurların hepsi sessiz: taşan bir kuyruk ekranı kaplar ama hata vermez,
/// iptal edilmeyen bir zamanlayıcı ölü bir kaydı 6 sn sonra "kapatmaya" çalışır, başlıksız
/// bir toast ekranda boş bir kutu olarak durur. Üçü de "çalışıyor" gibi görünür.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/ui/toast.dart';

void main() {
  late ProviderContainer kap;

  setUp(() => kap = ProviderContainer());
  tearDown(() => kap.dispose());

  ToastQueue kuyruk() => kap.read(toastProvider.notifier);
  List<MwToastData> liste() => kap.read(toastProvider);

  group('ToastQueue', () {
    test('başlangıçta boş', () {
      expect(liste(), isEmpty);
    });

    test('gösterilen toast listeye giriyor, alanları korunuyor', () {
      kuyruk().show(
        title: 'Saldırın yola çıktı',
        body: 'Hedef 1:2:7',
        url: '/armies',
        category: 'report',
      );
      expect(liste(), hasLength(1));
      final t = liste().single;
      expect(t.title, 'Saldırın yola çıktı');
      expect(t.body, 'Hedef 1:2:7');
      expect(t.url, '/armies');
      expect(t.category, 'report');
    });

    /// ⚠️ Başlıksız toast YUTULUYOR (web'de aynı kural): gövdesi olsa bile başlıksız bir
    /// kutu ekranda "bir şey oldu ama ne" diyor.
    test('⭐ başlıksız ve yalnız boşluk olan toast yutuluyor', () {
      kuyruk().show(title: '');
      kuyruk().show(title: '   ');
      kuyruk().show(title: '\n\t');
      expect(liste(), isEmpty);
    });

    /// ⚠️⚠️ TAVAN: sınır olmasaydı arka arkaya verilen emirler ekranı baştan aşağı
    /// kaplardı. Düşen EN ESKİ olmalı — en yenisi oyuncunun az önce yaptığı şey.
    test('⭐⭐ en fazla 3 duruyor ve düşen EN ESKİ oluyor', () {
      for (var i = 1; i <= 5; i++) {
        kuyruk().show(title: 'toast $i');
      }
      expect(liste(), hasLength(kToastMaxStack));
      expect(liste().map((t) => t.title), ['toast 3', 'toast 4', 'toast 5']);
    });

    /// ⚠️ Sıra listede de korunuyor: ekran en yeniyi ALTA çiziyor (parmağa en yakın yer),
    /// yani listenin sonu en yeni olmalı.
    test('⭐ en yeni listenin SONUNDA', () {
      kuyruk().show(title: 'ilk');
      kuyruk().show(title: 'son');
      expect(liste().last.title, 'son');
    });

    test('kimlikler benzersiz ve artıyor', () {
      kuyruk().show(title: 'a');
      kuyruk().show(title: 'b');
      final ids = liste().map((t) => t.id).toList();
      expect(ids.toSet(), hasLength(2));
      expect(ids.first, lessThan(ids.last));
    });

    test('dismiss yalnız hedefi düşürüyor', () {
      kuyruk().show(title: 'a');
      kuyruk().show(title: 'b');
      kuyruk().dismiss(liste().first.id);
      expect(liste().map((t) => t.title), ['b']);
    });

    /// ⚠️ Olmayan bir kimliği düşürmek ÇÖKMEMELİ: kapatma düğmesine iki kez basmak ya da
    /// zamanlayıcının kapatılmış bir toast'ı yakalaması gerçek durumlar.
    test('⭐ olmayan kimlik sessizce yutuluyor', () {
      kuyruk().show(title: 'a');
      kuyruk().dismiss(9999);
      kuyruk().dismiss(liste().first.id);
      kuyruk().dismiss(liste().length);
      expect(liste(), isEmpty);
    });
  });

  group('toastIcon', () {
    test('bilinen kategorilerin kendi simgesi var', () {
      final simgeler = [
        'attack',
        'dm',
        'report',
        'production',
        'mention',
      ].map(toastIcon).toSet();
      // ⚠️ Beşi de AYRI simge: ikisi aynı olsaydı kategori ayrımı ekranda kaybolurdu.
      expect(simgeler, hasLength(5));
    });

    /// ⚠️ Bilinmeyen kategori nötr noktaya düşüyor, boş kalmıyor: sunucu yarın yeni bir
    /// kategori eklerse toast simgesiz bir boşlukla çizilmemeli.
    test('⭐ bilinmeyen ve null kategori nötr simgeye düşüyor', () {
      expect(toastIcon('kraken'), toastIcon(null));
      expect(toastIcon(''), toastIcon(null));
    });
  });

  /// ⚠️ Süreler web'deki `Toaster.tsx` ile aynı olmak zorunda: aynı oyun iki istemcide
  /// farklı ritimde konuşmamalı.
  group('sabitler web ile eşli', () {
    test('⭐ 6 saniye ve 3 yığın', () {
      expect(kToastDwell, const Duration(seconds: 6));
      expect(kToastMaxStack, 3);
    });
  });
}
