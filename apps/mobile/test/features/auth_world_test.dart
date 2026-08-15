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

const _liste = <({int id, String ad})>[
  (id: 1, ad: 'Dunya 1'),
  (id: 2, ad: 'Dunya 2'),
];

void main() {
  group('seciliDunya', () {
    test(
      '⚠️⚠️ kullanıcı DOKUNMADIYSA listenin ilki seçilidir (gösterilenle aynı)',
      () {
        expect(seciliDunya(null, _liste), 1);
      },
    );

    test('kullanıcı seçtiyse onun seçimi kazanır', () {
      expect(seciliDunya(2, _liste), 2);
    });

    test(
      'liste henüz boşsa null döner — düğme kapalı kalır, sahte hata gösterilmez',
      () {
        expect(seciliDunya(null, const []), isNull);
      },
    );

    test('⭐ liste boş olsa bile kullanıcının önceki seçimi korunur', () {
      // Liste yeniden yüklenirken (ör. ağ kesintisi sonrası) seçim sıfırlanmamalı.
      expect(seciliDunya(2, const []), 2);
    });
  });
}
