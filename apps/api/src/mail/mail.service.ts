/**
 * ⭐ E-POSTA GÖNDERİMİ (§9.2) — Resend.
 *
 * **`resend` npm paketi BİLEREK eklenmedi.** Uç tek (`POST https://api.resend.com/emails`),
 * gövde dört alan, kimlik `Authorization: Bearer`. Node 22'nin global `fetch`'i yetiyor ve
 * projede zaten hiç HTTP istemci bağımlılığı yok — SDK, sürüm bakımı ve saldırı yüzeyi
 * getirir, karşılığında tek `fetch` çağrısı kadar iş yapar.
 *
 * ⭐ **Gönderim outbox üzerinden** (`mail:send` topic'i + worker'daki kendi sink'i). Kazanç:
 * yeniden deneme, `attempts`/`last_error`, dead-letter sayacı bedava gelir; kayıt işlemi
 * postaya bağlı kalmaz (mail servisi çökse bile hesap açılır).
 *
 * ⭐ Resend'in **`Idempotency-Key`** başlığına **outbox satır id'si** verilir. İki mekanizma
 * birebir örtüşüyor: ağ zaman aşımından sonra dispatcher satırı yeniden dener, Resend aynı
 * anahtarı görüp maili İKİNCİ kez göndermez. Bu olmasa "en az bir kez teslim" garantisi
 * kullanıcının kutusunda mükerrer mail demek olurdu.
 */
import { MAIL, mailLimits, mailEnabled } from './mail.limits.ts';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Mükerrer gönderimi engelleyen anahtar — outbox satır id'si verilir. */
  idempotencyKey?: string;
}

export interface MailSender {
  send(msg: MailMessage): Promise<{ id: string }>;
}

export class MailError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'MailError';
  }
}

export class ResendSender implements MailSender {
  async send(msg: MailMessage): Promise<{ id: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), mailLimits().sendTimeoutMs);
    try {
      const res = await fetch(MAIL.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${MAIL.apiKey}`,
          'content-type': 'application/json',
          ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: MAIL.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
        }),
        signal: controller.signal,
      });

      const body = await res.text();
      if (!res.ok) throw new MailError(`Resend ${res.status}: ${body.slice(0, 300)}`, res.status);
      const parsed = JSON.parse(body) as { id?: string };
      return { id: String(parsed.id ?? '') };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Anahtarsız ortam için: maili GÖNDERMEZ, konsola basar.
 *
 * Bağlantının log'da görünmesi kasıtlı — geliştirici doğrulama/sıfırlama akışının tamamını
 * gerçek posta kurmadan deneyebilir. ⚠️ Üretimde anahtar tanımlıysa bu sınıf hiç kurulmaz.
 */
export class LogSender implements MailSender {
  async send(msg: MailMessage): Promise<{ id: string }> {
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail] (GÖNDERİLMEDİ — RESEND_API_KEY yok)\n  kime: ${msg.to}\n  konu: ${msg.subject}\n`
      + `  metin:\n${msg.text.split('\n').map((l) => `    ${l}`).join('\n')}\n`,
    );
    return { id: `log-${Date.now()}` };
  }
}

export const defaultMailSender = (): MailSender =>
  (mailEnabled() ? new ResendSender() : new LogSender());
