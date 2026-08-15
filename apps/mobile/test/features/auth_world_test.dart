/// ⚠️⚠️ GİRİŞ FORMUNUN DÜNYA SEÇİMİ — "gösterdiğini göndermeyen form" hatası.
///
/// Gerçek cihazda yakalandı (2026-08-15): dropdown "Dunya 1" gösteriyordu ama «Giriş yap»a
/// basınca *"Önce bir dünya seç"* diyordu. Sebep, gösterilen varsayılanın hiçbir zaman
/// seçim durumuna yazılmamasıydı — gösterim ile gönderim iki AYRI ifadeden besleniyordu.
///
/// ⭐ Düzeltme tek ifadeye indirdi; bu testler o ifadenin sözleşmesini kilitliyor. Ekranda
/// görünenle gönderilenin ayrışması artık yapısal olarak imkânsız.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/auth/auth_screen.dart';

const _list = <({int id, String name})>[
  (id: 1, name: 'Dunya 1'),
  (id: 2, name: 'Dunya 2'),
];

void main() {
  group('selectedWorld', () {
    test(
      '⚠️⚠️ kullanıcı DOKUNMADIYSA listenin ilki seçilidir (gösterilenle aynı)',
      () {
        expect(selectedWorld(null, _list), 1);
      },
    );

    test('kullanıcı seçtiyse onun seçimi kazanır', () {
      expect(selectedWorld(2, _list), 2);
    });

    test(
      'liste henüz boşsa null döner — düğme kapalı kalır, sahte hata gösterilmez',
      () {
        expect(selectedWorld(null, const []), isNull);
      },
    );

    test('⭐ liste boş olsa bile kullanıcının önceki seçimi korunur', () {
      // Liste yeniden yüklenirken (ör. ağ kesintisi sonrası) seçim sıfırlanmamalı.
      expect(selectedWorld(2, const []), 2);
    });
  });
}
