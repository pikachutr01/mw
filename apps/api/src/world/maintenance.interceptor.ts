/**
 * ⭐ BAKIM KİLİDİ — dünya bakımdayken **tüm oyun mutasyonları 503** döner (admin Faz 2).
 *
 * Bugüne kadar bakım modu yalnız SAATİ donduruyordu: geri sayımlar duruyor, scheduler yeni görev
 * almıyor, ama HTTP yazmaları serbestçe geçiyordu. Yani oyuncu bakım sırasında bina kuyruğuna iş
 * ekleyebiliyor, ordu gönderebiliyordu — donmuş bir saatin üstüne. Kullanıcının isteği net:
 * *"her şey aniden donar ve bakım bitiminde kaldığı yerden devam eder."* Donmanın yarısı saatte,
 * yarısı burada.
 *
 * ⚠️ **NEDEN GUARD DEĞİL INTERCEPTOR?** Nest'te global guard'lar controller guard'larından ÖNCE
 * çalışır → `APP_GUARD` olarak kaydedilseydi `AuthGuard` henüz koşmamış olurdu ve `req.player`
 * boş gelirdi. O zaman ne hangi dünyanın kilitlendiğini bilebilirdik ne de admin muafiyetini
 * uygulayabilirdik. Interceptor'lar **tüm guard'lardan sonra** çalışır; kimlik hazır.
 * Alternatif (her controller'a `@UseGuards(AuthGuard, MaintenanceGuard)` yazmak) çalışırdı ama
 * "TÜM mutasyonlar kilitli" iddiası o zaman **gelecekteki her controller'ın unutmamasına**
 * bağlı olurdu. Tek kayıt noktası bu iddiayı yapısal olarak taşıyor.
 *
 * ⚠️ Kilit **HTTP metodundan** okunur, uç listesinden değil: yarın eklenecek bir `POST` kendini
 * otomatik kilitli bulur. Beyaz liste dar ve gerekçeli tutuldu.
 */
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { WorldStateService } from './world-state.service.ts';

const MUTATIONS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Kilidin DIŞINDA kalan yollar. İkisi de "bakımı yönetebilmek/görebilmek" için gerekli:
 *
 *   `/api/v1/auth/`  → giriş · token yenileme · çıkış. Kapatsaydık oturumu düşen oyuncu
 *                      **perdeyi bile göremezdi**: perde oturum gerektiren bir ekranda.
 *   `/api/v1/admin/` → bakımı bitirecek olan uçlar. Kendi kilidimizde kalmak absürt olurdu.
 */
const OPEN_PREFIXES = ['/api/v1/auth/', '/api/v1/admin/'] as const;

@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  // ⚠️ `import type` KULLANILMAZ (dekoratör metadata'sı `Object` yazar, Nest çözemez).
  constructor(
    private readonly worlds: WorldStateService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<
      AuthedRequest & { method?: string; url?: string; routerPath?: string }
    >();

    const method = String(req.method ?? 'GET').toUpperCase();
    if (!MUTATIONS.has(method)) return next.handle();

    // Fastify'da `url` sorgu dizesini de taşır; yalnız yol kısmına bakıyoruz.
    const path = String(req.url ?? '').split('?')[0] ?? '';
    if (OPEN_PREFIXES.some((p) => path.startsWith(p))) return next.handle();

    const worldId = req.player?.worldId;
    // Kimliksiz mutasyon zaten `AuthGuard`tan geçemez; buraya düşerse dünyası da yok demektir.
    if (worldId == null) return next.handle();

    // ⭐ SICAK YOL: Map okuması, sorgu yok. Dünya çalışıyorsa kilidin maliyeti sıfır.
    const state = this.worlds.get(worldId);
    if (!state?.paused) return next.handle();

    /**
     * ⚠️ Personel muafiyeti YALNIZ bakım açıkken sorgulanıyor. Rolü her istekte okusaydık
     * kilidin bedeli çalışan dünyada da bir sorgu olurdu; oysa buraya yalnız bakımdayken ve
     * yalnız mutasyonlarda geliniyor — yani günde birkaç kez. `AdminGuard` ile aynı gerekçe:
     * rol token'da taşınmaz, DB'den okunur.
     */
    if (await this.isStaff(req.player!.accountId)) return next.handle();

    throw new ServiceUnavailableException({
      code: 'maintenance',
      message: state.notice ?? 'Dünya bakımda. Tüm ilerleme donduruldu, bakım bitince kaldığı yerden devam edecek.',
      // İstemci perdeyi bu alanlarla doldurur; ayrıca `/world/state` sormasına gerek kalmaz.
      pausedAt: state.pausedAt?.toISOString() ?? null,
      eta: state.eta?.toISOString() ?? null,
    });
  }

  private async isStaff(accountId: number): Promise<boolean> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM accounts WHERE id = ${accountId} AND role IN ('moderator', 'admin')
    `);
    return rows.length > 0;
  }
}
