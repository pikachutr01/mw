/**
 * ⭐ GLOBAL HATA FİLTRESİ — 500'ler artık İZLENEBİLİR.
 *
 * Buraya kadar `apps/api/src` içinde tek bir `ExceptionFilter` yoktu: beklenmeyen bir hata
 * Nest'in varsayılan işleyicisine düşüyor, istemciye `{"statusCode":500}` gidiyor ve sunucuda
 * yalnız çıplak bir yığın izi kalıyordu. Yani **hangi uçtan, hangi oyuncudan, hangi istekte**
 * patladığı hiçbir yerde yazmıyordu. Kullanıcı 2026-08-03'te konsolunda dört ayrı ucun aynı
 * anda 500 verdiğini gördüğünde, log dosyasında bu soruların cevabı yoktu.
 *
 * Ne yapar:
 *   • 5xx → tek satır yapılandırılmış log (yöntem · yol · durum · oyuncu · mesaj) + yığın izi
 *   • 4xx → SESSİZ. Bunlar normal akışın parçası (401 bayat jeton, 409 çakışma, 400 doğrulama);
 *     loglamak gürültüden başka bir şey üretmez ve gerçek hataları içinde boğardı.
 *   • Gövde biçimi Nest'in varsayılanıyla AYNI kalır — istemcideki `errorOf()`
 *     (`apps/web/src/lib/api.ts`) `message`/`code` alanlarını okuyor, kırılmamalı.
 *
 * ⚠️ 5xx gövdesinde iç mesaj İSTEMCİYE GİTMEZ. Yığın izi ve DB hata metni sunucuda kalır;
 * dışarı yalnız «Sunucu hatası» + `traceId` çıkar. Aksi hâlde tablo/sütun adları ve sorgu
 * parçaları tarayıcı konsoluna sızardı.
 */
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RequestPlayer } from '../auth/auth.guard.ts';
import { log } from './logger.ts';
import { currentTraceId } from './request-context.ts';

const HTTP_LOG = log('http');

interface LoggedRequest {
  method?: string;
  url?: string;
  player?: RequestPlayer;
}

interface ReplyLike {
  status: (code: number) => ReplyLike;
  send: (body: unknown) => unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<LoggedRequest>();
    const reply = http.getResponse<ReplyLike>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status < 500) {
      reply.status(status).send(isHttp ? exception.getResponse() : { message: 'İstek başarısız.' });
      return;
    }

    /**
     * ⚠️ `traceId` hem loga hem yanıta gider. Kullanıcı bir ekran görüntüsü gönderdiğinde
     * log dosyasında o satırı aramanın tek pratik yolu bu — yoksa "saat 12:37'de bir 500
     * gördüm" ile yüz binlerce satır arasında eşleştirme yapmak gerekir.
     *
     * ⭐⭐ **ARTIK İSTEK BAŞINDA ÜRETİLİYOR** (Faz 3). Eskiden burada, yani hata ANINDA
     * üretiliyordu ve sonucu şuydu: kimlik yalnız log satırında ve yanıtta yaşıyor, isteğin
     * veritabanında yazdığı `audit_log` satırlarıyla HİÇBİR bağı olmuyordu. Kimlik isteğin
     * başında doğunca (`request-context.ts`) üçü de aynı ipe diziliyor: yanıt → log → denetim
     * kaydı. `randomUUID` yedeği yalnız bağlam dışı bir çağrı için (ör. açılış hatası).
     */
    const traceId = currentTraceId() ?? randomUUID().slice(0, 8);
    const message = exception instanceof Error ? exception.message : String(exception);

    HTTP_LOG.error({
      traceId,
      status,
      method: req.method ?? null,
      url: req.url ?? null,
      playerId: req.player?.playerId ?? null,
      worldId: req.player?.worldId ?? null,
      err: exception instanceof Error ? exception : undefined,
    }, message);

    reply.status(status).send({
      statusCode: status,
      message: 'Sunucu hatası.',
      traceId,
    });
  }
}
