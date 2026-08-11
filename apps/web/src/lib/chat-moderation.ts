/**
 * ⭐ İTTİFAK SOHBETİNİN MODERASYON KURALLARI — istemci tarafındaki aynası.
 *
 * ⚠️⚠️ **Bu kurallar SUNUCUYLA elle senkron.** Tek doğru kaynak
 * `apps/api/src/alliance/alliance.service.ts` → `assertCanModerate`; burası yalnız **düğmeyi
 * gösterip göstermemeye** karar veriyor. Karar burada yanlışsa oyuncu ya erişemediği bir
 * düğme görür (sunucu reddeder, gürültülü) ya da hakkı olan bir işlemi hiç göremez
 * (sessiz — tehlikeli olan bu; genel sohbette `⋮` tam olarak böyle üç ay boyunca ardışık
 * mesajlarda kayboldu).
 *
 * ⚠️ Bu yüzden kurallar `AllianceChatSheet.tsx`ten **ayrı** duruyor: React'siz saf fonksiyon
 * oldukları için test edilebiliyorlar (`apps/web/test/chat-moderation.test.ts`), o dosyanın
 * içindeyken edilemiyorlardı. `lib/mission-rules.ts` ile aynı gerekçe ve aynı ders.
 */

/** İttifak rolleri — sunucudaki `ROLE` sabitinin aynısı (`alliance.service.ts`). */
export const ROLE = { MEMBER: 1, COUNCIL: 2, LEADER: 3 } as const;

/** `null` rütbe = gönderen bu ittifakta DEĞİL (ayrılmış ya da hesabı silinmiş). */
export interface MessageSubject {
  myId: number;
  myRole: number;
  senderId: number | null;
  senderRole: number | null;
}

/**
 * ⭐ Bu mesajı kaldırabilir miyim? (kullanıcı, 2026-08-11 — yetki susturmanın aynısı)
 *
 * Sunucudaki `assertCanModerate(me, target, 'delete_message')` kapısının birebir karşılığı:
 * Konsey yalnız Asker'in, Lider herkesin mesajını kaldırır; Lider'in mesajına yalnız Lider
 * dokunur. **Kendi mesajı** ve **ayrılmış üyenin mesajı** hiyerarşi sorusunun dışında —
 * gerekçe sunucudaki yorumda.
 */
export function canDeleteAllianceMessage(o: MessageSubject): boolean {
  if (o.myRole < ROLE.COUNCIL) return false;
  if (o.senderId != null && o.senderId === o.myId) return true;
  /* Ayrılmış üye / silinmiş hesap: rütbesi artık bu ittifağın rütbesi değil. */
  if (o.senderRole == null) return true;
  if (o.myRole !== ROLE.LEADER && o.senderRole >= ROLE.COUNCIL) return false;
  return o.senderRole !== ROLE.LEADER;
}

/**
 * Bu üyeyi susturabilir miyim?
 *
 * ⚠️ Silmeden ayrılan İKİ nokta: kendini susturamazsın ve **ayrılmış üye susturulamaz**
 * (susturma bir üyeye uygulanır, mesaja değil). Bu yüzden `member` yoksa daima `false`.
 */
export function canMuteAllianceMember(o: {
  myId: number; myRole: number; member: { playerId: number; role: number } | undefined;
}): boolean {
  const m = o.member;
  if (!m) return false;
  if (o.myRole < ROLE.COUNCIL) return false;
  if (m.playerId === o.myId) return false;
  if (m.role >= ROLE.LEADER) return false;
  return o.myRole === ROLE.LEADER || m.role < ROLE.COUNCIL;
}

/**
 * ⭐ Bu oyuncuya ittifak daveti gönderebilir miyim? (dünya modalı → «İttifağa Davet»)
 *
 * Orijinal kapı `g.java:1447`: davet yalnız **Konsey+Lider**e ve yalnız **ittifaksız** hedefe
 * açıktı. Karar burada saf bir fonksiyon çünkü **ağ trafiğini de o belirliyor**: hedefin zaten
 * bir ittifağı varsa düğme hiç çizilmeyecek demektir, dolayısıyla kendi rütbemi öğrenmek için
 * ittifak sorgusunu ATMAYA GEREK YOK (`world-modal.tsx` → `useAlliance(0, !hasAlliance)`).
 *
 * ⚠️ Kural bir yerde, sorgu kapısı başka yerde durursa ikisi kaçınılmaz olarak ayrışır:
 * biri "düğmeyi göster" derken diğeri veriyi hiç çekmemiş olur ve düğme sessizce kaybolur.
 * Bu yüzden ikisi de aynı fonksiyondan besleniyor.
 */
export function canInviteToAlliance(o: {
  myRole: number | null | undefined;
  /**
   * ⚠️ `undefined` = **bilmiyoruz**, "ittifaksız" değil. Alan isteğe bağlı (eski bir sunucuya
   * bakan istemci onu hiç görmez) ve bilinmezliği "ittifaksız" saymak, zaten ittifakı olan
   * bir oyuncuya sunucunun reddedeceği bir davet düğmesi gösterirdi. Bilinmiyorsa engellemiyoruz
   * ama davranış eski hâline dönüyor: sorgu atılır, rütbe okunur, karar sunucuya bırakılır.
   */
  targetHasAlliance: boolean | undefined;
}): boolean {
  return o.targetHasAlliance !== true && (o.myRole ?? 0) >= ROLE.COUNCIL;
}
