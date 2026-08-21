/**
 * ⭐ GÖREV FORMUNUN İKİ POLİTİKA KÜMESİ — hangi görev kahraman taşır, hangisi ordusuz gider.
 *
 * ⚠️⚠️ **İkisi de SUNUCUYLA elle senkron ve bu senkron İKİ KEZ kaydı.**
 *   • 2026-08-03: sunucu kahramanı zaten taşıyabiliyordu (`march()` → `reserveHeroes`), form
 *     hiç kahraman seçtirmiyordu → özellik aylardır yazılıydı ve **ulaşılamıyordu**.
 *   • 2026-08-11: `allowEmptyArmy` sunucuda destek ve teleport için açık DEĞİLDİ ve buradaki
 *     küme de yalnız `found_city` diyordu → oyuncu *"sadece kahramanı seçip gönderemiyorum,
 *     yanına illa savaşçı eklemek gerekiyor"* diye bildirdi.
 *
 * Ayrışmanın iki yönü de kötü ama farklı biçimde: **burada eksikse** düğme pasif kalır ve
 * sunucudaki izin görünmez olur (sessiz, bu yüzden tehlikeli); **burada fazlaysa** form açılır
 * ve sunucu `no_units` ile geri çevirir (gürültülü, çabuk fark edilir).
 *
 * ⚠️ Bu yüzden kümeler `world-modal.tsx`ten **ayrı** duruyor: React'siz saf veri oldukları için
 * test edilebiliyorlar (`apps/web/test/mission-rules.test.ts`), o dosyanın içindeyken
 * edilemiyorlardı ve iki kaymanın da bekçisi yoktu. Sunucu tarafındaki karşılıkları ise
 * `apps/api/test/missions.test.ts` tutuyor (*«YALNIZ KAHRAMAN destek olarak gönderilebilir»*).
 */
import { CANNOT_ATTACK_ALONE } from '@mobilwar/catalog';

/**
 * ⭐ KAHRAMAN GÖNDERİLEBİLEN GÖREVLER (kullanıcı, 2026-08-03).
 *
 * ⚠️ Nakliye ve casusluk DIŞARIDA: nakliyenin işi kaynak taşımak (kahramanın `carry`si yok),
 * casuslukta yalnız Casus Kuş gider.
 */
export const HERO_MISSIONS: ReadonlySet<string> = new Set([
  'attack', 'support', 'teleport', 'found_city',
]);

/**
 * ⭐ ORDUSUZ GİDİLEBİLEN GÖREVLER — kahraman **tek başına** gidebilir.
 *
 * Sunucudaki karşılıkları: `sendFoundCity`/`sendSupport` → `march({ allowEmptyArmy: true })`,
 * `teleport()` → kendi içindeki «ordu da kahraman da yoksa reddet» kapısı.
 *
 * ⚠️ Saldırı burada YOK ve olmamalı: `sendAttack` ortak yoldan geçmiyor, boş orduyu her hâlükârda
 * reddediyor. Eklenseydi form açılır, sunucu geri çevirirdi.
 * ⚠️ Nakliye de YOK: kahraman kaynak taşıyamaz, ordusuz nakliyenin anlamı olmaz.
 */
export const ARMY_OPTIONAL: ReadonlySet<string> = new Set([
  'found_city', 'support', 'teleport',
]);

/**
 * Form gönderilebilir mi — «en az bir birim ya da (izinliyse) bir kahraman».
 *
 * Sunucudaki `march()` kuralının birebir aynası: ordu boşsa yalnız `allowEmptyArmy` olan
 * görevlerde ve yalnız kahraman seçiliyse geçer. İkisi de yoksa hiçbir görevde geçmez.
 */
export function hasCrew(type: string, unitCount: number, heroCount: number): boolean {
  if (unitCount > 0) return true;
  return ARMY_OPTIONAL.has(type) && HERO_MISSIONS.has(type) && heroCount > 0;
}

/**
 * ⭐⭐ YALNIZ YÜK ARABASI İLE SALDIRI BAŞLATILAMAZ (kullanıcı, 2026-08-21) — arabanın
 * yanında en az bir başka birim ("refakatçi") olmalı.
 *
 * ⚠️⚠️ Kural ilk yazımda `NONCOMBAT` kümesine bağlanmıştı ve **gnom da kapıya takılıyordu**.
 * Kullanıcı düzeltti (2026-08-22): *"Savaşmayan birim olsa bile o bir savaşçı sonuçta."*
 * Ölçüt artık katalogdaki `CANNOT_ATTACK_ALONE` ve sunucu da aynı kümeden besleniyor
 * (`mission.service.ts` · `sendAttack`).
 *
 * ⚠️ YALNIZ saldırı: nakliye · destek · şehir kurmada tek başına Yük Arabası **meşru**.
 * ⚠️ Casus Kuş bu kapıya gelmiyor; saldırı listesinde zaten hiç görünmüyor.
 */
export function attackHasEscort(type: string, unitIds: readonly string[]): boolean {
  if (type !== 'attack') return true;
  return unitIds.some((id) => !CANNOT_ATTACK_ALONE.has(id));
}
