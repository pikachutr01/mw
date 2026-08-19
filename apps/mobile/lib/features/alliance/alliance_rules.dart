/// ⭐⭐ İTTİFAK YÖNETİM YETKİLERİ — kim kimi atabilir, kim neyi değiştirebilir.
/// **Saf fonksiyonlar.**
///
/// ⚠️⚠️ Matris sunucudan kopyalandı (`alliance.service.ts` · `require` + `assertCanModerate`)
/// ve **karar VERMİYOR**: son sözü sunucu söylüyor, buradaki iş reddedilecek bir düğmeyi hiç
/// göstermemek. Sohbetteki ikizinde (`chat/alliance_chat_rules.dart`) aynı ayrım yazılı.
///
/// ⚠️ Rütbe sabitleri **oradan** alınıyor (`MwRole`), burada ikinci bir kopya yok: iki yerde
/// iki farklı sayı, matrisin sessizce kayması demekti.
library;

import '../chat/alliance_chat_rules.dart';

/// ⭐ Kurma şartı ve ad sınırları — sunucudaki `ALLIANCE_RULES` ile **aynı sayılar**.
///
/// ⚠️⚠️ Elle yazıldılar ve bu bir borç: `facts.g.dart` üreteci bunları taşımıyor. Sebep,
/// `ALLIANCE_RULES`un `packages/catalog`ta değil **`apps/api` içinde** yaşaması — üreteç
/// oradan import edemiyor (sınır `packages/catalog/src/scoring.ts`te yazılı). ⚠️ Sayılar
/// ayrışırsa kutu sunucunun reddedeceği bir adı kabul eder; ad kuralında (`kNameMax`) tam bu
/// yaşandı. Testler sunucudaki değerlerle karşılaştırıyor ve ayrışma orada yakalanır.
const int kAllianceMinCastle = 5;
const int kAllianceNameMin = 3;
const int kAllianceNameMax = 10;
const int kAllianceTextMax = 500;

/// ⭐ ÜYEYİ İTTİFAKTAN AT.
///
/// Sunucudaki `assertCanModerate(..., 'kick')` ile birebir:
///   • Konsey ya da Lider olmalıyım,
///   • kendimi atamam (`cannot_kick_self` — «İttifaktan Ayrıl» kullanılır),
///   • Konsey yalnız Asker'i atabilir, **Lider asla atılamaz**.
///
/// ⚠️ Susturma matrisiyle aynı olduğu için `canMute`e devrediliyor: iki kopya yazsaydık biri
/// düzeltilip diğeri unutulduğunda ekran sunucuyla çelişirdi. Sunucu da aynı fonksiyonu
/// paylaşıyor, yalnız fiili değiştiriyor.
bool canKick({
  required int myRole,
  required int myPlayerId,
  required int targetRole,
  required int targetPlayerId,
}) => canMute(
  myRole: myRole,
  myPlayerId: myPlayerId,
  targetRole: targetRole,
  targetPlayerId: targetPlayerId,
);

/// ⭐ KONSEYE AL / KONSEYDEN ÇIKAR — **yalnız LİDER** (`setCouncil`).
///
/// ⚠️⚠️ Kick'ten AYRI bir kapı ve daha dar: Konsey başka birini Konsey yapamıyor. Aynı
/// fonksiyona bağlasaydık Konsey rütbesi kendini çoğaltabilirdi.
/// ⚠️ Liderin rütbesi buradan değişmiyor (`hierarchy`): liderlik ancak **devredilir**.
/// ⚠️ Kendine dokunma kontrolü GEREKMİYOR ama yazılı: lider zaten Lider rütbesinde ve ikinci
/// koşula takılıyor. Açıkça yazmak, ileride rütbe eklenirse kuralın sessizce açılmasını
/// engelliyor.
bool canSetCouncil({
  required int myRole,
  required int myPlayerId,
  required int targetRole,
  required int targetPlayerId,
}) {
  if (myRole != MwRole.leader) return false;
  if (targetPlayerId == myPlayerId) return false;
  if (targetRole == MwRole.leader) return false;
  return true;
}

/// ⭐ LİDERLİK DEVRİ — yalnız Lider, kendine değil.
///
/// ⚠️ Devirden sonra eski lider **Konsey'e düşüyor** (orijinal istemcinin `q=2` davranışı),
/// ittifaktan çıkmıyor. Onay metni bunu söylemek zorunda: "liderliği bırakıyorum" ile
/// "ittifaktan ayrılıyorum" oyuncunun kafasında aynı şey olabilir.
bool canTransferLeadership({
  required int myRole,
  required int myPlayerId,
  required int targetPlayerId,
}) => myRole == MwRole.leader && targetPlayerId != myPlayerId;

/// ⭐ İTTİFAKTAN AYRIL.
///
/// ⚠️⚠️ **LİDER, ÜYE VARKEN AYRILAMAZ** (`leader_must_transfer`): önce Liderlik Devri
/// yapmalı. Tek üye kalmışsa ayrılmak ittifağı **DAĞITIYOR** ve sunucu bunu sessizce yapıyor
/// — bu yüzden onay metni de farklı olmak zorunda, yoksa lider ittifağını kazara siler.
({bool canLeave, bool disbands, String? reason}) leaveGate({
  required int myRole,
  required int memberCount,
}) {
  if (myRole != MwRole.leader) {
    return (canLeave: true, disbands: false, reason: null);
  }
  if (memberCount > 1) {
    return (
      canLeave: false,
      disbands: false,
      reason: 'Lider ittifaktan ayrılamaz — önce Liderlik Devri yapmalısın.',
    );
  }
  // Tek üye kalan lider: ayrılmak = dağıtmak.
  return (canLeave: true, disbands: true, reason: null);
}

/// Dağıtma ve yeniden adlandırma **yalnız Lider**; metin ve toplu mesaj **Konsey ve üstü**.
///
/// ⚠️ Metnin Konsey'e açık olması bilinçli: metin bir tanıtım alanı ve liderin her düzeltme
/// için çağrılması ittifağı yavaşlatırdı. Ad ise kimliğin kendisi — orada tek imza var.
bool canDisband(int myRole) => myRole == MwRole.leader;
bool canRename(int myRole) => myRole == MwRole.leader;
bool canEditText(int myRole) => myRole >= MwRole.council;
bool canBroadcast(int myRole) => myRole >= MwRole.council;
bool canInvite(int myRole) => myRole >= MwRole.council;

/// ⭐ İTTİFAK ADI GEÇERLİ Mİ — sunucunun `nameMin`/`nameMax` sınırlarıyla aynı.
///
/// ⚠️ **Kırpılmış** uzunluk: sunucu da `trim()` uyguluyor ve boşluklardan ibaret bir ad
/// düğmeyi açıp sunucuda reddedilirdi.
bool isAllianceNameOk(String name) {
  final n = name.trim().length;
  return n >= kAllianceNameMin && n <= kAllianceNameMax;
}

/// ⭐ ÜYE SATIRININ DURUM ETİKETİ.
///
/// ⚠️⚠️ **Tatil, çevrimiçilikten ÖNCE geliyor** (kullanıcı şartı): tatildeki oyuncu teknik
/// olarak bağlı olabilir (girip durumuna bakıyordur) ve sunucu iki alanı bilerek ayrı
/// bırakıyor — hangisinin gösterileceği ekranın kararı. Oyuncunun bilmesi gereken şey
/// "saldırılamaz" olduğu, o an bağlı olup olmadığı değil.
enum MwMemberState { vacation, online, offline }

MwMemberState memberState({required bool onVacation, required bool online}) {
  if (onVacation) return MwMemberState.vacation;
  return online ? MwMemberState.online : MwMemberState.offline;
}
