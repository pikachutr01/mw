/**
 * ⭐ HESAP SİLME (kullanıcı, 2026-08-01) — mağaza şartı ve oyuncunun kendi hakkı.
 *
 * Google Play, hesap silme için **oturum gerektirmeyen herkese açık bir sayfa** istiyor.
 * Akış: oyuncu Seçenekler'den ister → e-postasına **12 saatlik, tek kullanımlık** bir bağlantı
 * gider → bağlantı `/hesap-sil` sayfasını açar → ne olacağı tek tek gösterilir → onaylanır.
 *
 * ⚠️ **Silme değil ANONİMLEŞTİRME** (oyun tarafı) + **sterilizasyon** (hesap tarafı):
 *   • `players` satırı KALIR — başkent dünyada duran gerçek bir şehir. Yok etmek savaş
 *     geçmişinde, sıralamada ve komşuların raporlarında delik açardı.
 *   • Kullanıcı adı `hükümdarN` olur; **başkentin adı DEĞİŞMEZ** (kullanıcı, 2026-08-09).
 *   • `accounts` sterilize edilir: e-posta serbest bırakılır (aynı adresle yeniden kayıt
 *     mümkün), parola kullanılamaz hâle gelir, bildirim tercihleri sıfırlanır.
 *   • Oturumlar, push abonelikleri ve jetonlar **gerçekten silinir**.
 *
 * ⚠️⚠️ **KALAN ŞEHİR "OYNANMAYAN AMA GERÇEK" BİR ŞEHİRDİR** (kullanıcı, 2026-08-09):
 * saldırılabilir, ganimet üretir, kuyruğu biterse binası yükselir — ama **hiçbir vitrinde
 * görünmez**: oyuncu sıralaması, ittifak toplamı ve kahraman sıralaması dışında bırakılır.
 * Ayrım bilinçli; "puan üretmeye devam eden ama sahibi olmayan hesap" sıralamayı kirletirdi.
 *
 * ⚠️ İttifak üyeliği **KORUNUR** (kullanıcı, 2026-08-09 — eskiden çıkarılıyordu): asker olarak
 * ittifakta kalır, yalnız puanı takım toplamına yazılmaz. Konsey üyesi ise ASKER'e indirilir
 * (aşağıda gerekçesi), lider zaten engelde eleniyor.
 *
 * ⚠️ **Dünya kapsamı:** hesap ↔ dünya bugün birebir (kayıt aynı e-postayı ikinci kez kabul
 * etmiyor), yani "bir dünyadaki hesabını sil, başka dünyada devam et" kendiliğinden çalışıyor:
 * öbür dünya zaten ayrı bir hesap.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { deletedName } from '@mobilwar/catalog';

import { PasswordService } from './password.service.ts';
import { dropInviteMessages, ROLE } from '../alliance/alliance.service.ts';
import { endVacation } from '../vacation/vacation.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import type { Db } from '../db/client.ts';

export class AccountDeleteError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Onay ekranında gösterilen özet — "ne silinecek" sorusunun cevabı. */
export interface DeletePreview {
  username: string;
  worldName: string;
  /** Başkent KALIR — **adıyla birlikte** (kullanıcı, 2026-08-09). */
  capital: { id: number; name: string; k: number; d: number; s: number } | null;
  /** Yıkılacak şehirler — içlerinde ordu olsa bile (kullanıcı kuralı). */
  razed: { id: number; name: string; k: number; d: number; s: number }[];
  /** Silme şu an mümkün mü? Boş dizi = mümkün. */
  blockers: string[];
}

export class AccountDeleteService {
  private readonly passwords = new PasswordService();
  /**
   * ⚠️ Tatil bitirme kaynak ÇIPASI yazıyor (`cities.resources_at`) — o çıpa **oyun saatinde**
   * olmak zorunda. Gerçek saatle yazılsaydı bakımda (oyun saati donmuşken) silen bir oyuncunun
   * şehri, donma süresi kadar bedava kaynakla uyanırdı.
   */
  private readonly clock: GameClockService;

  constructor(private readonly db: Db) {
    this.clock = new GameClockService(db);
  }

  /* ── Önizleme ve engeller ─────────────────────────────────────────────────── */

  /**
   * ⭐ ENGELLER — kullanıcının kuralı + onun onayladığı iki ek.
   *
   * | engel | kaynak |
   * | :-- | :-- |
   * | başkent DIŞI bir şehre gelen/giden hareket | kullanıcının kendi kuralı |
   * | başkentten ÇIKMIŞ hareket | kullanıcı seçimi |
   * | ittifak LİDERİ | kullanıcı seçimi |
   *
   * ⚠️ Başkente **gelen** saldırı engel DEĞİL (kullanıcının açık kuralı): başkent zaten
   * kalıyor, saldırı normal şekilde çözülür.
   *
   * ⚠️ Başkentten çıkmış hareket neden engel: yoksa silinmiş bir hesabın ordusu saatler sonra
   * birine saldırır ve dönüşte anonim şehre girer. Oyuncu "hesabımı sildim" derken devam eden
   * bir savaş bırakmamalı.
   *
   * ⚠️ Lider neden engel: lider silinirse ittifak başsız kalır ve kimse yönetemez. Önce
   * devretmesi ya da dağıtması isteniyor.
   *
   * ⚠️ **Asker/konsey artık ittifaktan ÇIKARILMIYOR** (kullanıcı, 2026-08-09): üyelik
   * duruyor, yalnız puan takım toplamına yazılmıyor ve konsey Asker'e iniyor. Bu satır
   * 2026-08-09'a kadar «sessizce çıkarılır» diyordu — `execute()` adım 2'ye bak.
   */
  async preview(playerId: number): Promise<DeletePreview> {
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.username, p.alliance_id, p.alliance_role, w.name AS world_name
        FROM players p JOIN worlds w ON w.id = p.world_id
       WHERE p.id = ${playerId}
    `);
    if (!p) throw new AccountDeleteError('not_found', 'Oyuncu bulunamadı.');

    const cities = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, name, k, d, s, is_capital FROM cities WHERE player_id = ${playerId} ORDER BY id
    `);
    const capitalRow = cities.find((c) => c['is_capital'] === true);
    const capitalId = capitalRow ? Number(capitalRow['id']) : null;

    const blockers: string[] = [];

    /**
     * ⚠️ Tek sorguda iki sayı: başkent DIŞI şehirlere değen hareketler ve başkentten ÇIKANLAR.
     * `origin_city_id` VE `target_city_id` birlikte bakılıyor — gelen bir saldırı da o şehre
     * "değen" bir harekettir ve şehir yıkılacaksa saldırı boşlukta kalırdı.
     */
    const [m] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE m.origin_city_id IN (SELECT id FROM cities
                                      WHERE player_id = ${playerId} AND NOT is_capital)
             OR m.target_city_id IN (SELECT id FROM cities
                                      WHERE player_id = ${playerId} AND NOT is_capital)
        )::int AS other_city,
        COUNT(*) FILTER (
          WHERE ${capitalId == null ? sql`FALSE` : sql`m.origin_city_id = ${capitalId}`}
        )::int AS from_capital
      FROM missions m
     WHERE m.status IN ('scheduled', 'running')
    `);
    if (Number(m?.['other_city'] ?? 0) > 0) {
      blockers.push('Başkentin dışındaki şehirlerinde ordu hareketi var (giden ya da gelen). '
        + 'O şehirler yıkılacağı için hareket bitene kadar bekle.');
    }
    if (Number(m?.['from_capital'] ?? 0) > 0) {
      blockers.push('Başkentinden çıkmış bir ordun var. Dönmesini (ya da görevini '
        + 'tamamlamasını) bekle — hesabın silindikten sonra savaşan bir ordu kalmamalı.');
    }
    if (p['alliance_id'] != null && Number(p['alliance_role'] ?? 0) >= 3) {
      blockers.push('İttifakının liderisin. Önce liderliği devret ya da ittifağı dağıt.');
    }

    const toRow = (c: Record<string, unknown>): DeletePreview['razed'][number] => ({
      id: Number(c['id']), name: String(c['name']),
      k: Number(c['k']), d: Number(c['d']), s: Number(c['s']),
    });

    return {
      username: String(p['username']),
      worldName: String(p['world_name']),
      capital: capitalRow ? toRow(capitalRow) : null,
      razed: cities.filter((c) => c['is_capital'] !== true).map(toRow),
      blockers,
    };
  }

  /* ── Uygulama ─────────────────────────────────────────────────────────────── */

  /**
   * ⚠️ **Engeller BURADA yeniden bakılır**, önizlemede değil. Bağlantı 12 saat geçerli ve o
   * sürede oyuncu ordu yollamış olabilir; önizlemedeki "temiz" cevaba güvenmek, silmeyi
   * tam da yasakladığımız durumda yapmak olurdu.
   *
   * @returns anonim ad ve yıkılan şehir sayısı
   */
  async execute(o: {
    accountId: number; playerId: number; worldId: number;
    /** Oturumları düşüren geri çağrı (soketleri de kapatır). */
    revokeAll: (accountId: number) => Promise<string[]>;
  }): Promise<{ username: string; razed: number }> {
    const pre = await this.preview(o.playerId);
    if (pre.blockers.length > 0) {
      throw new AccountDeleteError('blocked', pre.blockers.join(' '));
    }

    await o.revokeAll(o.accountId);
    const scrambled = await this.passwords.hash(randomBytes(32).toString('base64url'));
    const at = await this.clock.gameNow(o.worldId);

    return this.db.transaction(async (tx) => {
      // ── 1) Anonim ad: sayaç dünya satırında kilitlenerek artar ──────────────
      const [w] = await tx.execute<Record<string, unknown>>(sql`
        SELECT deleted_player_seq FROM worlds WHERE id = ${o.worldId} FOR UPDATE
      `);
      const seq = Number(w?.['deleted_player_seq'] ?? 0) + 1;
      await tx.execute(sql`
        UPDATE worlds SET deleted_player_seq = ${seq} WHERE id = ${o.worldId}
      `);
      const anon = deletedName(seq);

      /**
       * ── 2) ⭐ İTTİFAKTA KALIR, PUANI TAKIMA YAZILMAZ (kullanıcı, 2026-08-09) ─
       *
       * *"Asker olarak hesabını sildiğinde ittifakta kalmaya devam edebilir ama puanı
       * ittifağın toplam puanına eklenmesin."*
       *
       * ⚠️ Eskiden burada `alliance_id = NULL` vardı — üyelik sessizce kopuyordu. Şimdi
       * yalnız `alliance_score_excluded` işaretleniyor; süzgeç `ranking.service.ts`teki
       * ittifak toplamında zaten var (§0036), yeni kural yazmaya gerek yok.
       *
       * ⚠️ **Konsey üyesi ASKER'e indiriliyor.** Kullanıcının cümlesi hayatta kalan üyeyi
       * "asker" diye tarif ediyor ve gerekçesi de var: konsey daveti kabul edebilir, başvuru
       * sonuçlandırabilir ve asker atabilir. Sahibi olmayan bir satırda bu yetkilerin durması
       * bugün zararsız (hesap giriş yapamıyor) ama yetkiyi hayaletin üstünde bırakmak, ileride
       * ittifak adına otomatik iş yapan her özellik için açık bir kapı olurdu. Lider bu dala
       * hiç gelmiyor: `preview()` engeli onu daha önce eliyor.
       */
      await tx.execute(sql`
        UPDATE players
           SET alliance_score_excluded = true,
               alliance_role = CASE WHEN alliance_id IS NULL THEN alliance_role
                                    ELSE ${ROLE.MEMBER} END
         WHERE id = ${o.playerId}
      `);

      /**
       * ── 2b) ⭐ BEKLEYEN DAVET/BAŞVURULARI İPTAL ET ──────────────────────────
       *
       * ⚠️ Bu, kullanıcının saymadığı ama akışın açık bıraktığı bir delikti: ittifaksız bir
       * oyuncu hesabını silmeden önce üç ittifağa başvurmuş olabilir. Satırlar `pending`
       * kalırsa bir lider «Kabul»e bastığında **silinmiş bir hesap ittifağa girer** — üstelik
       * kimse onun silinmiş olduğunu görmez. Aynısı ona GELEN davetler için de geçerli.
       *
       * ⚠️ Mesaj temizliği `dropInviteMessages` ile, yani ittifak akışındaki gövdenin AYNISI:
       * ikinci bir silme SQL'i yazmak, iki kuralın zamanla ayrışması demekti.
       */
      const stale = await tx.execute<Record<string, unknown>>(sql`
        UPDATE alliance_invites SET status = 'canceled', decided_at = now()
         WHERE player_id = ${o.playerId} AND status = 'pending' RETURNING id
      `);
      await dropInviteMessages(tx as never, o.worldId, stale.map((r) => Number(r['id'])));

      /**
       * ── 2c) ⭐ SIRALAMALARDAN ÇIKAR (kullanıcı, 2026-08-09) ─────────────────
       *
       * *"Hesabını silen bir oyuncunun geri kalan şehri sıralamalara girmeye devam ediyor…
       * sıralamalarda gözükmesini istemiyorum."*
       *
       * ⚠️ Puan SIFIRLANMIYOR (`purge-player`ın aksine): şehir gerçek, saldırılabilir ve
       * ganimet üretiyor — puanı da gerçek. İstenen "puanı sil" değil, "vitrine koyma".
       * `recomputeScore` de puanı holdinglerden yeniden kurduğu için sıfırlamak kalıcı olmazdı.
       *
       * ⚠️ Var olan sıralama satırı ayrıca silinmiyor: `takeSnapshot` her turda
       * `ranking_excluded` olanları tablodan DÜŞÜRÜYOR (§0036'da bilerek böyle yazılmış).
       * Yani en geç bir sonraki anlık görüntüde listeden kayboluyor.
       */
      await tx.execute(sql`
        UPDATE players SET ranking_excluded = true WHERE id = ${o.playerId}
      `);

      /**
       * ── 2d) ⭐ TATİL MODUNU BİTİR ───────────────────────────────────────────
       *
       * ⚠️ Bu da sayılmamış bir kontroldü ve sessiz sonucu ağır: tatildeki oyuncu
       * **saldırılamaz** (`mission.service` → `target_vacation`) ve kaynağı akmaz. Tatildeyken
       * hesabını silen biri, arkasında 30 güne kadar dokunulamaz ve donmuş bir hayalet şehir
       * bırakıyordu — üstelik tatili bitirebilecek tek kişi artık giriş yapamıyor.
       * Kullanıcının şartı ("normal bir hesap gibi davranmaya devam eder, ganimet üretir")
       * tam da bunun tersi.
       *
       * ⚠️ `vacation_until`i elle NULL yapmak YETMEZ: kaynak çıpası (`cities.resources_at`)
       * tatile girişte kalır ve şehir ilk okumada tüm tatil süresini kaynak olarak alır.
       * `endVacation()` çıpayı da ileri çekiyor — aynı tuzak `admin.actions`ta yazılı.
       */
      await endVacation(tx as never, o.playerId, at);

      /**
       * ── 3) ⚠️ KAHRAMANLARI ÖNCE BAŞKENTE TAŞI ──────────────────────────────
       * `heroes.city_id` şehre `ON DELETE SET NULL` bağlı: yıkılan şehirdeki kahraman
       * şehirsiz kalır ve hiçbir tapınakta görünmez. Sıra load-bearing — şehirler silindikten
       * sonra taşımak imkânsız, çünkü nereden geldikleri bilgisi gitmiş olur.
       */
      const capitalId = pre.capital?.id ?? null;
      if (capitalId != null) {
        await tx.execute(sql`
          UPDATE heroes SET city_id = ${capitalId}
           WHERE player_id = ${o.playerId} AND city_id IS DISTINCT FROM ${capitalId}
        `);
      }

      // ── 4) Başkent dışı şehirleri yık (içlerinde ordu olsa bile) ────────────
      const razedIds = pre.razed.map((c) => c.id);
      if (razedIds.length > 0) {
        await tx.execute(sql`
          DELETE FROM cities WHERE player_id = ${o.playerId} AND NOT is_capital
        `);
      }

      /**
       * ── 5) ⭐ ANONİMLEŞTİRME YALNIZ OYUNCU ADINDA (kullanıcı, 2026-08-09) ────
       *
       * *"Başkentin yeniden adlandırılması… hükümdar1, hükümdar2 şeklinde artarak devam
       * ediyor. Bu sistemden tamamen vazgeçtim, başkentin o andaki mevcut adı neyse öyle
       * kalsın, silme bildirisinde bu durum oyuncuya da söylenir."*
       *
       * ⚠️ **Kullanıcı ADI anonimleşmeye DEVAM ediyor** — kullanıcının cümlesi baştan sona
       * başkentin adını konu alıyor ve oyuncu adı kişisel veri: onu da bıraksaydık "silme"
       * artık hiçbir şeyi anonimleştirmezdi (mağaza şartının ve sayfadaki sözün karşılığı
       * kalmazdı). Şehir adı ise bir YER adı ve dünyada tanıdık bir işaret; kullanıcı onun
       * kalmasını istedi.
       *
       * ⚠️ Sayaç (`worlds.deleted_player_seq`) bu yüzden DURUYOR: oyuncu adı hâlâ ondan
       * üretiliyor. Yalnız şehir tarafındaki kullanımı kalktı.
       */
      await tx.execute(sql`
        UPDATE players SET username = ${anon}, deleted_at = now() WHERE id = ${o.playerId}
      `);

      /**
       * ── 6) Hesabı sterilize et ─────────────────────────────────────────────
       * ⚠️ `accounts.email` NOT NULL + UNIQUE → NULL yazılamaz. Yer tutucu adres, gerçek
       * adresi **serbest bırakır**: oyuncu aynı e-postayla yeniden kayıt olabilir.
       * ⚠️ Parola rastgele bir dizeden üretiliyor, boş bırakılmıyor: boş/geçersiz hash
       * `argon2.verify`i patlatır ve giriş "hata" verir; rastgele hash ise sessizce ve
       * doğru şekilde "parola yanlış" der.
       */
      await tx.execute(sql`
        UPDATE accounts
           SET email = ${`silinmis+${o.accountId}@mobilwar.invalid`},
               email_verified_at = NULL,
               password_hash = ${scrambled},
               notify_prefs = '{}'::jsonb,
               role = 'player',
               locked_until = NULL,
               failed_logins = 0
         WHERE id = ${o.accountId}
      `);

      // ── 7) Kişisel veri: oturum · push · jeton GERÇEKTEN silinir ────────────
      await tx.execute(sql`DELETE FROM sessions WHERE account_id = ${o.accountId}`);
      await tx.execute(sql`DELETE FROM email_tokens WHERE account_id = ${o.accountId}`);
      // ⚠️ Push aboneliği HESABA bağlı (`account_id`), oyuncuya değil — tarayıcı hesaba ait.
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE account_id = ${o.accountId}`);

      await tx.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${o.worldId}, ${o.playerId}, 'account.deleted', 'player', ${o.playerId},
                ${JSON.stringify({ anon, razed: razedIds, seq })}::jsonb,
                ${`account-delete:${o.playerId}`})
      `);

      return { username: anon, razed: razedIds.length };
    });
  }
}
