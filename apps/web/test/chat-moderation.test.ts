/**
 * ⭐ İTTİFAK SOHBETİ MODERASYON KURALLARI (`lib/chat-moderation.ts`).
 *
 * ⚠️ Bu testler kuralın **sunucuyla aynı olduğunu ispatlayamaz** — o iş sunucudaki
 * `alliance-chat.test.ts` bekçilerinde. Buradaki testler kuralın **kazara değişmemesini**
 * sağlıyor ve asıl kilitledikleri şey, silme ile susturmanın AYRIŞTIĞI iki nokta:
 * kendi mesajın ve ayrılmış üyenin mesajı.
 *
 * ⚠️ Varlık sebebi ölçülmüş bir kayma: genel sohbette `⋮` düğmesi gönderen başlığının içinde
 * yaşıyordu ve ardışık mesajlarda başlık çizilmediği için **yetkisi olan** moderatör o
 * mesajlara hiç ulaşamıyordu (kullanıcı bildirdi, 2026-08-11). Yetki kararı React'in içinde
 * yaşadığı sürece böyle bir hata sessiz kalıyor.
 */
import { describe, expect, it } from 'vitest';
import {
  canDeleteAllianceMessage, canMuteAllianceMember, ROLE,
} from '../src/lib/chat-moderation.ts';

const ME = 10;
const BASKASI = 20;

describe('mesaj kaldırma yetkisi', () => {
  it('⚠️ Asker HİÇBİR mesajı kaldıramaz (kendi mesajı dahil)', () => {
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.MEMBER, senderId: ME, senderRole: ROLE.MEMBER,
    })).toBe(false);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.MEMBER, senderId: BASKASI, senderRole: ROLE.MEMBER,
    })).toBe(false);
  });

  it('Konsey yalnız ASKER’in mesajını kaldırır', () => {
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: BASKASI, senderRole: ROLE.MEMBER,
    })).toBe(true);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: BASKASI, senderRole: ROLE.COUNCIL,
    })).toBe(false);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: BASKASI, senderRole: ROLE.LEADER,
    })).toBe(false);
  });

  it('Lider herkesin mesajını kaldırır', () => {
    for (const rutbe of [ROLE.MEMBER, ROLE.COUNCIL]) {
      expect(canDeleteAllianceMessage({
        myId: ME, myRole: ROLE.LEADER, senderId: BASKASI, senderRole: rutbe,
      }), String(rutbe)).toBe(true);
    }
  });

  it('⭐ KENDİ mesajını kaldırmak serbest — susturmadan ayrıldığı 1. nokta', () => {
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: ME, senderRole: ROLE.COUNCIL,
    })).toBe(true);
    /* Lider kendi mesajını da kaldırabilir: «Liderin mesajına dokunulmaz» kuralı BAŞKASININ
       liderine ait; tek liderli ittifakta bu dal yalnız kendisi için çalışır. */
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.LEADER, senderId: ME, senderRole: ROLE.LEADER,
    })).toBe(true);
  });

  it('⭐ AYRILMIŞ üyenin mesajı kaldırılabilir — susturmadan ayrıldığı 2. nokta', () => {
    /* `senderRole: null` = gönderen artık bu ittifakta değil (ya da hesabı silinmiş). */
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: BASKASI, senderRole: null,
    })).toBe(true);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.COUNCIL, senderId: null, senderRole: null,
    })).toBe(true);
    // …ama rütbesi yetmeyen yine kaldıramaz.
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.MEMBER, senderId: BASKASI, senderRole: null,
    })).toBe(false);
  });
});

describe('susturma yetkisi', () => {
  const uye = (playerId: number, role: number) => ({ playerId, role });

  it('Konsey yalnız Asker’i, Lider Asker+Konsey’i susturur', () => {
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.COUNCIL, member: uye(BASKASI, ROLE.MEMBER),
    })).toBe(true);
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.COUNCIL, member: uye(BASKASI, ROLE.COUNCIL),
    })).toBe(false);
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.LEADER, member: uye(BASKASI, ROLE.COUNCIL),
    })).toBe(true);
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.LEADER, member: uye(BASKASI, ROLE.LEADER),
    })).toBe(false);
  });

  it('⚠️ KENDİNİ susturamazsın — silmenin tersi', () => {
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.LEADER, member: uye(ME, ROLE.LEADER),
    })).toBe(false);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.LEADER, senderId: ME, senderRole: ROLE.LEADER,
    })).toBe(true);
  });

  it('⚠️ AYRILMIŞ üye susturulamaz (listede yok) — silmenin tersi', () => {
    expect(canMuteAllianceMember({ myId: ME, myRole: ROLE.LEADER, member: undefined })).toBe(false);
    expect(canDeleteAllianceMessage({
      myId: ME, myRole: ROLE.LEADER, senderId: BASKASI, senderRole: null,
    })).toBe(true);
  });

  it('Asker kimseyi susturamaz', () => {
    expect(canMuteAllianceMember({
      myId: ME, myRole: ROLE.MEMBER, member: uye(BASKASI, ROLE.MEMBER),
    })).toBe(false);
  });
});
