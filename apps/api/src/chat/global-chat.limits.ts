/**
 * ⭐ GENEL SOHBET LİMİTLERİ (§13.12.4) — `chat.limits.ts` ve `alliance-chat.limits.ts`in üçüzü.
 *
 * Aynı sözleşme: değerler **panelden** (`@mobilwar/settings` şeması) gelir, fonksiyon
 * **bellekten** okur (DB'ye gitmez), `const` bir nesne yerine açık çağrı kullanılır ki
 * değerin çalışma zamanında değişebildiği görünür olsun.
 *
 * ⚠️ **`enabled` burada ittifaktakinden DAHA SERT.** İttifak sohbetinde kapatmak yalnız yazmayı
 * durdurur, geçmiş okunmaya devam eder. Burada özellik **tamamen** kapanır (okuma dâhil) —
 * kullanıcı şartı: *"oyunun gerçek üretime çıktığı aşamada tamamen iptal edilecek… tamamen
 * devre dışı olacak"*. Yani bu anahtar bir "yavaşlatma" değil, bir **kaldırma** anahtarı.
 *
 * ⚠️ Kova kapsamı `'channel'` (ittifakla aynı, DM'den farklı): yalnız genel kanal sayılır.
 * Ortak olsaydı hareketli bir genel sohbet oyuncunun özel mesaj hakkını yer, tersine bir DM
 * spamcısı da genel sohbete yazarak kotasını temizlerdi (`chat.guards.ts` → `assertFlowOk`).
 */
import { liveBool, liveNumber } from '../settings/live.ts';
import { CHAT_BODY_MAX } from './chat.limits.ts';

export interface GlobalChatLimits {
  /** ⚠️ Kapalıyken YAZMA da OKUMA da durur — yukarıdaki gerekçe. */
  enabled: boolean;
  /**
   * ⚠️ Gövde uzunluğu AYARLANABİLİR DEĞİL ve `chat.limits.ts`ten **import ediliyor**,
   * kopyalanmıyor: `packages/contracts`teki `max(500)` ile aynı sayı olmak zorunda.
   */
  bodyMax: number;
  /** Kova: `perSeconds` içinde en fazla `burst` mesaj — **kanal başına**. */
  burst: number;
  perSeconds: number;
  /** Aynı metnin tekrar gönderilemeyeceği süre. 0 → kapalı. */
  duplicateSeconds: number;
  /** İki mesaj arasındaki asgarî süre. 0 → kapalı. ⚠️ Burada varsayılan AÇIK (5 sn). */
  slowModeSeconds: number;
  /** Oyuncunun o dünyada yazabilmek için doldurması gereken süre. ⚠️ Varsayılan 0. */
  minPlayerAgeMinutes: number;
  /** Geçmiş sayfası (keyset). */
  pageSize: number;
  /** Tek mesajda en fazla kaç bahsetme çözülür. 0 → özellik kapalı. */
  maxMentions: number;
  /** `@` öneri ucunun döndürdüğü en fazla satır. */
  suggestLimit: number;
  /** «Yazıyor…» yayını (odadaki herkese gider; tek gerçek ek yük kaynağı). */
  typingEnabled: boolean;
}

/** O anki etkin genel sohbet limitleri. */
export function globalChatLimits(): GlobalChatLimits {
  return {
    enabled: liveBool('globalChat', 'enabled', true),
    bodyMax: CHAT_BODY_MAX,
    burst: liveNumber('globalChat', 'burst', 5),
    perSeconds: liveNumber('globalChat', 'perSeconds', 10),
    duplicateSeconds: liveNumber('globalChat', 'duplicateSeconds', 30),
    slowModeSeconds: liveNumber('globalChat', 'slowModeSeconds', 5),
    minPlayerAgeMinutes: liveNumber('globalChat', 'minPlayerAgeMinutes', 0),
    pageSize: liveNumber('globalChat', 'pageSize', 30),
    maxMentions: liveNumber('globalChat', 'maxMentions', 3),
    suggestLimit: liveNumber('globalChat', 'suggestLimit', 8),
    typingEnabled: liveBool('globalChat', 'typingEnabled', true),
  };
}
