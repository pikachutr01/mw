/**
 * ⭐ İSTEĞE BAĞLI KİMLİK — token varsa doğrula ve `req.player`ı doldur, yoksa **geç**.
 *
 * Tek kullanıcısı dahili savaş simülatörü (§0.0): o uç bilerek **kimlik gerektirmiyor**
 * (kaynak harcamaz, durum değiştirmez, dışarıdan denenebilir) ama Faz 4'ten beri dünyanın
 * etkin motor sabitleriyle koşması gerekiyor — yani giriş yapmış oyuncunun dünyasını
 * BİLMESİ gerekiyor.
 *
 * ⚠️ Bu guard olmadan `req.player` **hiçbir zaman** dolmuyordu: `AuthGuard` controller
 * bazlı ve simülatörde yok. `req.player?.worldId ?? 0` yazan kod derleniyor, çalışıyor ve
 * sessizce daima 0 dönüyordu — yani dünya bazlı denge ayarı simülatöre hiç ulaşmıyordu.
 * Canlı ölçümde yakalandı (kaydedilen sabit sonucu değiştirmedi).
 *
 * ⚠️ **Geçersiz token da geçer.** Bu uç zaten herkese açık; geçersiz token'da 401 döndürmek
 * "kimlik gerekmez" sözünü bozardı. Kural şu: token DOĞRUYSA bağlam dolar, değilse anonim
 * davranılır — hiçbir durumda yarım doğrulanmış bir kimlik oluşmaz.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { TokenService } from './token.service.ts';
import type { AuthedRequest } from './auth.guard.ts';
import { instanceOf } from './auth.guard.ts';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  // ⚠️ `import type` KULLANILMAZ (dekoratör metadata'sı `Object` yazar, Nest çözemez).
  constructor(
    private readonly tokens: TokenService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) return true;

    try {
      const claims = await this.tokens.verifyAccess(raw.slice(7));
      // Oturum iptali burada da kontrol edilir: `AuthGuard` ile aynı kural, aynı sorgu.
      const rows = await this.db.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM sessions
         WHERE id = ${claims.sid}::uuid AND revoked_at IS NULL AND expires_at > now()
      `);
      if (rows.length === 0) return true;
      req.player = {
        accountId: Number(claims.sub),
        playerId: claims.pid,
        worldId: claims.wid,
        sessionId: claims.sid,
        // ⚠️ Tek cihaz kuralı BURADA UYGULANMAZ: bu guard'ın arkasındaki uçlar kimliksiz de
        //    çalışıyor (ana sayfa, simülatör). Kimlik yalnız kişiselleştirme için okunuyor.
        instanceId: instanceOf(req.headers, claims.sid),
      };
    } catch {
      // Geçersiz/süresi dolmuş token → anonim devam. Yukarıdaki gerekçe.
    }
    return true;
  }
}
