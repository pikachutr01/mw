/**
 * ⭐ BİLDİRİM SERVİSİ (§7.2) — kullanıcının çekirdek şartının tek uygulandığı yer:
 *
 *   > *"Push sisteminin en önemli özelliği ws bağlı iken bildirim gelmemesi gerekir."*
 *
 * `deliver()` içinde **tek bir if** var ve iki dal karşılıklı dışlayıcı: oyuncu çevrimiçiyse
 * olay WS'ten gider (istemci sağ altta toast çizer), değilse push servisine gider. İkinci bir
 * kod yolu OLMADIĞI için "hem toast hem push geldi" durumu yapısal olarak imkânsız.
 *
 * ⚠️ **Çok cihaz:** oyuncunun HERHANGİ bir soketi açıksa push gitmez. Alternatif (cihaz başına
 * karar) mümkün değil: abonelik tarayıcıya, soket ise oturuma ait ve ikisini eşleştirecek
 * güvenilir bir bağ yok. Kullanıcının kuralı da zaten ikili ("ws bağlı iken").
 *
 * ⚠️ **`ROLE` KISITI:** çevrimiçilik bilgisi `RealtimeGateway`'in bellek-içi sayacında
 * (`gateway-registry.ts`). O kayıt yalnız `ROLE=api|all` süreçlerinde dolu. Bu servis worker'da
 * koştuğu için `ROLE=worker` ayrımında `isOnline` HİÇBİR ZAMAN true dönmez → WS açıkken de push
 * gider. Dağıtım profilimiz `ROLE=all` (VPS_DURUM_RAPORU §7.4); ayrılırsa açılışta uyarı basılır.
 */
import { sql } from 'drizzle-orm';
import webpush from 'web-push';

import type { Db } from '../db/client.ts';
import type { RealtimeBus } from '../realtime/realtime.bus.ts';
import type { Notification } from './notify.catalog.ts';
import {
  NOTIFY_DEFAULTS, notifyLimits, VAPID, pushEnabled, type NotifyCategory,
} from './notify.limits.ts';
import { log } from '../common/logger.ts';
const NOTIFY_LOG = log('notify');

/** Tarayıcının `PushSubscription.toJSON()` çıktısının bize gereken kısmı. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Push gönderimini soyutlar. **Testlerde `vi.mock` yerine bellek-içi bir implementasyon**
 * geçirilir (`outbox.test.ts`'teki sink emsali): gerçek ağ çağrısı olmadan "hangi aboneliğe ne
 * gitti" doğrulanabilir ve 410 gibi hata yolları taklit edilebilir.
 */
export interface PushSender {
  send(sub: PushSubscriptionInput, payload: string): Promise<void>;
}

/** Push servisi "bu abonelik artık yok" dediğinde fırlatılır → satır anında silinir. */
export class PushGoneError extends Error {
  constructor(readonly statusCode: number) {
    super(`push abonelik geçersiz (${statusCode})`);
    this.name = 'PushGoneError';
  }
}

export class WebPushSender implements PushSender {
  constructor() {
    webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);
  }

  async send(sub: PushSubscriptionInput, payload: string): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 3600 },
      );
    } catch (err) {
      const code = Number((err as { statusCode?: unknown }).statusCode ?? 0);
      // 404 = uç yok · 410 = kullanıcı izni geri aldı. İkisi de "bir daha deneme" demek.
      if (code === 404 || code === 410) throw new PushGoneError(code);
      throw err;
    }
  }
}

interface Row { id: number; endpoint: string; p256dh: string; auth: string }

export class NotifyService {
  /**
   * Üretim bildirimlerinin birleştirme hafızası: `playerId → son push zamanı`.
   *
   * Bellek-içi olması BİLİNÇLİ: kaybolduğunda en kötü ihtimalle bir fazla bildirim gider, bu
   * yüzden kalıcılık bedeline değmez. Süreç yeniden başladığında sıfırlanır ve tabloya bir
   * yazma yükü daha eklenmemiş olur.
   */
  private readonly lastProduction = new Map<number, number>();

  constructor(
    private readonly db: Db,
    private readonly deps: {
      bus?: RealtimeBus | null;
      /** `null` dönerse çevrimiçilik BİLİNMİYOR demektir → çevrimdışı varsayılır (push gider). */
      isOnline: (playerId: number) => boolean;
      sender?: PushSender | null;
      now?: () => number;
    },
  ) {}

  /* ── Teslim ───────────────────────────────────────────────────────────────── */

  async deliver(notes: readonly Notification[]): Promise<void> {
    for (const note of notes) {
      try {
        await this.deliverOne(note);
      } catch (err) {
        // Bildirim hatası ASLA outbox satırını düşürmemeli: oyun mutasyonu çoktan yazıldı,
        // bildirim "en iyi çaba" katmanı (realtime.bus.publish ile aynı felsefe).
        NOTIFY_LOG.error({ err, category: note.category }, 'teslim başarısız');
      }
    }
  }

  private async deliverOne(note: Notification): Promise<void> {
    if (!await this.wants(note.playerId, note.category)) return;

    /* ⭐ TEK DALLANMA NOKTASI — ikisi birden asla çalışmaz. */
    if (this.deps.isOnline(note.playerId)) {
      await this.deps.bus?.publish({
        topic: 'notify:show',
        worldId: note.worldId,
        playerIds: [note.playerId],
        ref: {
          category: note.category,
          title: note.title,
          body: note.body,
          url: note.url,
          tag: note.tag,
        },
      });
      return;
    }

    /**
     * ⭐ KALKIŞ UYARISI ÇEVRİMDIŞIYA GİTMEZ (kullanıcı 2026-08-07). Saldırı/casusluk yola
     * çıktığı anda telefonu titretmek "ani saldırı"yı öldürüyordu; savunan orduyu artık
     * varışta öğreniyor (sonuç bildirimi push olarak gidiyor).
     *
     * ⚠️ Kapı toast dalının **ALTINDA**: çevrimiçi oyuncu uyarıyı görmeye devam etmeli —
     * kullanıcının şartı "zaten çevrimiçiyse görebilir" idi. Üste taşınırsa iki kanal da
     * susar ve uyarı tamamen kaybolur.
     */
    if (note.push === false) return;

    if (!this.shouldPush(note)) return;
    await this.push(note);
  }

  /**
   * Üretim birleştirmesi — yalnız PUSH tarafında. Toast birleştirilmez: uygulama zaten
   * açıkken oyuncu "Baraka bitti" satırını görmek ister; kilitli telefona arka arkaya beş
   * bildirim düşürmek ise kategoriyi kapattırır.
   */
  private shouldPush(note: Notification): boolean {
    if (note.category !== 'production') return true;
    const windowMs = notifyLimits().productionCoalesceSeconds * 1000;
    if (windowMs <= 0) return true;
    const now = this.deps.now?.() ?? Date.now();
    const last = this.lastProduction.get(note.playerId) ?? 0;
    if (now - last < windowMs) return false;
    this.lastProduction.set(note.playerId, now);
    return true;
  }

  private async push(note: Notification): Promise<void> {
    const sender = this.deps.sender;
    if (!sender) return;

    const subs = await this.db.execute<Record<string, unknown>>(sql`
      SELECT s.id, s.endpoint, s.p256dh, s.auth
        FROM push_subscriptions s
        JOIN players p ON p.account_id = s.account_id
       WHERE p.id = ${note.playerId}
    `);
    if (subs.length === 0) return;

    const payload = JSON.stringify({
      title: note.title, body: note.body, url: note.url,
      tag: note.tag, category: note.category,
    });

    for (const raw of subs) {
      const row: Row = {
        id: Number(raw['id']),
        endpoint: String(raw['endpoint']),
        p256dh: String(raw['p256dh']),
        auth: String(raw['auth']),
      };
      try {
        await sender.send(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
        );
        await this.db.execute(sql`
          UPDATE push_subscriptions SET last_used_at = now(), fail_count = 0, failed_at = NULL
           WHERE id = ${row.id}
        `);
      } catch (err) {
        await this.recordFailure(row.id, err);
      }
    }
  }

  /**
   * ⭐ ÖLÜ ABONELİK TEMİZLİĞİ. Bu olmadan tablo çöple dolar: kullanıcı izni geri aldığında
   * push servisi 410 döner ve o abonelik sonsuza kadar denenmeye devam ederdi — her bildirimde
   * bir başarısız HTTP isteği, kalıcı olarak.
   */
  private async recordFailure(id: number, err: unknown): Promise<void> {
    if (err instanceof PushGoneError) {
      await this.db.execute(sql`DELETE FROM push_subscriptions WHERE id = ${id}`);
      return;
    }
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE push_subscriptions
         SET fail_count = fail_count + 1, failed_at = now()
       WHERE id = ${id}
      RETURNING fail_count
    `);
    if (Number(row?.['fail_count'] ?? 0) >= notifyLimits().maxFailures) {
      await this.db.execute(sql`DELETE FROM push_subscriptions WHERE id = ${id}`);
    }
  }

  /* ── Tercihler ────────────────────────────────────────────────────────────── */

  /** Kategori açık mı? Anahtar yoksa `NOTIFY_DEFAULTS`, yani yeni kategoriler kendiliğinden açık. */
  private async wants(playerId: number, category: NotifyCategory): Promise<boolean> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.notify_prefs FROM players p JOIN accounts a ON a.id = p.account_id
       WHERE p.id = ${playerId}
    `);
    if (!row) return false;
    const prefs = (row['notify_prefs'] ?? {}) as Record<string, unknown>;
    return prefs[category] === undefined ? NOTIFY_DEFAULTS[category] : prefs[category] !== false;
  }

  async prefs(accountId: number): Promise<Record<NotifyCategory, boolean>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT notify_prefs FROM accounts WHERE id = ${accountId}
    `);
    const stored = (row?.['notify_prefs'] ?? {}) as Record<string, unknown>;
    const out = { ...NOTIFY_DEFAULTS } as Record<NotifyCategory, boolean>;
    for (const key of Object.keys(out) as NotifyCategory[]) {
      if (stored[key] !== undefined) out[key] = stored[key] !== false;
    }
    return out;
  }

  /** Kısmî güncelleme: yalnız gönderilen anahtarlar yazılır (jsonb birleştirme). */
  async setPrefs(accountId: number, patch: Partial<Record<NotifyCategory, boolean>>): Promise<void> {
    await this.db.execute(sql`
      UPDATE accounts SET notify_prefs = notify_prefs || ${JSON.stringify(patch)}::jsonb
       WHERE id = ${accountId}
    `);
  }

  /* ── Abonelik ─────────────────────────────────────────────────────────────── */

  /**
   * Abonelik kaydı. `endpoint` küresel benzersiz olduğu için ON CONFLICT güncelleme yapar:
   * aynı tarayıcı yeniden abone olduğunda (anahtar döndüğünde tarayıcı yeni abonelik üretir)
   * satır çoğalmaz, tazelenir ve hata sayacı sıfırlanır.
   */
  async subscribe(o: {
    accountId: number; sub: PushSubscriptionInput; deviceId?: string | null; userAgent?: string | null;
  }): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth, device_id, user_agent, last_used_at)
      VALUES (${o.accountId}, ${o.sub.endpoint}, ${o.sub.keys.p256dh}, ${o.sub.keys.auth},
              ${o.deviceId ?? null}, ${o.userAgent ?? null}, now())
      ON CONFLICT (endpoint) DO UPDATE
        SET account_id = ${o.accountId}, p256dh = ${o.sub.keys.p256dh}, auth = ${o.sub.keys.auth},
            device_id = ${o.deviceId ?? null}, user_agent = ${o.userAgent ?? null},
            last_used_at = now(), fail_count = 0, failed_at = NULL
    `);
  }

  async unsubscribe(accountId: number, endpoint: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM push_subscriptions WHERE account_id = ${accountId} AND endpoint = ${endpoint}
    `);
  }

  /** İstemci "bu tarayıcı kayıtlı mı" diye sorabilsin (izin verdi ama abonelik düşmüş olabilir). */
  async hasSubscription(accountId: number, endpoint: string): Promise<boolean> {
    const rows = await this.db.execute(sql`
      SELECT 1 FROM push_subscriptions WHERE account_id = ${accountId} AND endpoint = ${endpoint}
    `);
    return rows.length > 0;
  }
}

/** Anahtarlar varsa gerçek gönderici, yoksa `null` (push sessizce kapalı). */
export const defaultPushSender = (): PushSender | null =>
  (pushEnabled() ? new WebPushSender() : null);
