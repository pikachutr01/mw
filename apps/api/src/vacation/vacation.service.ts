/**
 * ⭐ TATİL MODU (kullanıcı, 2026-08-02) — oyunun kalan en büyük eksik özelliği.
 *
 * Doküman (`teknik_ve_yapi_dokumantasyonu.md:646`, `:941`): en az 48 saat kalınır; içindeyken
 * saldırılamaz **ama üretim, ilerletme ve tüm kaynak üretimi de durur**; girmek için hiçbir
 * şehirde üretim/ilerletme ve gelen-giden ordu olmamalıdır.
 *
 * ⚠️ **TEK GERÇEK ZORLUK KAYNAK DONDURMA.** Oyun tembel birikimle çalışıyor: kaynak
 * `cities.resources_at` çıpasından itibaren geçen süreyle hesaplanıyor (§13.11.1, "Tick YOK").
 * Dolayısıyla "üretimi durdur" demek çıpayı DONDURMAK demek — ve dondurulmuş çıpa, tatil
 * bittiğinde ileri çekilmezse **birikmiş tüm süre tek okumada kaynağa dönüşür.** 30 günlük
 * tatilden dönen oyuncu bir anda 30 günlük altın bulurdu.
 *
 * Bu yüzden çıkışın **TEK YOLU** `endVacation()`: bayrağı temizlemekle çıpayı ileri çekmeyi
 * aynı ifadede yapıyor. Elle çıkış, 30 günlük otomatik çıkış ve yönetici çıkışı üçü de
 * buradan geçiyor → "dondurma kapalı ama çıpa eski" durumu **temsil edilemez**.
 *
 * ⚠️ Süreler **oyun saatiyle** ölçülür (cezanın aksine): tatil bir oyun mekaniği, moderasyon
 * kararı değil. Bakımda oyun saati donuyor ve tatil de onunla birlikte donmalı.
 */
import { sql } from 'drizzle-orm';
import { liveBool, liveNumber } from '../settings/live.ts';
import { toDate, type Db } from '../db/client.ts';
import { CityService } from '../cities/city.service.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

export type VacationErrorCode =
  | 'player_not_found'
  | 'already_on_vacation'
  | 'not_on_vacation'
  | 'vacation_blocked'
  | 'vacation_too_early'
  | 'vacation_premium_only';

export class VacationError extends Error {
  constructor(
    readonly code: VacationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'VacationError';
  }
}

export interface VacationStatus {
  onVacation: boolean;
  /** Giriş anı (tatildeyken dolu). */
  since: string | null;
  /** Planlanmış otomatik çıkış (tatildeyken dolu). */
  until: string | null;
  /** 48 saat dolmadan çıkılamaz; tatildeyken dolu. */
  canLeaveAt: string | null;
  /** Son çıkış anı — bekleme buradan sayılır. */
  endedAt: string | null;
  /**
   * ⭐ Girişi engelleyen sebeplerin **TAM LİSTESİ** (tatildeyken boş).
   *
   * Dizi, tek `boolean` değil — `abandonBlockers` ile aynı gerekçe: tek engel dönseydi oyuncu
   * barakayı boşaltır, tekrar dener, bu sefer kuyruğu görür, sonra hareketi görür; her adım
   * yeni bir sürpriz olurdu.
   */
  blockers: string[];
  /** Panelde/ekranda gösterilecek etkin kurallar. */
  rules: { minHours: number; maxDays: number; cooldownDays: number };
}

export function vacationRules(): { minHours: number; maxDays: number; cooldownDays: number; premiumOnly: boolean } {
  return {
    minHours: liveNumber('vacation', 'minHours', 48),
    maxDays: liveNumber('vacation', 'maxDays', 30),
    cooldownDays: liveNumber('vacation', 'cooldownDays', 3),
    premiumOnly: liveBool('vacation', 'premiumOnly', false),
  };
}

/**
 * ⭐ TATİLDEN ÇIKIŞ — bayrağı temizler **ve aynı ifadede kaynak çıpasını o ana çeker.**
 * Çıkışın tek yolu budur; gerekçe dosya başlığında.
 *
 * ⚠️ Sıra: **önce çıpa, sonra bayrak.** Tek transaction içinde ikisi de atomik ama sıra niyeti
 * yazıyor: çıpa ileri çekilmeden bayrak düşerse (bir gün biri araya bir `RETURN` koyarsa)
 * ortaya çıkan durum tam olarak kaçındığımız hata olurdu.
 *
 * Elle çıkılmışsa sessiz no-op → 30 günlük otomatik çıkış görevi güvenle tekrar çalışabilir.
 */
export async function endVacation(tx: Runner, playerId: number, at: Date): Promise<boolean> {
  const stamp = at.toISOString();
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM players WHERE id = ${playerId} AND vacation_until IS NOT NULL
  `);
  if (rows.length === 0) return false;

  /* ⚠️ `resources_at < at` koşulu çıpayı GERİ almayı imkânsız kılıyor. Oyun saati yönetici
     tarafından geri alınmış bir dünyada koşulsuz yazmak kaynağı ikinci kez ürettirirdi. */
  await tx.execute(sql`
    UPDATE cities SET resources_at = ${stamp}::timestamptz
     WHERE player_id = ${playerId} AND resources_at < ${stamp}::timestamptz
  `);
  // ⚠️ `vacation_mission_id` de temizleniyor: bayrak üçlüsü birlikte yaşayıp birlikte ölmeli,
  // yoksa bir sonraki girişte eski görev kimliği hâlâ eşleşir görünürdü.
  await tx.execute(sql`
    UPDATE players
       SET vacation_until = NULL, vacation_since = NULL, vacation_mission_id = NULL,
           vacation_ended_at = ${stamp}::timestamptz
     WHERE id = ${playerId} AND vacation_until IS NOT NULL
  `);
  return true;
}

export class VacationService {
  constructor(
    private readonly db: Db,
    /**
     * ⚠️ **Uygulamanın CityService ÖRNEĞİ geçilmeli**, burada `new CityService(db)` kurulmamalı:
     * o hâlde katalog fonksiyonu olmaz ve üretim hızları panelden değiştirilmiş dünyada
     * VARSAYILANA düşerdi. Tatile girerken kaynak sessizce yanlış hesaplanırdı.
     */
    private readonly cities: CityService,
  ) {}

  /**
   * ⭐ GİRİŞ ENGELLERİ — oyuncunun TÜM şehirlerini kapsar (terk engellerinin aksine: o tek
   * şehre bakıyordu).
   *
   * ⚠️ Hareket sorgusunda **üç terim birden** var. `owner_player_id` tek başına yetmez (gelen
   * saldırı başkasınındır), `target_city_id` tek başına yetmez (giden ordu henüz varmamıştır),
   * `origin_city_id` tek başına yetmez (dönüş bacağının kalkış şehri rakibin şehridir).
   * Gelen saldırının engel olması ŞART: olmasaydı tatil, üstüne ordu gelen şehri kurtarmanın
   * yolu olurdu.
   */
  async blockers(runner: Runner, playerId: number, at: Date): Promise<string[]> {
    const rules = vacationRules();
    const [r] = await runner.execute<Record<string, unknown>>(sql`
      SELECT
        p.is_premium,
        p.vacation_ended_at,
        (p.banned_at IS NOT NULL)                                                  AS banned,
        (SELECT COUNT(*)::int FROM queues q JOIN cities c ON c.id = q.city_id
          WHERE c.player_id = p.id
            AND q.completed_at IS NULL AND q.canceled_at IS NULL)                  AS queues,
        (SELECT COUNT(*)::int FROM missions m
          WHERE m.status IN ('scheduled', 'running')
            AND (m.owner_player_id = p.id
                 OR m.origin_city_id IN (SELECT id FROM cities WHERE player_id = p.id)
                 OR m.target_city_id IN (SELECT id FROM cities WHERE player_id = p.id))) AS movements
      FROM players p WHERE p.id = ${playerId}
    `);
    if (!r) return ['Oyuncu bulunamadı.'];

    const out: string[] = [];
    if (rules.premiumOnly && r['is_premium'] !== true) {
      out.push('Tatil modu yalnız premium hesaplara açık.');
    }
    if (r['banned'] === true) out.push('Cezalı hesap tatil moduna giremez.');
    if (Number(r['queues'] ?? 0) > 0) out.push('Şehirlerinde süren üretim ya da ilerletme var.');
    if (Number(r['movements'] ?? 0) > 0) {
      out.push('Yolda olan ordu var (giden, dönen ya da sana gelen).');
    }

    /* ⚠️ Bekleme ÇIKIŞTAN sayılıyor, girişten değil. Girişten sayılsaydı 48 saat kalıp çıkan
       oyuncu beklemeyi tatilin İÇİNDE doldurur ve hemen yeniden girerdi. */
    const endedAt = r['vacation_ended_at'] == null ? null : toDate(r['vacation_ended_at']);
    if (endedAt != null && rules.cooldownDays > 0) {
      const ready = new Date(endedAt.getTime() + rules.cooldownDays * 86_400_000);
      if (ready > at) {
        out.push(`Tatilden çıktıktan sonra ${rules.cooldownDays} gün beklemelisin `
          + `(${ready.toISOString()} sonrası).`);
      }
    }
    return out;
  }

  async status(playerId: number, at: Date, runner: Runner = this.db): Promise<VacationStatus> {
    const rules = vacationRules();
    const [p] = await runner.execute<Record<string, unknown>>(sql`
      SELECT vacation_until, vacation_since, vacation_ended_at FROM players WHERE id = ${playerId}
    `);
    if (!p) throw new VacationError('player_not_found', 'Oyuncu bulunamadı.');

    const until = p['vacation_until'] == null ? null : toDate(p['vacation_until']);
    const since = p['vacation_since'] == null ? null : toDate(p['vacation_since']);
    const endedAt = p['vacation_ended_at'] == null ? null : toDate(p['vacation_ended_at']);
    const on = until != null;

    return {
      onVacation: on,
      since: since?.toISOString() ?? null,
      until: until?.toISOString() ?? null,
      canLeaveAt: since == null ? null
        : new Date(since.getTime() + rules.minHours * 3600_000).toISOString(),
      endedAt: endedAt?.toISOString() ?? null,
      // Tatildeyken engel listesi anlamsız: sorulan soru "girebilir miyim" değil artık.
      blockers: on ? [] : await this.blockers(runner, playerId, at),
      rules: { minHours: rules.minHours, maxDays: rules.maxDays, cooldownDays: rules.cooldownDays },
    };
  }

  /**
   * ⭐ TATİLE GİR.
   *
   * ⚠️ **SIRA PAZARLIKSIZ: önce `materialize`, sonra bayrak.** Ters sırada aynı transaction
   * içinde `materialize` no-op'a döner (dondurma zaten açıktır) ve son okumadan giriş anına
   * kadar biriken kaynak **yanar**. Oyuncu tatile girerken kaynak kaybeder ve sebebini asla
   * anlayamaz.
   *
   * ⚠️ Engeller kilit ALTINDA **yeniden** bakılıyor: ön kontrolle bu POST arasında saniyeler
   * geçiyor ve o aralıkta oyuncuya saldırı yola çıkabilir. Bir kez bakıp geçseydik tatil,
   * gelen saldırıdan kaçmanın yolu olurdu.
   */
  async enter(playerId: number, at: Date): Promise<VacationStatus> {
    const rules = vacationRules();
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;
      const [p] = await t.execute<Record<string, unknown>>(sql`
        SELECT world_id, vacation_until FROM players WHERE id = ${playerId} FOR UPDATE
      `);
      if (!p) throw new VacationError('player_not_found', 'Oyuncu bulunamadı.');
      if (p['vacation_until'] != null) {
        throw new VacationError('already_on_vacation', 'Zaten tatil modundasın.');
      }

      const blockers = await this.blockers(t, playerId, at);
      if (blockers.length > 0) {
        throw new VacationError('vacation_blocked', blockers[0]!, { blockers });
      }

      /* 1) Şehirleri giriş anına getir — biriken kaynak SON KEZ yazılır. */
      await this.materializeAllCities(t, playerId, at);

      /* 2) Bayrağı kur. Bu andan sonra `materialize` no-op, çıpa donuyor. */
      const until = new Date(at.getTime() + rules.maxDays * 86_400_000);
      await t.execute(sql`
        UPDATE players
           SET vacation_since = ${at.toISOString()}::timestamptz,
               vacation_until = ${until.toISOString()}::timestamptz
         WHERE id = ${playerId}
      `);

      /**
       * 3) Otomatik çıkış görevi. `ON CONFLICT … DO NOTHING` → aynı giriş iki kez yazılamaz.
       *
       * ⚠️ **Yük `since`i TAŞIMAK ZORUNDA.** Aksi hâlde şu senaryo tatili erken bitirirdi:
       * oyuncu 1. günde girer (görev A → 30. gün), 3. günde ELLE çıkar, 7. günde yeniden
       * girer (görev B → 37. gün). Görev A hâlâ zamanlanmış durumda ve 30. günde ateşlenip
       * oyuncuyu **yedi gün erken** çıkarırdı. Handler `since`i karşılaştırarak yalnız kendi
       * tatilini bitiriyor; eski görev sessiz no-op'a düşüyor.
       *
       * ⚠️ Eski görevi İPTAL etmek de bir seçenekti; tercih edilmedi çünkü iptali bir yerde
       * unutmak aynı hatayı sessizce geri getirir. Yük karşılaştırması unutulamaz: görev
       * kendi kimliğini taşıyor.
       */
      const inserted = await t.execute<Record<string, unknown>>(sql`
        INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
        VALUES (${Number(p['world_id'])}, 'vacation_end', 'scheduled',
                ${until.toISOString()}::timestamptz,
                ${JSON.stringify({ playerId, since: at.toISOString() })}::jsonb,
                ${`vacation_end:${playerId}:${at.toISOString()}`})
        ON CONFLICT (world_id, idempotency_key) DO NOTHING
        RETURNING id
      `);

      /**
       * ⭐⭐ KİMLİK ZAMANDAN AYRILDI (2026-08-07) — `vacation_mission_id`.
       *
       * Handler eskiden `payload.since` ile `players.vacation_since`i **ISO dize eşitliğiyle**
       * karşılaştırıyordu. Tek zaman çizgisinde `vacation_since` bakımda kaydırılıyor ama
       * JSONB'nin içindeki `since` kaydırılmıyor → karşılaştırma tutmaz, handler **sessizce
       * `return` eder** ve oyuncunun otomatik tatil çıkışı **hiç olmaz**. Geri bildirimsiz,
       * aylar sonra fark edilecek bir arıza.
       *
       * Görev kimliği zamandan bağımsız: kaydırma onu etkilemiyor, ayrıca ISO biçim eşitliği
       * kırılganlığı da ölüyor. `payload.since` eski satırlarla uyum için duruyor.
       */
      if (inserted[0]?.['id'] != null) {
        await t.execute(sql`
          UPDATE players SET vacation_mission_id = ${Number(inserted[0]['id'])}
           WHERE id = ${playerId}
        `);
      }

      return this.status(playerId, at, t);
    });
  }

  /** ⭐ TATİLDEN ÇIK (elle). 48 saat dolmadıysa reddeder. */
  async leave(playerId: number, at: Date): Promise<VacationStatus> {
    const rules = vacationRules();
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;
      const [p] = await t.execute<Record<string, unknown>>(sql`
        SELECT vacation_since FROM players WHERE id = ${playerId} FOR UPDATE
      `);
      if (!p) throw new VacationError('player_not_found', 'Oyuncu bulunamadı.');
      if (p['vacation_since'] == null) {
        throw new VacationError('not_on_vacation', 'Tatil modunda değilsin.');
      }

      const canLeaveAt = new Date(toDate(p['vacation_since']).getTime() + rules.minHours * 3600_000);
      if (canLeaveAt > at) {
        throw new VacationError(
          'vacation_too_early',
          `Tatil modundan en erken ${rules.minHours} saat sonra çıkabilirsin.`,
          { canLeaveAt: canLeaveAt.toISOString() },
        );
      }

      await endVacation(t, playerId, at);
      return this.status(playerId, at, t);
    });
  }

  /**
   * Oyuncunun tüm şehirlerini `at` anına getirir.
   *
   * ⚠️ Kaynak formülünü BURADA yeniden yazmak yasak: `CityService.materialize` çağrılıyor.
   * İkinci bir kopya, üretim hızları panelden değiştiğinde (§admin Faz 5) sessizce ayrışır ve
   * tatile girmek kaynağı görünmez biçimde değiştirirdi. Şehir başına birkaç fazla sorgu bu
   * riskin yanında ucuz — üstelik girişte kuyruk OLAMAZ (engel), yani kuyruk materyalizasyonu
   * zaten no-op.
   */
  private async materializeAllCities(t: Tx, playerId: number, at: Date): Promise<void> {
    const rows = await t.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${playerId} ORDER BY id
    `);
    for (const r of rows) await this.cities.materialize(Number(r['id']), at, t);
  }
}
