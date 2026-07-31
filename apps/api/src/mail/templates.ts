/**
 * ⭐ E-POSTA ŞABLONLARI (§9.2) — Türkçe, oyunun kendi diliyle.
 *
 * Her mailin **düz metin karşılığı da var**: bazı istemciler HTML'i hiç göstermiyor ve
 * yalnız-HTML mailler spam puanı yükseltiyor. İkisi de aynı bilgiyi taşımak zorunda.
 *
 * ⚠️ HTML bilerek **iskeletsiz ve satır içi stilli**: posta istemcileri `<style>` bloklarını,
 * flexbox'ı ve harici fontu güvenilmez şekilde işliyor. Burada oyunun tema token'ları
 * KULLANILAMAZ — mail, tarayıcının CSS değişkenlerine erişemez.
 */
import { mailLimits } from './mail.limits.ts';

export interface Template { subject: string; html: string; text: string }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ortak kabuk: koyu başlık + gövde + küçük dipnot. Satır içi stil, tablo yok, resim yok. */
function shell(title: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  return `<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1410">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:2px solid #cbbfa6;border-radius:8px;overflow:hidden">
    <div style="background:#1a1410;color:#e8dcc0;padding:14px 20px;font-size:18px;font-weight:600;letter-spacing:.5px">Mobiwar</div>
    <div style="padding:20px">
      <h1 style="margin:0 0 12px;font-size:17px;color:#1a1410">${esc(title)}</h1>
      ${bodyHtml}
      <p style="margin:22px 0 8px">
        <a href="${esc(ctaUrl)}" style="display:inline-block;background:#8a5a2b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600">${esc(ctaLabel)}</a>
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#6b6153;word-break:break-all">
        Düğme çalışmazsa bu adresi tarayıcına yapıştır:<br>${esc(ctaUrl)}
      </p>
    </div>
    <div style="border-top:1px solid #e3dac6;padding:12px 20px;font-size:11px;color:#8b8172">
      Bu e-postayı sen istemediysen dikkate alma; hesabında hiçbir şey değişmez.
    </div>
  </div>
</div>`;
}

export function verifyEmail(o: { username: string; url: string }): Template {
  const text = [
    `Mobiwar'a hoş geldin, ${o.username}.`,
    '',
    'E-posta adresini doğrulamak için aşağıdaki adresi aç:',
    o.url,
    '',
    `Bağlantı ${mailLimits().verifyTtlHours} saat geçerli.`,
    '',
    'Doğrulama, şifreni unuttuğunda hesabını geri alabilmen için gerekli.',
    'Bu e-postayı sen istemediysen dikkate alma.',
  ].join('\n');

  return {
    subject: 'Mobiwar — e-posta adresini doğrula',
    text,
    html: shell(
      `Hoş geldin, ${o.username}`,
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">Hesabın hazır. E-posta adresini
       doğrularsan şifreni unuttuğunda hesabını geri alabilirsin.</p>
       <p style="margin:0;font-size:13px;color:#6b6153">Bağlantı ${mailLimits().verifyTtlHours} saat geçerli.</p>`,
      o.url, 'E-postamı Doğrula',
    ),
  };
}

export function resetPassword(o: { username: string; url: string }): Template {
  const text = [
    `Merhaba ${o.username},`,
    '',
    'Mobiwar hesabın için şifre sıfırlama isteği aldık. Yeni şifreni belirlemek için:',
    o.url,
    '',
    `Bağlantı ${mailLimits().resetTtlMinutes} dakika geçerli ve yalnız BİR kez kullanılabilir.`,
    '',
    'Şifreni değiştirdiğinde açık olan tüm oturumların kapanır.',
    'Bu isteği sen yapmadıysan dikkate alma; şifren değişmez.',
  ].join('\n');

  return {
    subject: 'Mobiwar — şifre sıfırlama',
    text,
    html: shell(
      'Şifre sıfırlama',
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">Merhaba <strong>${esc(o.username)}</strong>,
       hesabın için şifre sıfırlama isteği aldık.</p>
       <p style="margin:0 0 10px;font-size:13px;color:#6b6153">Bağlantı
       ${mailLimits().resetTtlMinutes} dakika geçerli ve yalnız <strong>bir kez</strong> kullanılabilir.</p>
       <p style="margin:0;font-size:13px;color:#6b6153">Şifreni değiştirdiğinde açık olan tüm oturumların kapanır.</p>`,
      o.url, 'Yeni Şifre Belirle',
    ),
  };
}
