/**
 * ⭐ KATALOGDAN TÜRETİLEN AYARLAR (2. nesil Tur 5) — yapı ve teknik **başına** taban fiyat,
 * büyüme oranı ve süre çarpanı.
 *
 * Kullanıcının sorusu buydu: *"her tekniğin base fiyatı, her yapının base fiyatı… diğer
 * binaların ve tekniklerin büyüme oranlarını nasıl görüp düzenlerim?"* Cevap bugüne kadar
 * "düzenleyemezsin"di: panelde yalnız **global** çarpanlar vardı, taban fiyatlar derlenmiş
 * TypeScript'te sabitti.
 *
 * ⚠️ **ELLE YAZILMADI, TÜRETİLDİ.** 84 satırlık el yazımı bir blok iki şeyi bozardı:
 *   1. `combat.ts:34`'ün uyardığı tabloya dönüşürdü — *"yeni bir ayar eklenince BURAYA da
 *      satır eklenmezse ayar panelde görünür ama motora hiç ulaşmaz"*.
 *   2. Varsayılanlar **kopya** olurdu: `castle:gold` varsayılanı 200 yazılır, `buildings.ts`
 *      bir gün 220 olur ve panel yalan söylerdi. Burada varsayılan kaynağından geliyor.
 *
 * ⚠️ Bağımlılık yönü `settings → catalog` ve TEK YÖNLÜ: `packages/catalog`in hiç bağımlılığı
 * yok (`package.json`de `dependencies` bloğu bile yok), `@mobilwar/settings`i import etmiyor.
 * Döngü riski yok; `turbo.json` sıralamayı `^build` ile zaten çözüyor.
 */
import {
  BUILDINGS, BUILDING_ORDER, DEFENSE_ORDER, LEVEL_BASED, TECHS, TECH_ORDER,
  UNITS, WARRIOR_ORDER, orderBy,
} from '@mobilwar/catalog';
import type { SettingDef } from './types.ts';

/** ⚠️ Türetilmiş açıklamalar KISA: 84 uzun metin `GET /admin/settings` yükünü şişirirdi. */
const AXIS_HELP: Record<string, string> = {
  gold: 'Bu kalemin 1. seviyedeki altın fiyatı. Büyütürsen her seviye pahalanır — eğri aynı '
    + 'kalır, sadece yukarı kayar.',
  food: 'Bu kalemin 1. seviyedeki yemek fiyatı. Altın gibi çalışır.',
  rate: 'Her seviyenin bir öncekine göre kaç kat pahalı olduğu. Büyütürsen üst seviyeler '
    + 'hızla erişilemez olur, küçültürsen oyun çabuk biter. Boş bırakırsan genel oran geçerli.',
  timeFactor: 'Hesaplanan süreyi çarpar (1 = dokunma). ⚠️ Oyunda ayrı bir "taban süre" YOK; '
    + 'süre fiyattan türüyor. 0,5 yaparsan bu kalem iki kat hızlı biter, fiyatı değişmez.',
};

const AXIS_LABEL: Record<string, string> = {
  gold: 'Altın', food: 'Yemek', rate: 'Büyüme oranı', timeFactor: 'Süre çarpanı',
};

function defsFor(
  kind: 'building' | 'tech' | 'unit',
  group: string,
  items: readonly { id: string; name: { tr: string }; baseGold: number; baseFood: number }[],
  defaultRate: (id: string) => number,
  defaultTimeFactor: (id: string) => number = () => 1,
  /**
   * ⚠️ **Birimlerde `rate` YOK.** Yapı/teknikte `rate` "her seviye kaç kat pahalı" demek;
   * birimin seviyesi olmadığı için orada anlamsız bir kutu olurdu. Eksen listesi bu yüzden
   * parametre — eksik bırakılmış değil, bilerek daraltılmış.
   */
  axes: readonly ('gold' | 'food' | 'rate' | 'timeFactor')[] = ['gold', 'food', 'rate', 'timeFactor'],
): SettingDef[] {
  const out: SettingDef[] = [];
  for (const it of items) {
    const bases: Record<string, number> = {
      gold: it.baseGold, food: it.baseFood,
      rate: defaultRate(it.id), timeFactor: defaultTimeFactor(it.id),
    };
    for (const axis of axes) {
      const base = bases[axis]!;
      out.push({
        key: `${group}.${it.id}:${axis}`,
        label: `${it.name.tr} · ${AXIS_LABEL[axis]}`,
        /**
         * ⚠️ Sınırlar da TÜRETİLİYOR. Sabit bir `max` koysaydık Teleport'un 500.000'lik
         * tabanı neredeyse kilitli olurdu (`max: 1_000_000` ile ancak iki katına çıkardı).
         */
        type: axis === 'rate' || axis === 'timeFactor' ? 'number' : 'int',
        default: base,
        min: axis === 'rate' ? 1 : axis === 'timeFactor' ? 0.01 : 0,
        max: axis === 'rate' ? 3 : axis === 'timeFactor' ? 100 : Math.max(1000, base * 100),
        tag: 'design',
        description: AXIS_HELP[axis]!,
        entity: { kind, id: it.id, name: it.name.tr, axis },
      });
    }
  }
  return out;
}

/**
 * ⚠️ `rate` varsayılanı **etkin** değeri gösteriyor: Çiftlik/Maden ayrı eğride (1,45), diğer
 * yapılar 1,8, tüm teknikler 1,5. Hepsine tek bir sayı yazsaydık panel yalan söylerdi.
 *
 * ⚠️⚠️ Bu varsayılanlar `config.ts`ten okunmuyor, **elle yazılıyor** — çünkü
 * `DEFAULT_CATALOG_CONFIG` import etmek `packages/settings`i katalog config'inin şekline de
 * bağlardı. Yani buradaki sayı `config.ts`teki `economyCostRate`/`buildingCostRate`/`techCostRate`
 * ile **elle senkron tutulmalı**; bir test ikisinin uyuştuğunu doğruluyor ve o test yoksa panel
 * sessizce yanlış varsayılan gösterir. (2026-08-10'da 1,33 → 1,45 tam bu yoldan geçti.)
 */
const BUILDING_RATE_DEFAULT = (id: string): number =>
  (BUILDINGS.find((b) => b.id === id)?.economyCostCurve ? 1.45 : 1.8);

/**
 * ⚠️ **Mimar Okulu'nun süre çarpanı 1 DEĞİL 0,1** — katalogdaki tek `buildingTuning` kaydı
 * (`config.ts`, Java'nın `×10`'unun karşılığı). Burada 1 bırakılsaydı panel «varsayılan 1» der,
 * yönetici 1 yazar ve oyunun en yavaş yapısı sessizce **10 kata** çıkardı. Aynı elle-senkron
 * sözleşmesi `BUILDING_RATE_DEFAULT` için de geçerli; ikisini de bir test kilitliyor.
 */
const BUILDING_TIME_FACTOR_DEFAULT = (id: string): number =>
  (id === 'architect_school' ? 0.1 : 1);

/**
 * ⭐ BİRİM AYARLARI (2026-08-12) — kullanıcı: *"askerlerin taban üretim süreleri de admin
 * panelden değiştirilebilir olsun."*
 *
 * ⚠️ Oyunda **ayrı bir «taban süre» alanı YOK**: süre fiyattan türüyor
 * (`unitTimeValue = altın + yemek + taşıma`). Bu yüzden iki ayrı düğme var ve farkları önemli:
 *   • `gold`/`food` → **hem fiyatı hem süreyi** değiştirir (gerçek taban),
 *   • `timeFactor`  → **yalnız süreyi** çarpar, fiyat sabit kalır.
 * Yapı/teknikteki `timeFactor` ile birebir aynı sözleşme.
 *
 * ⚠️ Sıra Baraka/Savunma ekranlarıyla aynı (`WARRIOR_ORDER` → `DEFENSE_ORDER`), panelde
 * oyuncunun gördüğü sırayla dolaşılabilsin diye. ⚠️ `LEVEL_BASED` (Sur · Büyü Kalkanı ·
 * Tapınak) DIŞARIDA: onlar adet değil SEVİYE taşıyor ve fiyatları `defenseStructureCost`ten
 * geliyor, `unitCost`tan değil — buraya konsalardı panel etkisiz bir kutu gösterirdi.
 */
const TUNABLE_UNITS = [
  ...orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER),
  ...orderBy(UNITS.filter((u) => u.kind === 'defense' && !LEVEL_BASED.has(u.id)), DEFENSE_ORDER),
].map((u) => ({ id: u.id, name: u.name, baseGold: u.gold, baseFood: u.food }));

export function derivedCatalogSettings(): SettingDef[] {
  return [
    ...defsFor(
      'building', 'buildingTuning', orderBy(BUILDINGS, BUILDING_ORDER),
      BUILDING_RATE_DEFAULT, BUILDING_TIME_FACTOR_DEFAULT,
    ),
    ...defsFor('tech', 'techTuning', orderBy(TECHS, TECH_ORDER), () => 1.5),
    ...defsFor(
      'unit', 'unitTuning', TUNABLE_UNITS, () => 1, () => 1,
      ['gold', 'food', 'timeFactor'],
    ),
  ];
}
