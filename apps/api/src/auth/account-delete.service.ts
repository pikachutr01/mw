/**
 * ⭐ HESAP SİLME (kullanıcı, 2026-08-01) — mağaza şartı ve oyuncunun kendi hakkı.
 *
 * Google Play, hesap silme için **oturum gerektirmeyen herkese açık bir sayfa** istiyor.
 * Akış: oyuncu Seçenekler'den (ya da doğrudan `/hesap-sil` sayfasından) ister → e-postasına
 * **12 saatlik, tek kullanımlık** bir bağlantı gider → bağlantı `/hesap-sil` sayfasını açar →
 * ne olacağı tek tek gösterilir → onaylanır.
 *
 * ⭐⭐⭐ **2026-08-13: SİLME ARTIK OYUN DÜNYASINA HİÇ DOKUNMUYOR** (kullanıcı).
 *
 * *"Oyuncu hesabını sildiği takdirde artık başkenti dışındaki şehirleri de yıkılmasın. Böyle
 * yaparak diğer oyuncuların yağma yapabileceği potansiyel şehirleri yok etmiş oluyoruz…
 * Şehirler aynen kalsın, isimleri de kullanıcı adı da değişmesin. Hatta puan sıralamalarından
 * da ittifak puanı sıralamalarından da çıkarılmasın. Diğer oyuncular bu hesabın silindiğini
 * anlayamasın."*
 *
 * Sözleşme tek cümle: **hesap silme yalnız HESABI ilgilendirir.**
 *   • **silinen** — e-posta, parola, oturumlar, e-posta jetonları, push abonelikleri,
 *     bildirim tercihleri. Oyuncu hesabına bir daha erişemez.
 *   • **dokunulmayan** — şehirler (hepsi, adlarıyla), kullanıcı adı, puan, sıralamalar,
 *     ittifak üyeliği ve rütbesi, bekleyen davet/başvurular, tatil, kahramanlar, kuyruklar,
 *     yoldaki seferler.
 *
 * ⚠️ Dışarıdan görüntüsü **uzun süredir oyuna girmeyen bir oyuncu** — ayırt edilebilir hiçbir
 * iz yok. Bu "sessizce böyle yapıyoruz" değil, ilan edilecek bir kural: kullanıcı bunu kullanım
 * ve silme koşullarına yazıp oyuncuya kayıtta beyan ettirecek.
 *
 * ⚠️⚠️ **ESKİ TASARIM NEDEN BIRAKILDI** (2026-08-01 → 2026-08-13). Eskiden başkent dışı şehirler
 * yıkılıyor, kullanıcı adı `hükümdarN` oluyor, oyuncu sıralamalardan çıkarılıyordu. İki sonucu
 * vardı ve ikisi de amacın tersine çalışıyordu:
 *
 *   1. ⭐ **Hayatta bırakılan başkent pratikte DOKUNULMAZDI.** 10 kat kuralı puanı SON SIRALAMA
 *      satırından okuyor ve sıralama satırı OLMAYAN oyuncuyu 0 (kelepçeyle 1) sayıyor
 *      (`missions/mission.service.ts` → `assertScoreRatio`). Sıralama muafiyeti satırı
 *      düşürdüğü için 10 puandan büyük hiç kimse o şehre saldıramıyordu. Yani *"yağmalanabilsin"*
 *      diye bırakılan şehir çifte kilitliydi: yanındakiler yıkılmış, kendisi de saldırıya
 *      kapanmıştı. Kullanıcının bu turdaki gerekçesi tam olarak bu.
 *   2. Ad değişikliği **sohbet geçmişini geriye dönük** anonimleştiriyordu: `sender_name` mesaj
 *      gövdesinden değil `players.username`den CANLI JOIN ediliyor (`chat/global-chat.service`).
 *      Silinen oyuncunun aylar önceki mesajları da `hükümdarN` imzalı görünüyordu.
 *
 * ⚠️ `players` satırı eskiden de KALIYORDU (savaş geçmişinde ve komşuların raporlarında delik
 * açmasın diye). Değişen şey, satırın **etrafındaki her şeyin** de kalması.
 *
 * ⚠️ `players.deleted_at` yalnız bir **iç işaret**: destek/denetim için ve girişi kapatmak için.
 * Oyun tarafında hiçbir sorgu onu okumuyor — okuyan tek yer olan kahraman sıralaması süzgeci
 * 2026-08-13'te kaldırıldı (`ranking/ranking.service.ts`), çünkü tam da "silinmişliği" ele
 * veren kanaldı.
 *
 * ⚠️ **Dünya kapsamı:** hesap ↔ dünya bugün birebir (kayıt aynı e-postayı ikinci kez kabul
 * etmiyor), yani "bir dünyadaki hesabını sil, başka dünyada devam et" kendiliğinden çalışıyor:
 * öbür dünya zaten ayrı bir hesap.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { PasswordService } from './password.service.ts';
import type { Db } from '../db/client.ts';
import { deleteAttachment } from '../support/storage.ts';
import { log } from '../common/logger.ts';

const DEL_LOG = log('account-delete');

export class AccountDeleteError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Onay ekranında gösterilen özet — "ne olacak" sorusunun cevabı. */
export interface DeletePreview {
  username: string;
  worldName: string;
  /**
   * ⚠️ Yalnız BİLGİ: hiçbiri yıkılmıyor, hiçbirinin adı değişmiyor. Listeyi göstermenin sebebi
   * onay ekranında *"bunlar dünyada aynen kalacak"* cümlesinin somut karşılığını vermek.
   */
  cities: { id: number; name: string; k: number; d: number; s: number; isCapital: boolean }[];
  /** Silme şu an mümkün mü? Boş dizi = mümkün. */
  blockers: string[];
}

export class AccountDeleteService {
  private readonly passwords = new PasswordService();

  constructor(private readonly db: Db) {}

  /* ── Önizleme ve engeller ─────────────────────────────────────────────────── */

  /**
   * ⭐ TEK ENGEL: **ittifak liderliği** (kullanıcı seçimi). Lider silinirse ittifak başsız kalır
   * ve kimse yönetemez — davet, atma, ad değiştirme ve dağıtma hepsi lider kapısının arkasında.
   * Önce devretmesi ya da dağıtması isteniyor. ⚠️ Bu engel dışarıya hiçbir şey sızdırmaz:
   * liderliği devretmek zaten sıradan bir oyuncu eylemi.
   *
   * ⚠️⚠️ **ORDU HAREKETİ ENGELLERİ 2026-08-13'te KALKTI** ve bu yalnız bir sadeleştirme değil,
   * aynı zamanda bir **kusur düzeltmesi**. Eski iki engel (*başkent dışı şehre değen hareket* ve
   * *başkentten çıkmış ordu*) yıkılacak şehirler yüzünden vardı; yıkım kalkınca dayanağı kalmadı.
   * Üstelik sorgu görev TÜRÜNE bakmıyordu: kuyruk bitişleri de `missions` satırı ve
   * `origin_city_id = target_city_id = şehir` taşıyorlar (`queues/queue.service.ts`). Sonuç:
   * başkentinde bina/asker/teknik üreten bir oyuncu **"Başkentinden çıkmış bir ordun var"**
   * diye silinemiyordu — ortada ordu yokken, üstelik başkent zaten yıkılmazken. Uzun bir
   * yükseltme 12 saatlik bağlantıyı rahatça geçebildiği için mağazanın şart koştuğu akış
   * kilitlenebiliyordu.
   */
  async preview(playerId: number): Promise<DeletePreview> {
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.username, p.alliance_id, p.alliance_role, w.name AS world_name
        FROM players p JOIN worlds w ON w.id = p.world_id
       WHERE p.id = ${playerId}
    `);
    if (!p) throw new AccountDeleteError('not_found', 'Oyuncu bulunamadı.');

    const cities = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, name, k, d, s, is_capital FROM cities WHERE player_id = ${playerId}
       ORDER BY is_capital DESC, id
    `);

    const blockers: string[] = [];
    if (p['alliance_id'] != null && Number(p['alliance_role'] ?? 0) >= 3) {
      blockers.push('İttifakının liderisin. Önce liderliği devret ya da ittifağı dağıt.');
    }

    return {
      username: String(p['username']),
      worldName: String(p['world_name']),
      cities: cities.map((c) => ({
        id: Number(c['id']), name: String(c['name']),
        k: Number(c['k']), d: Number(c['d']), s: Number(c['s']),
        isCapital: c['is_capital'] === true,
      })),
      blockers,
    };
  }

  /* ── Uygulama ─────────────────────────────────────────────────────────────── */

  /**
   * ⚠️ **Engel BURADA yeniden bakılır**, önizlemede değil. Bağlantı 12 saat geçerli ve o sürede
   * oyuncu ittifağının liderliğini almış olabilir; önizlemedeki "temiz" cevaba güvenmek, silmeyi
   * tam da yasakladığımız durumda yapmak olurdu.
   */
  async execute(o: {
    accountId: number; playerId: number; worldId: number;
    /** Oturumları düşüren geri çağrı (soketleri de kapatır). */
    revokeAll: (accountId: number) => Promise<string[]>;
  }): Promise<void> {
    const pre = await this.preview(o.playerId);
    if (pre.blockers.length > 0) {
      throw new AccountDeleteError('blocked', pre.blockers.join(' '));
    }

    await o.revokeAll(o.accountId);
    const scrambled = await this.passwords.hash(randomBytes(32).toString('base64url'));

    /**
     * ⭐ Destek eklerinin disk yolları — **transaction'dan ÖNCE** okunuyor, çünkü satırlar
     * içeride silinecek ve sonra `storage_key`i soracak yer kalmayacak.
     */
    const attachments = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.storage_key FROM support_attachments a
        JOIN support_tickets t ON t.id = a.ticket_id
       WHERE t.account_id = ${o.accountId}
    `);

    await this.db.transaction(async (tx) => {
      /**
       * ── 1) Oyuncu satırı: YALNIZ iç işaret ──────────────────────────────────
       * ⚠️ `username` **bilerek** dokunulmadan bırakılıyor (kullanıcı, 2026-08-13). Anonimleşen
       * şey artık hesap tarafı; oyun tarafındaki ad dünyada tanıdık bir işaret ve değişmesi
       * silinmeyi ele veren en gürültülü sinyaldi (sohbet geçmişi dahil).
       * ⚠️ `deleted_at` giriş kapısının da dayanağı — `auth.service.ts` → `login`.
       */
      await tx.execute(sql`
        UPDATE players SET deleted_at = now() WHERE id = ${o.playerId}
      `);

      /**
       * ── 2) Hesabı sterilize et ─────────────────────────────────────────────
       * ⚠️ `accounts.email` NOT NULL + UNIQUE → NULL yazılamaz. Yer tutucu adres, gerçek
       * adresi **serbest bırakır**: oyuncu aynı e-postayla yeniden kayıt olabilir.
       * ⚠️ Parola rastgele bir dizeden üretiliyor, boş bırakılmıyor: boş/geçersiz hash
       * `argon2.verify`i patlatır ve giriş "hata" verir; rastgele hash ise sessizce ve
       * doğru şekilde "parola yanlış" der. (Girişi kapatan asıl kapı yine de `deleted_at`.)
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

      // ── 3) Kişisel veri: oturum · push · jeton GERÇEKTEN silinir ────────────
      await tx.execute(sql`DELETE FROM sessions WHERE account_id = ${o.accountId}`);
      await tx.execute(sql`DELETE FROM email_tokens WHERE account_id = ${o.accountId}`);
      // ⚠️ Push aboneliği HESABA bağlı (`account_id`), oyuncuya değil — tarayıcı hesaba ait.
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE account_id = ${o.accountId}`);

      /**
       * ── 3b) DESTEK TALEPLERİ: metin kalır, KİŞİSEL VERİ gider (kullanıcı, 2026-08-14) ──
       *
       * ⚠️ **FK CASCADE burada HİÇ tetiklenmiyor** ve bu tuzağın kendisi: hesap silme bir
       * DELETE değil bir UPDATE (anonimleştirme). Yani `support_tickets.email` içindeki
       * GERÇEK adres, hesap "silindikten" sonra da olduğu gibi duracaktı.
       *
       * ⚠️ Talep ve mesaj gövdeleri **silinmiyor** — `chat_reports`in gerekçesiyle aynı
       * (kullanıcı: *"ileride bir anlaşmazlık durumunda hukuki olarak işine yarayabilir"*).
       * Silinen yalnız kimlik alanları. Açık talepler kapatılıyor: cevaplanacak kimse yok.
       */
      // ⚠️ Satırlar önce: yüklenen fotoğraf en tanımlayıcı kişisel veridir, kalmamalı.
      await tx.execute(sql`
        DELETE FROM support_attachments a
         USING support_tickets t
         WHERE a.ticket_id = t.id AND t.account_id = ${o.accountId}
      `);
      await tx.execute(sql`
        UPDATE support_tickets
           SET email = ${`silinmis+${o.accountId}@mobilwar.invalid`},
               display_name = 'Silinmiş hesap',
               created_ip = NULL,
               public_token_hash = NULL,
               public_token_expires_at = NULL,
               status = 'closed',
               closed_at = COALESCE(closed_at, now())
         WHERE account_id = ${o.accountId}
      `);

      /**
       * ⚠️ Denetim kaydı **tek iz**: dünyada hiçbir şey değişmediği için "bu hesap silindi mi"
       * sorusunun cevabı yalnız burada ve `players.deleted_at`te duruyor. Destek talebinde
       * dayanağımız bu satır.
       */
      await tx.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${o.worldId}, ${o.playerId}, 'account.deleted', 'player', ${o.playerId},
                ${JSON.stringify({ username: pre.username, cities: pre.cities.length })}::jsonb,
                ${`account-delete:${o.playerId}`})
      `);
    });

    /**
     * ⚠️ Dosya silme **commit'ten SONRA** ve hata toleranslı: dosya sistemi transaction'a
     * katılamaz. Ters sıra (önce dosya) bir rollback'te var olan bir satırın dosyasını yok
     * ederdi; bu sıra en kötü ihtimalle diskte artık kimsenin referans etmediği bir dosya
     * bırakır — aylık tutarsızlık raporu onu görür.
     */
    for (const a of attachments) {
      try {
        await deleteAttachment(String(a['storage_key']));
      } catch (err) {
        DEL_LOG.warn({ err, accountId: o.accountId }, 'destek eki dosyası silinemedi');
      }
    }
  }
}
