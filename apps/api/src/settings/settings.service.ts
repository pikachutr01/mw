/**
 * ⭐ AYAR SERVİSİ — panelden düzenlenen sabitleri **bellekte** tutar, DB'yi sıcak yoldan çıkarır.
 *
 * Kullanıcının sorusu tam buydu: *"bu değerleri veri tabanına alırsan oyun her seferinde
 * oradan okuyup ek yük oluşturacak mı?"* Cevap **hayır**:
 *
 *     Açılışta bir kez:    settings tablosu ──► donmuş anlık görüntü (dünya başına)
 *     Her istekte:         settings.chat(worldId).burst ──► ÖZELLİK OKUMASI, 0 sorgu
 *     Admin kaydettiğinde: yazım + NOTIFY ──► tüm süreçler yeniden yükler (ms mertebesi)
 *
 * Yani bir ayarın bugünkü maliyeti `import`tan gelen nesne okuması; yarınki de aynı.
 * Bu iddia `settings.test.ts`te **sorgu sayacıyla** ölçülüyor — kanıtlanmadan katalog fazı
 * (Faz 5) açılmayacak.
 *
 * ⚠️ Geçersiz kılma için **ayrı bir Postgres kanalı** (`mw_settings`) kullanılıyor,
 * `realtime.bus.ts`in `mw_realtime` kanalı DEĞİL. Sebep: o kanaldaki her olay gateway
 * tarafından **soketlere dağıtılıyor**; ayar değişikliğini oraya koysaydık dünyadaki tüm
 * oyunculara anlamsız bir olay giderdi.
 */
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';
import {
  applySettings, validatePatch, type EffectiveSettings, type SettingValue,
} from '@mobilwar/settings';
import { mergeMapConfig, type CombatConfig, type DeepPartial, type LootConfig, type MapConfig } from '@mobilwar/engine';
import {
  catalogHash, mergeCatalogConfig, type CatalogConfig, type DeepPartialCatalog, type MeritConfig,
} from '@mobilwar/catalog';
import type { Db } from '../db/client.ts';
import { catalogOverrides } from './catalog.ts';
import { combatOverrides, lootOverrides, mapOverrides, meritOverrides } from './combat.ts';
import { setLiveSettings } from './live.ts';

/** Ayar değişikliğinin duyurulduğu Postgres kanalı. */
export const SETTINGS_CHANNEL = 'mw_settings';

/** `world_id = 0` = "tüm dünyalar için varsayılan" (gerçek bir dünya değil). */
export const DEFAULT_WORLD = 0;

interface Snapshot {
  effective: EffectiveSettings;
  overridden: readonly string[];
  hash: string;
}

export class SettingsError extends Error {
  constructor(readonly issues: { key: string; message: string }[]) {
    super('Ayar doğrulaması başarısız.');
    this.name = 'SettingsError';
  }
}

export class SettingsService {
  /** worldId → donmuş anlık görüntü. Sıcak yolda okunan tek yapı. */
  private snapshots = new Map<number, Snapshot>();
  /** Ham satırlar: worldId → { key: value }. Yeniden hesaplama bundan yapılır. */
  private rows = new Map<number, Record<string, SettingValue>>();
  /** worldId → o dünyanın en son `settings_revisions.id`si (yoksa satır yok). */
  private revisions = new Map<number, number>();
  /** worldId → birleştirilmiş katalog config'i (sıcak yolda kopyalama olmasın diye). */
  private catalogs = new Map<number, CatalogConfig>();
  private unlisten: (() => Promise<void>) | null = null;
  private loaded = false;

  constructor(
    private readonly db: Db,
    /** `LISTEN` için ham bağlantı. Verilmezse geçersiz kılma yalnız bu süreçte çalışır. */
    private readonly raw?: postgres.Sql | null,
  ) {}

  /* ── Yükleme ──────────────────────────────────────────────────────────────── */

  async load(): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, key, value FROM settings
    `);
    const next = new Map<number, Record<string, SettingValue>>();
    for (const r of rows) {
      const worldId = Number(r['world_id']);
      (next.get(worldId) ?? next.set(worldId, {}).get(worldId)!)[String(r['key'])] =
        r['value'] as SettingValue;
    }
    this.rows = next;
    this.snapshots.clear();
    this.catalogs.clear();

    /**
     * Revizyon kimlikleri de burada yükleniyor: `battles.settings_revision_id` sıcak yolda
     * (savaş çözümünde) okunuyor ve orada ekstra bir sorgu istemiyoruz.
     */
    const revs = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, MAX(id) AS id FROM settings_revisions GROUP BY world_id
    `);
    this.revisions = new Map(revs.map((r) => [Number(r['world_id']), Number(r['id'])]));
    this.loaded = true;
    /**
     * ⭐ Modül seviyesindeki limit okuyucularını (`chatLimits()`, `notifyLimits()`,
     * `mailLimits()`) besleyen köprü. Kapsam **dünya 0**: o okuyucular `worldId` bilmeyen
     * yerlerde de çağrılıyor (`mail/templates.ts`, `mail.service.ts`). Gerekçe `live.ts`te.
     */
    setLiveSettings(this.snapshot(DEFAULT_WORLD).effective);
  }

  /**
   * Açılışta çağrılır: yükler ve kanalı dinlemeye başlar.
   *
   * ⚠️ `raw` burada da verilebiliyor çünkü **Nest'in örneği** DI fabrikasından ham bağlantısız
   * çıkıyor; `main.ts` onu `app.get(SettingsService)` ile alıp bağlantıyı burada geçiriyor.
   * Eskiden `main.ts` KENDİ örneğini kuruyordu ve Nest'inki hiç `load()` edilmiyordu: panel
   * yeni açılan bir süreçte DB'deki değerleri değil şema varsayılanlarını gösteriyor, ancak
   * ilk kayıttan sonra (o yol `load()` çağırıyor) doğruya dönüyordu.
   */
  async start(raw?: postgres.Sql | null): Promise<void> {
    const conn = raw ?? this.raw;
    await this.load();
    if (!conn) return;
    const sub = await conn.listen(SETTINGS_CHANNEL, () => {
      // ⚠️ Yükleme hatası YUTULUR: ayar tazeleyememek oyunu durdurmayı hak etmez; süreç
      // eski (geçerli) anlık görüntüyle çalışmaya devam eder.
      void this.load().catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[settings] yeniden yükleme başarısız:', err);
      });
    });
    this.unlisten = () => sub.unlisten();
  }

  async stop(): Promise<void> {
    await this.unlisten?.();
    this.unlisten = null;
  }

  /* ── Okuma (SICAK YOL — burada sorgu YOK) ────────────────────────────────── */

  /**
   * Dünyanın etkin ayarları. **Hiçbir I/O yapmaz**: ilk çağrıda katmanları birleştirip
   * donduruyor, sonrakiler hazır nesneyi döndürüyor.
   */
  snapshot(worldId: number): Snapshot {
    const hit = this.snapshots.get(worldId);
    if (hit) return hit;

    const layers = [
      this.rows.get(DEFAULT_WORLD) ?? {},
      ...(worldId === DEFAULT_WORLD ? [] : [this.rows.get(worldId) ?? {}]),
    ];
    const built = applySettings(layers, process.env);
    this.snapshots.set(worldId, built);
    return built;
  }

  /** Grup okuması: `settings.group(1, 'chat').burst`. */
  group(worldId: number, id: string): Readonly<Record<string, SettingValue>> {
    return this.snapshot(worldId).effective[id] ?? {};
  }

  hash(worldId: number): string {
    return this.snapshot(worldId).hash;
  }

  /**
   * ⭐ MOTOR OVERRIDE'I (Faz 4) — **değiştirilmiş ayar yoksa `undefined`**.
   *
   * `simulate(input, undefined)` motorun kendi `DEFAULT_COMBAT_CONFIG`ini aynen kullanır →
   * sonuç bit-bit eskisiyle aynı. Gerekçesi `combat.ts`te; ölçümü
   * `combat-settings.test.ts` → *"hiçbir ayar değişmemişken override üretilmez"*.
   */
  combat(worldId: number): DeepPartial<CombatConfig> | undefined {
    const s = this.snapshot(worldId);
    return combatOverrides(s.effective, s.overridden);
  }

  loot(worldId: number): Partial<LootConfig> | undefined {
    const s = this.snapshot(worldId);
    return lootOverrides(s.effective, s.overridden);
  }

  /** ⭐ Askerî ünvan eşikleri/süreleri. Aynı sözleşme: dokunulmamışsa `undefined`. */
  merit(worldId: number): MeritConfig | undefined {
    const s = this.snapshot(worldId);
    return meritOverrides(s.effective, s.overridden);
  }

  /**
   * ⭐ Harita/sefer sabitleri. Diğerlerinden FARKLI olarak **her zaman dolu bir config** döner
   * (`undefined` değil): `travelSeconds` varsayılanı parametre olarak alıyor ve çağıranların
   * hepsi bir `MapConfig` tutuyor; `undefined` döndürmek her çağrı noktasına bir `??` eklerdi.
   */
  map(worldId: number): MapConfig {
    const s = this.snapshot(worldId);
    return mergeMapConfig(mapOverrides(s.effective, s.overridden));
  }

  /**
   * ⭐ KATALOG OVERRIDE'I (Faz 5) — ekonomi eğrileri, süre modeli, mağara ve sur sabitleri.
   * Aynı sözleşme: değiştirilmiş ayar yoksa `undefined` → formüller varsayılanı aynen kullanır.
   */
  catalogOverride(worldId: number): DeepPartialCatalog | undefined {
    const s = this.snapshot(worldId);
    return catalogOverrides(s.effective, s.overridden);
  }

  /**
   * Formüllere geçirilecek TAM katalog config'i (birleştirilmiş).
   *
   * ⚠️ Sonuç **önbelleğe alınıyor**: `mergeCatalogConfig` her çağrıda üç nesne kopyalıyor ve
   * bu fonksiyon sıcak yolda (her fiyat/süre hesabında) çağrılıyor. Önbelleksiz hâli
   * "0 sorgu" iddiasını bozmazdı ama sıcak yola gereksiz çöp üretirdi.
   * Anlık görüntü tazelenince (`load()`) bu önbellek de temizlenir.
   */
  catalog(worldId: number): CatalogConfig {
    const hit = this.catalogs.get(worldId);
    if (hit) return hit;
    const built = mergeCatalogConfig(this.catalogOverride(worldId));
    this.catalogs.set(worldId, built);
    return built;
  }

  /** O dünyanın etkin katalog özeti — `battles.catalog_hash`e yazılır. */
  catalogHash(worldId: number): string {
    return catalogHash(this.catalog(worldId));
  }

  /**
   * Bu dünyayı etkileyen EN SON ayar revizyonu — `battles.settings_revision_id`ye yazılır.
   *
   * ⚠️ **İki katman da sayılır**: dünyanın kendi revizyonu ve genel (dünya 0) revizyonu.
   * Etkin config ikisinin birleşimi olduğu için "en son hangi kayıt bu savaşı etkiledi"
   * sorusunun cevabı ikisinin **büyüğü**. İlk yazımda yalnız `??` zinciri vardı ve dünyanın
   * ESKİ kendi revizyonu, genel katmandaki YENİ bir değişikliği gölgeliyordu; testte yakalandı.
   *
   * ⚠️ Bilinen sınır: dünya 0 revizyonunun `snapshot`u o dünyanın kendi geçersiz kılmalarını
   * İÇERMEZ. Yani işaret edilen satır "en son değişiklik"i doğru gösterir ama tek başına
   * etkin config'in tamamı değildir. Kesin cevap için savaşın `world_id`si ile iki katmana
   * da bakılır. Bunu şimdi çözmek her dünya için ayrı revizyon üretmeyi gerektirirdi;
   * pratikte dünya sayısı 1 ve bedeli buna değmiyor.
   *
   * ⚠️ `null` geçerli ve yaygın: hiç ayar kaydedilmemişse revizyon satırı yoktur ve bu
   * "motorun varsayılanlarıyla oynandı" demektir. Sahte bir sıfırıncı revizyon üretmek,
   * olmayan bir kaydı varmış gibi göstermek olurdu.
   */
  revisionId(worldId: number): number | null {
    const own = this.revisions.get(worldId);
    const shared = worldId === DEFAULT_WORLD ? undefined : this.revisions.get(DEFAULT_WORLD);
    if (own == null) return shared ?? null;
    return shared == null ? own : Math.max(own, shared);
  }

  /** Panel için: değiştirilmiş anahtarlar (varsayılandan sapanlar). */
  overridden(worldId: number): readonly string[] {
    return this.snapshot(worldId).overridden;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /* ── Yazma ────────────────────────────────────────────────────────────────── */

  /**
   * Yamayı doğrular, yazar, revizyon üretir ve **tüm süreçlere duyurur**.
   *
   * ⚠️ Doğrulama TÜMÜYLE geçmezse hiçbir şey yazılmaz. Kısmi yazım, panelde "üçünü
   * değiştirdim ikisi tuttu" gibi anlaşılması güç bir duruma yol açardı.
   */
  async update(o: {
    worldId: number;
    patch: Record<string, unknown>;
    actorId: number | null;
  }): Promise<{ hash: string; changed: string[]; revisionId: number }> {
    const { values, issues } = validatePatch(o.patch);
    if (issues.length > 0) throw new SettingsError(issues);

    const before = this.rows.get(o.worldId) ?? {};
    const changed = Object.keys(values).filter((k) => before[k] !== values[k]);

    const revisionId = await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx.execute(sql`
          INSERT INTO settings (world_id, key, value, updated_by)
          VALUES (${o.worldId}, ${key}, ${JSON.stringify(value)}::jsonb, ${o.actorId})
          ON CONFLICT (world_id, key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
        `);
      }
      /**
       * ⚠️ Anlık görüntü YAZIMDAN SONRA, ama bu transaction İÇİNDE hesaplanıyor: bellekteki
       * `rows` henüz eski. Bu yüzden yeni değerleri elle üstüne biniyoruz — `load()`u burada
       * çağırmak transaction'ın kendi yazımlarını okuyamama riskine girerdi.
       */
      const merged = { ...(this.rows.get(DEFAULT_WORLD) ?? {}) };
      if (o.worldId !== DEFAULT_WORLD) Object.assign(merged, this.rows.get(o.worldId) ?? {});
      Object.assign(merged, values);
      const built = applySettings([merged], process.env);

      const [rev] = await tx.execute<Record<string, unknown>>(sql`
        INSERT INTO settings_revisions (world_id, snapshot, hash, changed, actor_id)
        VALUES (${o.worldId}, ${JSON.stringify(built.effective)}::jsonb, ${built.hash},
                ${JSON.stringify(changed)}::jsonb, ${o.actorId})
        RETURNING id
      `);
      return Number(rev!['id']);
    });

    await this.load();
    await this.notifyOthers();
    return { hash: this.hash(o.worldId), changed, revisionId };
  }

  /** Bir ayarı varsayılana döndürür (satırı siler). */
  async reset(worldId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.execute(sql`
      DELETE FROM settings
       WHERE world_id = ${worldId}
         AND key IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))
    `);
    await this.load();
    await this.notifyOthers();
  }

  /**
   * ⚠️ `pg_notify` **transaction dışında**: içeride gönderilse bile Postgres onu commit'e
   * kadar tutar, ama bizim `load()`umuz zaten commit sonrası koşuyor. Dışarıda tutmak akışı
   * okunur kılıyor ve bildirimin bir rollback'te sızma ihtimalini sıfırlıyor.
   */
  private async notifyOthers(): Promise<void> {
    try {
      await this.db.execute(sql`SELECT pg_notify(${SETTINGS_CHANNEL}, '1')`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[settings] duyuru başarısız:', err);
    }
  }
}
