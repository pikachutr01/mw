import type { BuildingDef } from './types.ts';

/**
 * Yapılar ve taban maliyetleri (SİSTEM PLANI §13.9 — kullanıcı onaylı öneri tablosu).
 * Orijinal sunucu ölü olduğu için yapı/teknik TABAN maliyetleri elimizde yoktu; bu değerler
 * deneme-yanılmayla ayarlanacak → `world_config.economy.bases` bunları geçersiz kılabilir.
 *
 * ⭐ **`baseGold`/`baseFood` = oyuncunun ÖDEDİĞİ İLK yükseltmenin fiyatı** (kullanıcı, 2026-07-28).
 * `STARTING_BUILDINGS`'te olan yapılar (Kale · Çiftlik · Maden) oyuna **seviye 1**
 * başladığı için onlarda bu, **1→2** yükseltmesinin fiyatıdır; diğerlerinde (Baraka dâhil,
 * 2026-08-09'dan beri) seviye 1'in.
 * Ölçekleme `buildingCost()` içinde tek yerde yapılıyor.
 *
 * Seviye tavanları (§13.11.2): Çiftlik/Maden 40 · diğer yapılar 20 · teknikler sınırsız.
 * Kale bütçesi (§13.11.1): Σ(bina seviyeleri) ≤ Kale × 10 — Kale kendisi ve Sur/Büyü Kalkanı hariç.
 */
export const BUILDINGS: readonly BuildingDef[] = [
  b('castle', 'Kale', 200, 150, 20, false, false),
  b('barracks', 'Baraka', 120, 80, 20, false, true),
  // ⭐ EKONOMİ YAPILARI — kullanıcı kararı (2026-07-27): ürettiği kaynaktan AĞIR yer.
  // Maden altın üretir → altın ağırlıklı (4/3); Çiftlik yemek üretir → yemek ağırlıklı (3/4).
  // Bu sayılar **1→2 yükseltmesinin** fiyatı (ikisi de seviye 1 başlıyor).
  b('farm', 'Çiftlik', 3, 4, 40, true, true),
  b('mine', 'Maden', 4, 3, 40, true, true),
  b('academy', 'Akademi', 250, 180, 20, false, true),
  b('architect_school', 'Mimar Okulu', 180, 120, 20, false, true),
  b('cave', 'Mağara', 150, 100, 20, false, true),
  b('temple', 'Tapınak', 400, 300, 20, false, true),
  // Teleport sv1 = 500.000/500.000 (kullanıcı hatırası, §13.11.4) → taban doğrudan bu.
  b('teleport', 'Teleport', 500_000, 500_000, 20, false, true),
] as const;

function b(
  id: BuildingDef['id'], tr: string, baseGold: number, baseFood: number,
  maxLevel: number, economyCostCurve: boolean, consumesCastleBudget: boolean,
): BuildingDef {
  return { id, name: { tr }, baseGold, baseFood, maxLevel, economyCostCurve, consumesCastleBudget };
}

export const BUILDINGS_BY_ID: Readonly<Record<string, BuildingDef>> = Object.fromEntries(
  BUILDINGS.map((x) => [x.id, x]),
);

/**
 * Yeni şehrin başlangıç yapı seviyeleri (§13.11.1) — **başkent ve koloni için AYNI**.
 *
 * ⚠️ **Baraka 2026-08-09'da listeden ÇIKARILDI** (kullanıcı): *"çiftlik ve maden seviyesi 1,
 * kale seviyesi 1, diğer tüm yapıların seviyesi 0 … Baraka da 0 başlar."* Öncesinde `barracks: 1`
 * yazıyordu, yani hem yeni kayıtta hem yeni kurulan şehirde baraka bedava geliyordu.
 *
 * ⚠️ İki yan etkisi var ve ikisi de kuralın doğal sonucu, ayrıca ele alınmadı:
 *   • **Fiyat**: `baseGold/baseFood` "oyuncunun ödediği İLK yükseltmenin fiyatı" demek
 *     (`buildingCost`). Baraka artık 0'dan başladığı için taban **seviye 1'e** oturdu: sv1 =
 *     120/80 (yeni, eskiden bedavaydı), sv2 = 216/144 (eskiden 120/80). Sayılara dokunulmadı.
 *   • **Sefer limiti**: `assertMarchLimit` `Math.max(1, barakaSeviyesi)` kullanıyor, yani
 *     barakasız şehir bile 1 sefer çıkarabiliyor — yeni oyuncu kilitlenmiyor.
 */
export const STARTING_BUILDINGS: Readonly<Record<string, number>> = {
  castle: 1,
  farm: 1,
  mine: 1,
};

/**
 * Başlangıç kaynağı (§13.11.1a, kullanıcı kararı 2026-07-26).
 * YALNIZ başkent alır; kurulan koloni sıfırla doğar (kur-al-terk et sömürüsünü kapatır).
 */
export const STARTING_RESOURCES = { gold: 4000, food: 4000 } as const;
export const COLONY_STARTING_RESOURCES = { gold: 0, food: 0 } as const;
