/**
 * ⭐ AYAR ŞEMASI — panelin düzenleyebileceği her sayının **künyesi**.
 *
 * Şema saf veridir: DB, HTTP, React bilmez. Hem sunucu doğrulaması hem panelin form üretimi
 * aynı listeden beslenir — iki yerde tanımlansaydı panel var olmayan bir ayarı gösterir ya da
 * sunucu paneldeki bir alanı reddederdi.
 */

/**
 * ⚠️ **ETİKET, ayarın ne kadar serbest olduğunu söyler.** Kod tabanı bu ayrımı zaten
 * yorumlarında taşıyordu (`[REKON]` / `[TASARIM]`); buraya taşındı ki panel de bilsin.
 *
 *  • `measured` — **binary'den ölçülmüş gerçek.** Değiştirilebilir ama oyun orijinalden sapar
 *    ve motor testleri (176 + 53 altın) bu değerlere sabitlenmiştir. Panel uyarı gösterir.
 *  • `design`   — bizim kurgumuz, denge düğmesi. Çekinmeden oynanır.
 *  • `locked`   — değiştirmek tutarlılığı bozar (ör. tur programı). Panel salt-okunur gösterir.
 */
export type SettingTag = 'measured' | 'design' | 'locked';

export type SettingValue = number | boolean;

export interface SettingDef {
  /** Noktalı anahtar: `chat.burst`. Grup adı ilk parçadan türetilir. */
  key: string;
  label: string;
  type: 'int' | 'number' | 'boolean';
  default: SettingValue;
  tag: SettingTag;
  /**
   * ⭐ **DÜZ TÜRKÇE, KALIP: «bu sayı ne yapar · büyütürsen ne olur · küçültürsen ne olur».**
   *
   * ⚠️ Teknik gerekçe (binary adresi, ölçüm sayısı, hata payı) buraya YAZILMAZ — `note`a
   * gider. Kullanıcının şikâyeti tam buydu: *"bu ayarların açıklamalarını biraz daha benim
   * anlayacağım şekilde yazar mısın."* Gerekçe silinmiyor, ikinci katmana iniyor.
   */
  description: string;
  /**
   * «Neden bu sayı» — ölçüm kaynağı, reddedilen alternatif, tarihçe. Panelde ⓘ balonunun
   * altında ayrı bir başlıkla duruyor. Detay kısılmıyor, katmanlanıyor.
   */
  note?: string;
  /** Sayısal sınırlar — panel hem `min`/`max` niteliği olarak kullanır hem sunucu doğrular. */
  min?: number;
  max?: number;
  /**
   * Geçiş dönemi: bu ayar DB'de yoksa ve bu env değişkeni tanımlıysa env kazanır.
   * ⚠️ Amaç geriye uyum — mevcut `.env` dosyaları bir gecede geçersiz olmasın.
   */
  env?: string;
  /** Birim etiketi (panelde alanın yanında yazar): `sn`, `dk`, `adet`, `×`. */
  unit?: string;
  /**
   * ⭐ VARLIK KÜNYESİ (2. nesil Tur 5) — katalogdan türetilmiş ayarlarda dolu.
   *
   * ⚠️ Panel bu alan sayesinde anahtarı **ayrıştırmıyor**. `buildingTuning.castle:gold`
   * anahtarını istemcide parçalamak, ayırıcı bir gün değişirse sessizce bozulan bir bağ
   * kurardı; künye sunucudan hazır geliyor ve matris tablosu onunla gruplanıyor.
   */
  entity?: {
    kind: 'building' | 'tech' | 'unit';
    id: string;
    /** Türkçe ad — matris satır başlığı. */
    name: string;
    axis: 'gold' | 'food' | 'rate' | 'timeFactor';
  };
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
}

/** Etkin ayarlar — noktalı anahtarlardan kurulmuş donmuş iç içe nesne. */
export type EffectiveSettings = Readonly<Record<string, Readonly<Record<string, SettingValue>>>>;
