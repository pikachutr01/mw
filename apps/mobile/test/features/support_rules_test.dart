/// ⭐⭐ DESTEK KURALLARI — sunucunun şemasıyla aynı olmak zorunda.
///
/// ⚠️ İki yönlü arıza sınıfı ve ikisi de sessiz:
///   • istemci GEVŞEK olursa düğme açılır, sunucu zod hatası döndürür ve oyuncu doldurduğu
///     formu boşa harcar;
///   • istemci SIKI olursa sunucunun kabul edeceği bir talebi reddederiz ve sebebi hiçbir
///     yerde görünmez.
/// Bu yüzden sınırlar burada `packages/contracts/src/support.ts` ile birebir kilitli.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/support/support_rules.dart';

String _uzunluk(int n) => 'a' * n;

void main() {
  group('sınırlar sözleşmeyle eşli', () {
    /// ⚠️ Sayılar `support.ts` ile birebir: konu 5..120, ilk gövde 20..4000, yanıt 2..4000,
    /// e-posta 254.
    test('⭐ sözleşmedeki sayılar', () {
      expect(kSubjectMin, 5);
      expect(kSubjectMax, 120);
      expect(kBodyMin, 20);
      expect(kBodyMax, 4000);
      expect(kReplyMin, 2);
      expect(kEmailMax, 254);
    });
  });

  group('kategoriler', () {
    /// ⚠️ Anahtarlar SUNUCUNUN kodları; Türkçeleştirmek isteği reddettirirdi.
    test('⭐ beş kategori, sunucunun kodlarıyla', () {
      expect(kSupportCategories.map((c) => c.id), [
        'bug',
        'account',
        'suggestion',
        'report',
        'other',
      ]);
    });

    test('etiketler çevriliyor', () {
      expect(supportCategoryLabel('bug'), 'Hata bildirimi');
      expect(supportCategoryLabel('account'), 'Hesap / giriş sorunu');
    });

    /// ⚠️ Bilinmeyen kategori ham koduyla dönüyor, boş kalmıyor: sunucuya yeni bir kategori
    /// eklendiğinde satır anlamsızlaşmamalı.
    test('⭐ bilinmeyen kategori ham koduyla', () {
      expect(supportCategoryLabel('kraken'), 'kraken');
    });

    test('durum etiketleri', () {
      expect(supportStatusLabel('open'), 'Açık');
      expect(supportStatusLabel('closed'), 'Kapalı');
      expect(supportStatusLabel('bilinmeyen'), 'bilinmeyen');
    });
  });

  group('subjectError', () {
    test('boş, kısa ve uzun konu reddediliyor', () {
      expect(subjectError(''), isNotNull);
      expect(subjectError('abcd'), isNotNull);
      expect(subjectError(_uzunluk(121)), isNotNull);
    });

    test('sınırdaki değerler kabul', () {
      expect(subjectError(_uzunluk(5)), isNull);
      expect(subjectError(_uzunluk(120)), isNull);
    });

    /// ⚠️⚠️ `trim()` SONRASI ölçülüyor: sunucudaki şema da `.trim()` uyguluyor ve boşlukla
    /// doldurulmuş bir konu orada reddedilirdi. İstemci saymasaydı düğme açılır, sunucu
    /// reddederdi.
    test('⭐⭐ boşluk doldurma işe yaramıyor', () {
      expect(subjectError('        '), isNotNull);
      expect(subjectError('  abc  '), isNotNull);
      expect(subjectError('  abcde  '), isNull);
    });
  });

  group('bodyError', () {
    /// ⚠️⚠️ 20 karakter YALNIZ AÇILIŞTA. Yazışmanın devamında zarar veriyordu: yönetici
    /// *"Sorun çözüldü mü?"* diye soruyor, oyuncunun cevabı *"Evet, teşekkürler"* ve o 17
    /// karakter (kullanıcı bildirdi).
    test('⭐⭐ ilk mesajda 20, yanıtta 2', () {
      final onYedi = _uzunluk(17);
      expect(bodyError(onYedi, ilkMesaj: true), isNotNull);
      expect(bodyError(onYedi, ilkMesaj: false), isNull);
    });

    /// ⚠️ Yanıt tabanı 1 DEĞİL 2: tek karakterlik gövde yanıt değil kazadır ve yöneticiye
    /// bildirim üretirdi.
    test('⭐ tek karakterlik yanıt reddediliyor', () {
      expect(bodyError('a', ilkMesaj: false), isNotNull);
      expect(bodyError('ab', ilkMesaj: false), isNull);
    });

    test('boş ve çok uzun gövde reddediliyor', () {
      expect(bodyError('', ilkMesaj: true), isNotNull);
      expect(bodyError('   ', ilkMesaj: false), isNotNull);
      expect(bodyError(_uzunluk(4001), ilkMesaj: false), isNotNull);
      expect(bodyError(_uzunluk(4000), ilkMesaj: false), isNull);
    });
  });

  group('emailError', () {
    /// ⚠️ Zorunluluk KİPE bağlı: misafirde ve doğrulanmamış hesapta zorunlu, doğrulanmış
    /// hesapta alan hiç görünmüyor ve boş geçmesi meşru.
    test('⭐ boş adres yalnız zorunluyken hata', () {
      expect(emailError('', zorunlu: true), isNotNull);
      expect(emailError('', zorunlu: false), isNull);
      expect(emailError('   ', zorunlu: false), isNull);
    });

    test('besbelli geçersiz adresler eleniyor', () {
      for (final k in ['abc', 'a@b', 'a b@c.com', '@yok.com', 'a@@b.com']) {
        expect(emailError(k, zorunlu: true), isNotNull, reason: k);
      }
    });

    test('geçerli adres kabul', () {
      expect(emailError('ornek@eposta.com', zorunlu: true), isNull);
      expect(emailError('  a.b+c@d.co.uk  ', zorunlu: true), isNull);
    });

    test('çok uzun adres reddediliyor', () {
      expect(emailError('${_uzunluk(250)}@a.com', zorunlu: true), isNotNull);
    });
  });

  group('canCreateTicket', () {
    const konu = 'Bir sorun var';
    const govde = 'Yirmi karakterden uzun bir açıklama yazıyorum.';

    /// ⚠️⚠️ TEK KARAR NOKTASI: düğmenin açılması ile isteğin geçerliliği aynı kurala
    /// bakmalı. Ayrışsalardı açık bir düğme sunucudan hata döndürürdü.
    test('⭐⭐ üç alanın hepsi geçerliyken açılıyor', () {
      expect(
        canCreateTicket(
          subject: konu,
          body: govde,
          email: 'a@b.com',
          emailRequired: true,
        ),
        isTrue,
      );
    });

    test('herhangi bir alan bozuksa kapalı', () {
      expect(
        canCreateTicket(
          subject: 'kısa',
          body: govde,
          email: 'a@b.com',
          emailRequired: true,
        ),
        isFalse,
      );
      expect(
        canCreateTicket(
          subject: konu,
          body: 'çok kısa',
          email: 'a@b.com',
          emailRequired: true,
        ),
        isFalse,
      );
      expect(
        canCreateTicket(
          subject: konu,
          body: govde,
          email: '',
          emailRequired: true,
        ),
        isFalse,
      );
    });

    /// ⚠️ E-posta gerekmiyorsa boş olması engel DEĞİL: doğrulanmış hesapta sunucu adresi
    /// zaten hesaptan alıyor.
    test('⭐ e-posta gerekmiyorsa boş geçilebiliyor', () {
      expect(
        canCreateTicket(
          subject: konu,
          body: govde,
          email: '',
          emailRequired: false,
        ),
        isTrue,
      );
    });
  });

  group('canReply', () {
    test('iki karakter yeterli, bir karakter değil', () {
      expect(canReply('a'), isFalse);
      expect(canReply('ok'), isTrue);
      expect(canReply('  ok  '), isTrue);
      expect(canReply('   '), isFalse);
    });
  });
}
