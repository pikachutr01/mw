/**
 * Access token doğrulaması + **dünya bağlamının sabitlenmesi**.
 *
 * ⚠️ Dünya kimliği (`worldId`) **istek yükünden ASLA okunmaz** — imzalı token'dan gelir.
 * Bu, §13.12.1b dünya yalıtımının üçüncü katmanı: "başka dünyanın kanalına yaz" saldırısı
 * şema/sorgu/soket katmanlarına hiç ulaşamaz.
 */
import {
  ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { TokenService } from './token.service.ts';
import { PresenceService, claimGraceSeconds, singleDeviceEnforced } from './presence.service.ts';
import { DB } from '../db/tokens.ts';

/** Sahiplik damgası bu aralıkta bir kez tazelenir — sıcak yola her istekte UPDATE konmaz. */
const TOUCH_INTERVAL_MS = 30_000;

export interface RequestPlayer {
  accountId: number;
  playerId: number;
  worldId: number;
  sessionId: string;
  /** Tek cihaz kuralının sekme düzeyindeki ayracı (`X-Client-Instance`). */
  instanceId: string;
}

/** Fastify isteğine eklenen alan. Controller'lar bunu okur. */
export interface AuthedRequest {
  player?: RequestPlayer;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}

/**
 * ⭐ İSTEMCİ ÖRNEK KİMLİĞİ. Başlık yoksa oturum kimliğinden türetilir.
 *
 * ⚠️ Türetme ŞART: aksi hâlde başlığı göndermemek kuralı tamamen atlatırdı. Başlığı olmayan
 * istemci (panel, betik, eski sürüm) tek bir örnek gibi davranır — yani hâlâ tek yerde açık
 * olabilir, ama sekmeleri ayırt edilemez.
 */
export function instanceOf(headers: AuthedRequest['headers'], sessionId: string): string {
  const raw = headers['x-client-instance'];
  const one = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return one && one.length <= 64 ? one : `s:${sessionId}`;
}

/**
 * Tek cihaz kuralının UYGULANMADIĞI yollar.
 *
 * ⚠️ `admin` MUAF — ve bu bir kolaylık değil zorunluluk: panel oyunla aynı hesaba ayrı bir
 * oturumla giriyor. Muaf olmasaydı yönetim panelini açmak yöneticiyi kendi oyunundan atardı.
 * ⚠️ `auth` MUAF — çıkış yapmak, oturumları listelemek ve sahipliği DEVRALMAK kilitliyken de
 * çalışmalı; yoksa çakışma modalındaki düğmenin kendisi 409 alırdı.
 */
const PRESENCE_EXEMPT = /^\/api\/v1\/(admin|auth)\b/;

/** İstemcinin bildirdiği platform — çakışma modalında "telefonunda açık" diyebilmek için. */
export function platformOf(headers: AuthedRequest['headers']): string | null {
  const raw = headers['x-platform'];
  const one = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return one === 'web' || one === 'android' || one === 'ios' ? one : null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  // ⚠️ `import type` KULLANILMAZ: dekoratör metadata'sı tipi `Object` olarak yazar ve Nest
  // bağımlılığı çözemez. Sembol belirteçli sağlayıcılar ayrıca @Inject ister.
  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) throw new UnauthorizedException('Yetki başlığı yok.');

    let claims;
    try {
      claims = await this.tokens.verifyAccess(raw.slice(7));
    } catch {
      throw new UnauthorizedException('Token geçersiz veya süresi dolmuş.');
    }

    /**
     * Oturum iptal edilmiş olabilir (çıkış / parola değişimi / şüpheli erişim). Access token
     * durumsuz olduğu için bu kontrol şart.
     *
     * ⭐ Bu sorgu, jeton ömrünün ne olduğunun neden önemsiz olduğunun da cevabı: iptal
     * **her istekte** buradan görülüyor, jetonun süresinin dolmasını beklemiyor. Ömür bu
     * yüzden 15 dakikadan 12 saate çıkarılabildi (`session.accessTtlHours`).
     *
     * ⚠️ TRY İÇİNDE — ve hata **503**, 401 DEĞİL. Eskiden bu çağrı try dışındaydı: geçici bir
     * DB tökezlemesi ya da havuz tükenmesi doğrudan **500**'e dönüşüyor ve TÜM korumalı uçları
     * aynı anda vuruyordu (tarayıcı konsolunda `/messages`, `/missions`, `/cities/:id`
     * salvosu). 401 döndürmek de yanlış olurdu: istemci onu «jetonum bayat» diye okuyup
     * yenilemeye kalkar, yenileme de aynı DB'ye gittiği için düşer ve oyuncu geçici bir
     * arıza yüzünden oturumundan atılır. `optional-auth.guard.ts:40-56` aynı sorguyu zaten
     * try içine almıştı; asimetri kasıtsızdı.
     */
    const enforce = singleDeviceEnforced() && !PRESENCE_EXEMPT.test(req.url ?? '');
    const grace = claimGraceSeconds();

    /**
     * ⚠️ Sahiplik AYNI SORGUDA okunuyor — ek gidiş dönüş YOK. Ayrı bir SELECT yazmak oyunun
     * en sıcak yoluna ikinci bir sorgu koyardı; `LEFT JOIN` bedava.
     */
    let row: Record<string, unknown> | undefined;
    try {
      const rows = await this.db.execute<Record<string, unknown>>(sql`
        SELECT s.account_id,
               ${enforce ? sql`ap.instance_id` : sql`NULL`} AS holder_instance,
               ${enforce ? sql`ap.platform` : sql`NULL`}    AS holder_platform,
               ${enforce ? sql`ap.seen_at` : sql`NULL`}     AS holder_seen
          FROM sessions s
          ${enforce
            ? sql`LEFT JOIN account_presence ap
                    ON ap.account_id = s.account_id
                   AND ap.seen_at >= now() - (${grace} * interval '1 second')`
            : sql``}
         WHERE s.id = ${claims.sid}::uuid AND s.revoked_at IS NULL AND s.expires_at > now()
      `);
      row = rows[0];
    } catch (err) {
      throw new ServiceUnavailableException(
        `Oturum doğrulanamadı (geçici): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!row) throw new UnauthorizedException('Oturum kapatılmış.');

    const player: RequestPlayer = {
      accountId: Number(claims.sub),
      playerId: claims.pid,
      worldId: claims.wid,
      sessionId: claims.sid,
      instanceId: instanceOf(req.headers, claims.sid),
    };
    req.player = player;

    if (enforce) await this.enforceSingleDevice(player, row, req.headers);
    return true;
  }

  /**
   * ⭐ TEK CİHAZ KURALI — HTTP ayağı.
   *
   * Sahipliği asıl olarak SOKET alıyor (`realtime.gateway.ts`): bağlanınca sahiplen, kopunca
   * bırak. Burası iki iş yapıyor:
   *   1. **Kontrol** — sahip başkasıysa 409, istemci tam ekran modalı açar.
   *   2. **Yedek sahiplenme** — soket hiç kurulamadıysa (vekil WebSocket'i kesiyor, istemci
   *      yoklamaya düşmüş) sahiplik boş kalırdı ve kural hiç çalışmazdı.
   *
   * ⚠️ **KONTROL KISILMAZ, YALNIZ YAZMA KISILIR.** İlk yazımda ikisi birden kısılmıştı ve
   * ölçüm bunu yakaladı: devralınan cihaz 30 saniye daha oynamaya devam ediyordu (kontrolü
   * atladığı için). Okuma zaten yukarıdaki `LEFT JOIN`den bedava geliyor — kısmanın ona
   * uygulanması için hiçbir sebep yoktu.
   */
  private async enforceSingleDevice(
    p: RequestPlayer, row: Record<string, unknown>, headers: AuthedRequest['headers'],
  ): Promise<void> {
    const holder = row['holder_instance'] == null ? null : String(row['holder_instance']);

    // Sahip BAŞKASI → anında 409. Hiçbir kısma bu kontrolün önüne geçmez.
    if (holder != null && holder !== p.instanceId) {
      AuthGuard.touched.delete(`${p.accountId}:${p.instanceId}`);
      throw new ConflictException({
        code: 'session_conflict',
        message: 'Hesabın başka bir cihazda açık.',
        holder: {
          platform: row['holder_platform'] == null ? null : String(row['holder_platform']),
          seenAt: row['holder_seen'] == null
            ? null
            : new Date(String(row['holder_seen'])).toISOString(),
        },
      });
    }

    /**
     * Buradan sonrası yalnız YAZMA: sahiplik ya bizde ya da boş.
     * ⚠️ Harita süreç-yerel ve sınırsız büyümez (5000'de temizleniyor). Yanlış tarafa düşen
     * bir kayıp (süreç yeniden başlaması) yalnız fazladan bir UPDATE demek.
     */
    const key = `${p.accountId}:${p.instanceId}`;
    const now = Date.now();
    const last = AuthGuard.touched.get(key);
    if (holder != null && last != null && now - last < TOUCH_INTERVAL_MS) return;

    const res = await this.presence.claim({
      accountId: p.accountId,
      sessionId: p.sessionId,
      instanceId: p.instanceId,
      worldId: p.worldId,
      platform: platformOf(headers),
    });
    // Yarış: sahiplik boş görünüyordu ama arada başkası kaptı.
    if (!res.ok) {
      AuthGuard.touched.delete(key);
      throw new ConflictException({
        code: 'session_conflict',
        message: 'Hesabın başka bir cihazda açık.',
        holder: { platform: res.holder.platform, seenAt: res.holder.seenAt },
      });
    }

    if (AuthGuard.touched.size > 5000) AuthGuard.touched.clear();
    AuthGuard.touched.set(key, now);
  }

  /** `hesap:örnek` → son `seen_at` yazımının zamanı (süreç-yerel kısma). */
  private static readonly touched = new Map<string, number>();
}
