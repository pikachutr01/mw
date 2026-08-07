/**
 * ⭐ İTTİFAK SOHBETİ LİMİTLERİ (§13.15c) — `chat.limits.ts`in ikizi.
 *
 * Aynı sözleşme: değerler **panelden** (`@mobilwar/settings` şeması) gelir, fonksiyon
 * **bellekten** okur (DB'ye gitmez), `const` bir nesne yerine açık çağrı kullanılır ki
 * değerin çalışma zamanında değişebildiği görünür olsun.
 *
 * ⚠️ **Sınırlar DM'den AYRI ve bu bilinçli.** En kritik ayrım kova kapsamı: DM kovası
 * oyuncunun tüm kanallarını sayarken burada yalnız ittifak kanalı sayılıyor
 * (`chat.guards.ts` → `assertFlowOk`). Ortak olsaydı hareketli bir ittifak sohbeti oyuncunun
 * özel mesaj hakkını yer, tersine bir DM spamcısı da ittifakta yazarak kotasını temizlerdi.
 */
import { liveBool, liveNumber } from '../settings/live.ts';
import { CHAT_BODY_MAX } from './chat.limits.ts';

export interface AllianceChatLimits {
  /** Kapalıyken yazma durur, geçmiş okunmaya devam eder (acil vana). */
  enabled: boolean;
  /**
   * ⚠️ Gövde uzunluğu AYARLANABİLİR DEĞİL ve `chat.limits.ts`ten **import ediliyor**,
   * kopyalanmıyor: `packages/contracts`teki `max(500)` ile aynı sayı olmak zorunda. Ayrışsaydı
   * istemcinin geçerli saydığı bir mesajı sunucu reddederdi.
   */
  bodyMax: number;
  /** Kova: `perSeconds` içinde en fazla `burst` mesaj — **kanal başına**. */
  burst: number;
  perSeconds: number;
  /** Aynı metnin tekrar gönderilemeyeceği süre. 0 → kapalı. */
  duplicateSeconds: number;
  /** İki mesaj arasındaki asgarî süre. 0 → kapalı. */
  slowModeSeconds: number;
  /** İttifağa katılan üyenin yazabilmesi için geçmesi gereken süre (okumak serbest). */
  newMemberHours: number;
  /** Geçmiş sayfası (keyset). */
  pageSize: number;
  /** Tek mesajda en fazla kaç bahsetme çözülür. 0 → özellik kapalı. */
  maxMentions: number;
  /** Açılışta çekilen en fazla üye (çevrimiçi noktaları + @ önerileri). */
  rosterMax: number;
}

/** O anki etkin ittifak sohbeti limitleri. */
export function allianceChatLimits(): AllianceChatLimits {
  return {
    enabled: liveBool('allianceChat', 'enabled', true),
    bodyMax: CHAT_BODY_MAX,
    burst: liveNumber('allianceChat', 'burst', 8),
    perSeconds: liveNumber('allianceChat', 'perSeconds', 10),
    duplicateSeconds: liveNumber('allianceChat', 'duplicateSeconds', 20),
    slowModeSeconds: liveNumber('allianceChat', 'slowModeSeconds', 0),
    newMemberHours: liveNumber('allianceChat', 'newMemberHours', 2),
    pageSize: liveNumber('allianceChat', 'pageSize', 30),
    maxMentions: liveNumber('allianceChat', 'maxMentions', 5),
    rosterMax: liveNumber('allianceChat', 'rosterMax', 300),
  };
}
