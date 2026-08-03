/**
 * ⭐ ARAYÜZ SIRALAMASI (kullanıcı kararı, 2026-07-26) — orijinal oyundaki sıra.
 *
 * ⚠️ Sıralama **sunum** bilgisidir, denge verisi DEĞİL → bu yüzden `UNITS`/`BUILDINGS`/`TECHS`
 * dizilerinin kendi sırası değiştirilmiyor. Diziyi yeniden sıralasaydık `catalogHash()` değişir ve
 * savaş kayıtlarında sahte bir "denge değişti" sinyali doğardı (§5).
 *
 * Listede olmayan bir `id` sona düşer — yeni kalem eklenince arayüz bozulmaz, sadece en sonda çıkar.
 */

/** Yapılar ekranı: Çiftlik → Maden → Baraka → Akademi → Kale → Mimar Okulu → Mağara → Tapınak → Teleport */
export const BUILDING_ORDER: readonly string[] = [
  'farm',
  'mine',
  'barracks',
  'academy',
  'castle',
  'architect_school',
  'cave',
  'temple',
  'teleport',
];

/**
 * Akademi ekranı: Okçuluk → Demircilik → Haritacılık → Büyücülük → Casusluk → Zırh →
 * Kimya → Taş Ustalığı → Sömürgecilik → Gece Görüş → İçgüdü → Tılsım
 * (Genel Durum ekranındaki orijinal sırayla aynı — `scr_web05`.)
 */
export const TECH_ORDER: readonly string[] = [
  'archery',
  'blacksmithing',
  'cartography',
  'sorcery',
  'espionage',
  'armor',
  'chemistry',
  'masonry',
  'colonization',
  'night_vision',
  'instinct',
  'talisman',
];

/** Savaşçılar (Baraka ekranı) — orijinal stat tablosu sırası zaten doğru. */
export const WARRIOR_ORDER: readonly string[] = [
  'dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre', 'shaman',
  'spy_bird', 'cargo_wagon', 'gnome', 'chaos',
];

/**
 * Savunma ekranı — **Sur ve Büyü Kalkanı EN ÜSTTE** (kullanıcı, 2026-08-03).
 *
 * ⚠️ Bu dizi Savunma ekranıyla **simülatörü birlikte** sıralıyor (`Simulate.tsx`). İkisinin
 * ayrışması istenirse simülatöre ayrı bir sabit gerekir; bugün bilerek tek liste.
 *
 * Gerekçe: ikisi `LEVEL_BASED` — adet değil SEVİYE taşırlar ve savaşta hiç ölmezler. Listenin
 * sonunda dururken "en önemsiz" gibi okunuyorlardı; oysa savunmanın çatısı onlar.
 */
export const DEFENSE_ORDER: readonly string[] = [
  'wall', 'magic_shield', 'archer_tower', 'trap', 'oil_cauldron', 'mangonel_tower', 'guard', 'ballista',
];

/** Verilen sıraya göre diziyi düzenler; listede olmayanlar sona, kendi aralarında sırayı korur. */
export function orderBy<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) =>
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
