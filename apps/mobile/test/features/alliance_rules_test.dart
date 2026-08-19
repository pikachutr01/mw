/// İTTİFAK YÖNETİM YETKİLERİ — **kararları** ölçer.
///
/// ⚠️⚠️ Matris sunucudan kopyalandı (`alliance.service.ts`) ve kopya olduğu için ayrışma
/// riski taşıyor. En kritik iki satır: **rütbe değiştirmek yalnız Lider'e açık** (Konsey
/// kendini çoğaltamaz) ve **lider üye varken ayrılamaz** (ayrılırsa ittifak dağılır).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/alliance/alliance_rules.dart';
import 'package:mobilwar/features/chat/alliance_chat_rules.dart';

void main() {
  group('üyeyi atma', () {
    /// ⚠️ Susturma matrisiyle AYNI olduğu için `canMute`e devrediliyor — iki kopya yazsaydık
    /// biri düzeltilip diğeri unutulduğunda ekran sunucuyla çelişirdi. Bu test o devrin
    /// gerçekten aynı sonucu verdiğini kilitliyor.
    test('⭐⭐ atma matrisi susturma matrisiyle BİREBİR', () {
      for (final me in [MwRole.member, MwRole.council, MwRole.leader]) {
        for (final t in [MwRole.member, MwRole.council, MwRole.leader]) {
          for (final ayniKisi in [true, false]) {
            expect(
              canKick(
                myRole: me,
                myPlayerId: 1,
                targetRole: t,
                targetPlayerId: ayniKisi ? 1 : 2,
              ),
              canMute(
                myRole: me,
                myPlayerId: 1,
                targetRole: t,
                targetPlayerId: ayniKisi ? 1 : 2,
              ),
              reason: 'me=$me target=$t ayni=$ayniKisi',
            );
          }
        }
      }
    });

    test('Konsey Asker\'i atabiliyor, Konsey\'i atamıyor', () {
      expect(
        canKick(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isTrue,
      );
      expect(
        canKick(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.council,
          targetPlayerId: 2,
        ),
        isFalse,
      );
    });

    /// ⚠️ `cannot_kick_self` — kendini atmak yerine «İttifaktan Ayrıl» var.
    test('⭐ kendini atamıyor', () {
      expect(
        canKick(
          myRole: MwRole.leader,
          myPlayerId: 7,
          targetRole: MwRole.leader,
          targetPlayerId: 7,
        ),
        isFalse,
      );
    });
  });

  group('rütbe değiştirme (Konseye al / çıkar)', () {
    /// ⚠️⚠️ **ATMADAN DAHA DAR BİR KAPI.** Konsey birini atabiliyor ama Konsey YAPAMIYOR —
    /// aynı fonksiyona bağlasaydık Konsey rütbesi kendini çoğaltabilirdi.
    test('⭐⭐ yalnız LİDER — Konsey rütbe değiştiremiyor', () {
      expect(
        canSetCouncil(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isFalse,
      );
      expect(
        canSetCouncil(
          myRole: MwRole.leader,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isTrue,
      );
      // Karşılaştırma: aynı Konsey o üyeyi ATABİLİYOR.
      expect(
        canKick(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isTrue,
      );
    });

    test('Lider, Konsey\'i Asker\'e indirebiliyor', () {
      expect(
        canSetCouncil(
          myRole: MwRole.leader,
          myPlayerId: 1,
          targetRole: MwRole.council,
          targetPlayerId: 2,
        ),
        isTrue,
      );
    });

    /// ⚠️ `hierarchy` — «Liderin rütbesi buradan değişmez»; liderlik ancak DEVREDİLİR.
    test('⭐⭐ Lider\'in rütbesi buradan DEĞİŞMİYOR', () {
      expect(
        canSetCouncil(
          myRole: MwRole.leader,
          myPlayerId: 1,
          targetRole: MwRole.leader,
          targetPlayerId: 2,
        ),
        isFalse,
      );
    });

    test('kendi rütbesini değiştiremiyor', () {
      expect(
        canSetCouncil(
          myRole: MwRole.leader,
          myPlayerId: 7,
          targetRole: MwRole.leader,
          targetPlayerId: 7,
        ),
        isFalse,
      );
    });
  });

  group('liderlik devri', () {
    test('yalnız Lider, kendine değil', () {
      expect(
        canTransferLeadership(
          myRole: MwRole.leader,
          myPlayerId: 1,
          targetPlayerId: 2,
        ),
        isTrue,
      );
      expect(
        canTransferLeadership(
          myRole: MwRole.leader,
          myPlayerId: 7,
          targetPlayerId: 7,
        ),
        isFalse,
      );
      expect(
        canTransferLeadership(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetPlayerId: 2,
        ),
        isFalse,
      );
    });
  });

  group('ittifaktan ayrılma', () {
    test('Asker ve Konsey serbestçe ayrılabiliyor', () {
      for (final r in [MwRole.member, MwRole.council]) {
        final k = leaveGate(myRole: r, memberCount: 5);
        expect(k.canLeave, isTrue);
        expect(k.disbands, isFalse);
      }
    });

    /// ⚠️⚠️ `leader_must_transfer` — lider üye varken ayrılamıyor. Kapı olmasaydı ittifak
    /// lidersiz kalırdı.
    test('⭐⭐ Lider ÜYE VARKEN ayrılamıyor ve sebebi yazılıyor', () {
      final k = leaveGate(myRole: MwRole.leader, memberCount: 4);
      expect(k.canLeave, isFalse);
      expect(k.reason, contains('Liderlik Devri'));
    });

    /// ⚠️⚠️ **TEK ÜYE KALAN LİDERDE AYRILMAK = DAĞITMAK** ve sunucu bunu sessizce yapıyor.
    /// Ekran bunu söylemezse lider ittifağını kazara siler — `disbands` bayrağı onay metnini
    /// değiştirmek için var.
    test('⭐⭐ son üye kalan Lider ayrılınca ittifak DAĞILIYOR', () {
      final k = leaveGate(myRole: MwRole.leader, memberCount: 1);
      expect(k.canLeave, isTrue);
      expect(k.disbands, isTrue);
    });
  });

  group('yetki kapıları', () {
    /// ⚠️ Ad kimliğin kendisi → tek imza (Lider). Metin bir tanıtım alanı → Konsey de
    /// düzenleyebiliyor, yoksa her düzeltme için lider çağrılırdı.
    test('⭐ ad ve dağıtma yalnız Lider; metin ve mesaj Konsey\'e de açık', () {
      expect(canRename(MwRole.council), isFalse);
      expect(canRename(MwRole.leader), isTrue);
      expect(canDisband(MwRole.council), isFalse);
      expect(canDisband(MwRole.leader), isTrue);

      expect(canEditText(MwRole.council), isTrue);
      expect(canBroadcast(MwRole.council), isTrue);
      expect(canInvite(MwRole.council), isTrue);
    });

    test('Asker hiçbirini yapamıyor', () {
      expect(canRename(MwRole.member), isFalse);
      expect(canDisband(MwRole.member), isFalse);
      expect(canEditText(MwRole.member), isFalse);
      expect(canBroadcast(MwRole.member), isFalse);
      expect(canInvite(MwRole.member), isFalse);
    });
  });

  group('ittifak adı', () {
    /// ⚠️ Sunucudaki `ALLIANCE_RULES` ile aynı sayılar. Ayrışırsa kutu sunucunun reddedeceği
    /// bir adı kabul eder — ad kuralında (`kNameMax`) tam bu yaşandı.
    test('⭐ sınırlar sunucudaki ALLIANCE_RULES ile aynı', () {
      expect(kAllianceMinCastle, 5);
      expect(kAllianceNameMin, 3);
      expect(kAllianceNameMax, 10);
      expect(kAllianceTextMax, 500);
    });

    test('sınırlar dâhil geçerli', () {
      expect(isAllianceNameOk('abc'), isTrue);
      expect(isAllianceNameOk('1234567890'), isTrue);
    });

    test('kısa ve uzun reddediliyor', () {
      expect(isAllianceNameOk('ab'), isFalse);
      expect(isAllianceNameOk('12345678901'), isFalse);
    });

    /// ⚠️ Sunucu da `trim()` uyguluyor: boşluklardan ibaret bir ad düğmeyi açıp reddedilirdi.
    test('⭐ baştaki/sondaki boşluk sayılmıyor', () {
      expect(isAllianceNameOk('  ab  '), isFalse);
      expect(isAllianceNameOk('  abc  '), isTrue);
    });
  });

  group('üye durumu', () {
    /// ⚠️⚠️ **Tatil çevrimiçilikten ÖNCE geliyor** (kullanıcı şartı). Sunucu iki alanı bilerek
    /// ayrı bırakıyor: tatildeki oyuncu teknik olarak bağlı olabilir. Oyuncunun bilmesi gereken
    /// şey «saldırılamaz» olduğu, o an bağlı olup olmadığı değil.
    test('⭐⭐ tatil, çevrimiçiliği EZİYOR', () {
      expect(
        memberState(onVacation: true, online: true),
        MwMemberState.vacation,
      );
      expect(
        memberState(onVacation: true, online: false),
        MwMemberState.vacation,
      );
    });

    test('tatilde değilse çevrimiçilik okunuyor', () {
      expect(
        memberState(onVacation: false, online: true),
        MwMemberState.online,
      );
      expect(
        memberState(onVacation: false, online: false),
        MwMemberState.offline,
      );
    });
  });
}
