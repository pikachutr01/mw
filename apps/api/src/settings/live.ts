/**
 * ⭐ CANLI AYAR KÖPRÜSÜ — modül seviyesindeki limit sabitleriyle `SettingsService` arasında.
 *
 * Sorun şuydu: `CHAT_LIMITS`, `NOTIFY_LIMITS`, `MAIL_LIMITS` modül yüklenirken `process.env`den
 * okunan **donmuş** nesnelerdi ve 23 yerde tüketiliyorlardı. Panelden düzenlenebilmeleri için
 * ya 23 çağrı noktasına `worldId` geçirmek ya da nesneleri canlı hâle getirmek gerekiyordu.
 *
 * Seçilen yol: **tek bir yerde tutulan etkin görüntü**, tüketiciler onu fonksiyonla okur
 * (`chatLimits().burst`). Gizli `get` erişimcileri değil AÇIK fonksiyon: `const` görünen bir
 * nesnenin altından değerin değişmesi, bu kod tabanının tam da uyardığı sınıfta bir sürpriz
 * olurdu.
 *
 * ⚠️ **KAPSAM: kurulum geneli (dünya 0).** İşletim limitleri bugün dünya bilmeyen yerlerde de
 * okunuyor (`mail/templates.ts`, `mail.service.ts` — orada `worldId` hiç yok). Dünya bazlı
 * geçersiz kılma **saklanıyor ve panelde görünüyor** ama tüketim dünya 0 katmanından. Gerçek
 * dünya bazlı limit gerektiğinde çağrı noktalarına `worldId` geçirilecek; depolama değişmez.
 */
import type { SettingValue } from '@mobiwar/settings';

type Group = Readonly<Record<string, SettingValue>>;

/**
 * Etkin görüntü. `SettingsService.load()` her tazelemede bunu değiştirir.
 * Başlangıç değeri boş: servis kalkmadan okunursa tüketici kendi varsayılanına düşer.
 */
let active: Readonly<Record<string, Group>> = Object.freeze({});

export function setLiveSettings(groups: Readonly<Record<string, Group>>): void {
  active = groups;
}

/**
 * Bir grubun sayısal alanını okur; ayar yoksa çağıranın varsayılanına düşer.
 * ⚠️ Sessiz düşüş bilinçli: servis henüz yüklenmemişken (açılışın ilk milisaniyeleri, testler)
 * limit okuması patlamamalı.
 */
export function liveNumber(group: string, key: string, fallback: number): number {
  const v = active[group]?.[key];
  return typeof v === 'number' ? v : fallback;
}
