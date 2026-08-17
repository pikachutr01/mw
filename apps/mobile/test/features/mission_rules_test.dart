/// SEFER FORMUNUN KURALLARI — **kararları** ölçer.
///
/// ⚠️⚠️ Buradaki kümeler sunucuyla ELLE senkron ve web'de **iki kez kaydı**:
///   • kahraman seçimi aylarca ulaşılamaz kaldı (sunucu izin veriyordu, istemci sormuyordu),
///   • `allowEmptyArmy` destek ve teleport'ta açıktı ama istemci yalnız `found_city` diyordu
///     → oyuncu *"sadece kahramanı seçip gönderemiyorum"* diye bildirdi.
///
/// Ayrışmanın iki yönü farklı biçimde kötü: **eksikse** düğme pasif kalır ve sunucudaki izin
/// görünmez olur (sessiz); **fazlaysa** sunucu reddeder (gürültülü). Bu dosya sessiz olanı
/// yakalamak için var.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/world/mission_rules.dart';

void main() {
  group('hasCrew — «en az bir birim ya da izinliyse bir kahraman»', () {
    test('birim varsa her görevde geçer', () {
      for (final t in ['attack', 'spy', 'transport', 'support', 'teleport']) {
        expect(hasCrew(t, 1, 0), isTrue, reason: t);
      }
    });

    /// ⚠️⚠️ Kullanıcının bildirdiği hatanın ta kendisi.
    test('⭐ YALNIZ kahraman: destek · teleport · şehir kurma geçer', () {
      expect(hasCrew('support', 0, 1), isTrue);
      expect(hasCrew('teleport', 0, 1), isTrue);
      expect(hasCrew('found_city', 0, 1), isTrue);
    });

    /// ⚠️ Saldırı ordusuz GİTMEZ: `sendAttack` ortak yoldan geçmiyor ve boş orduyu her
    /// hâlükârda reddediyor. İzin verseydik form açılır, sunucu geri çevirirdi.
    test('⚠️ saldırı ve nakliye yalnız kahramanla GİTMEZ', () {
      expect(hasCrew('attack', 0, 1), isFalse);
      expect(hasCrew('transport', 0, 1), isFalse);
      // Casuslukta yalnız Casus Kuş gider, kahraman hiç katılmaz.
      expect(hasCrew('spy', 0, 1), isFalse);
    });

    test('ikisi de yoksa hiçbir görevde geçmez', () {
      for (final t in ['attack', 'spy', 'transport', 'support', 'teleport']) {
        expect(hasCrew(t, 0, 0), isFalse, reason: t);
      }
    });
  });

  group('formRule', () {
    test('casuslukta yalnız kuş, kargo yok', () {
      expect(formRule('spy').units, MwUnitScope.spy);
      expect(formRule('spy').cargo, isFalse);
    });

    test('saldırıda kuş HARİÇ savaşçılar, kargo yok', () {
      expect(formRule('attack').units, MwUnitScope.warriors);
      expect(formRule('attack').cargo, isFalse);
    });

    /// ⭐ Şehir kurma 2026-08-07'de `all` + kargo açık oldu; kargo kapalıyken Yük Arabası
    /// seçilebiliyor ama hiçbir şey taşınmıyordu.
    test('⭐ destek ve şehir kurma: kuş DAHİL + kargo açık', () {
      expect(formRule('support').units, MwUnitScope.all);
      expect(formRule('support').cargo, isTrue);
      expect(formRule('found_city').units, MwUnitScope.all);
      expect(formRule('found_city').cargo, isTrue);
    });

    test('teleport kuş dahil ama kargo taşımaz', () {
      expect(formRule('teleport').units, MwUnitScope.all);
      expect(formRule('teleport').cargo, isFalse);
    });

    /// ⚠️ Sunucuya yeni bir tip eklenirse form çökmemeli, en dar biçimde açılmalı.
    test('bilinmeyen tip savaşçı + kargosuz varsayılıyor', () {
      expect(formRule('ritual').units, MwUnitScope.warriors);
      expect(formRule('ritual').cargo, isFalse);
    });
  });

  group('freeUnits — serbest ordu', () {
    /// Kullanıcının örneği (2026-08-11): 50 Cüce var, 30'u mağaraya işaretli → 20 çıkabilir.
    test('⭐ mağaraya söz verilenler düşülüyor', () {
      expect(freeUnits({'dwarf': 50}, {'dwarf': 30}), {'dwarf': 20});
    });

    /// ⚠️ Sıfıra düşen birim listeden ÇIKIYOR: «Cüce (0)» satırı, seçilebilecek bir şey
    /// varmış gibi görünürdü.
    test('tamamı söz verilmişse satır hiç görünmüyor', () {
      expect(freeUnits({'dwarf': 30}, {'dwarf': 30}), isEmpty);
    });

    test('söz verilen yoksa liste aynen geçiyor', () {
      expect(freeUnits({'dwarf': 5, 'elf': 2}, const {}), {
        'dwarf': 5,
        'elf': 2,
      });
    });

    /// ⚠️ Sunucu tutarsız bir sayı gönderse bile negatif üretilmiyor.
    test('söz verilen mevcuttan fazlaysa negatife düşmüyor', () {
      expect(freeUnits({'dwarf': 5}, {'dwarf': 9}), isEmpty);
    });
  });

  group('carryCapacity', () {
    test('adet × kapasite toplanıyor', () {
      expect(
        carryCapacity({'cargo_wagon': 3, 'dwarf': 10}, (id) {
          return {'cargo_wagon': 500, 'dwarf': 10}[id] ?? 0;
        }),
        1600,
      );
    });

    /// ⚠️ Yalnız kahraman ya da yalnız kuş seçilince kapasite 0 — form bunu ayrı bir cümleyle
    /// söylüyor, yoksa oyuncu «kaynak neden gitmiyor» diye takılıyordu.
    test('taşıyamayan orduda kapasite 0', () {
      expect(carryCapacity({'spy_bird': 9}, (_) => 0), 0);
      expect(carryCapacity(const {}, (_) => 500), 0);
    });
  });

  group('canSendMission', () {
    bool gonder({
      String type = 'attack',
      bool blocked = false,
      int unitCount = 1,
      int heroCount = 0,
      bool cargoFits = true,
      bool affordCargo = true,
      int cargoTotal = 0,
      bool pending = false,
    }) => canSendMission(
      type: type,
      blocked: blocked,
      unitCount: unitCount,
      heroCount: heroCount,
      cargoFits: cargoFits,
      affordCargo: affordCargo,
      cargoTotal: cargoTotal,
      pending: pending,
    );

    test('ordu seçiliyse saldırı gönderilebilir', () {
      expect(gonder(), isTrue);
    });

    /// ⚠️⚠️ Dünya listesindeki kısayol seçenek listesini ATLAYABİLİYOR — acemi korumasındaki
    /// bir hedefe form açılabilir ama gönderilememeli. Sunucunun kapısı burada da duruyor.
    test('⭐ sunucu kapattıysa gönderilemez', () {
      expect(gonder(blocked: true), isFalse);
    });

    test('uçuşta istek varken ikinci gönderim kapalı', () {
      expect(gonder(pending: true), isFalse);
    });

    /// ⚠️ Boş nakliyenin anlamı yok; destek ve şehir kurmada kargo isteğe bağlı.
    test('⭐ nakliyede kargo ZORUNLU, destekte değil', () {
      expect(gonder(type: 'transport', cargoTotal: 0), isFalse);
      expect(gonder(type: 'transport', cargoTotal: 100), isTrue);
      expect(gonder(type: 'support', cargoTotal: 0), isTrue);
    });

    test('kapasite aşılırsa ya da kaynak yetmezse kargolu görev kapalı', () {
      expect(gonder(type: 'support', cargoFits: false), isFalse);
      expect(gonder(type: 'support', affordCargo: false), isFalse);
    });

    /// ⚠️ Kargosuz görevde kapasite/kaynak bayrakları SONUCU DEĞİŞTİRMEMELİ: saldırıda
    /// kargo kutusu hiç çizilmiyor, oradan gelen bir `false` formu sessizce kilitlerdi.
    test('⭐ kargosuz görevde kargo bayrakları yok sayılıyor', () {
      expect(gonder(cargoFits: false, affordCargo: false), isTrue);
      expect(gonder(type: 'spy', cargoFits: false), isTrue);
    });

    test('mürettebat yoksa gönderilemez', () {
      expect(gonder(unitCount: 0), isFalse);
      expect(gonder(type: 'support', unitCount: 0, heroCount: 1), isTrue);
    });
  });
}
