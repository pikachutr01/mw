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
    <div style="background:#1a1410;color:#e8dcc0;padding:14px 20px;font-size:18px;font-weight:600;letter-spacing:.5px">MobilWar</div>
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
    `MobilWar'a hoş geldin, ${o.username}.`,
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
    subject: 'MobilWar — e-posta adresini doğrula',
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

/**
 * ⭐ ŞİFRE DEĞİŞTİ BİLDİRİMİ (kullanıcı, 2026-08-01) — jetonsuz, düğmesiz.
 *
 * ⚠️ **Neden `shell()` kullanmıyor:** o kabuk bir CTA düğmesi zorunlu kılıyor ve buradaki
 * mailin çağırdığı bir eylem YOK. Sahte bir düğme koymak ("Hesabıma git") oltalama maillerinin
 * en tanıdık kalıbını taklit etmek olurdu; bu mailin tek işi *"sen yapmadıysan haberin olsun"*.
 *
 * ⚠️ Dünya adı yazılıyor: hesap dünya başına ayrı (`accounts.email` küresel tekil, kayıt aynı
 * adresi ikinci kez kabul etmiyor) ve oyuncu hangi dünyadaki şifresinin değiştiğini bilmeli.
 */
export function passwordChanged(o: { username: string; worldName: string }): Template {
  const text = [
    `Merhaba ${o.username},`,
    '',
    `MobilWar hesabının (${o.worldName}) şifresi az önce değiştirildi.`,
    'Diğer cihazlardaki oturumların kapatıldı; bu cihazda açık kalmaya devam ediyorsun.',
    '',
    'Bu işlemi SEN yapmadıysan hesabın ele geçirilmiş olabilir:',
    'hemen "Şifremi unuttum" ile yeni bir şifre belirle.',
  ].join('\n');

  return {
    subject: 'MobilWar — şifren değiştirildi',
    text,
    html: `<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1410">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:2px solid #cbbfa6;border-radius:8px;overflow:hidden">
    <div style="background:#1a1410;color:#e8dcc0;padding:14px 20px;font-size:18px;font-weight:600;letter-spacing:.5px">MobilWar</div>
    <div style="padding:20px">
      <h1 style="margin:0 0 12px;font-size:17px;color:#1a1410">Şifren değiştirildi</h1>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5">Merhaba <strong>${esc(o.username)}</strong>,
       hesabının (<strong>${esc(o.worldName)}</strong>) şifresi az önce değiştirildi.</p>
      <p style="margin:0 0 10px;font-size:13px;color:#6b6153">Diğer cihazlardaki oturumların
       kapatıldı; bu cihazda açık kalmaya devam ediyorsun.</p>
      <p style="margin:0;font-size:13px;color:#8a2b2b"><strong>Bu işlemi sen yapmadıysan</strong>
       hesabın ele geçirilmiş olabilir — hemen «Şifremi unuttum» ile yeni bir şifre belirle.</p>
    </div>
    <div style="border-top:1px solid #e3dac6;padding:12px 20px;font-size:11px;color:#8b8172">
      Bu bir bilgilendirme e-postasıdır; yanıtlamana gerek yok.
    </div>
  </div>
</div>`,
  };
}

/**
 * ⭐ HESAP SİLME BAĞLANTISI (kullanıcı, 2026-08-01) — 12 saat, tek kullanımlık.
 *
 * ⚠️ Metin **ne olacağını sayar**, "hesabın silinecek" demekle yetinmez. 2026-08-13'ten beri
 * sayılacak şey değişti: artık oyun dünyasında **hiçbir şey** olmuyor, olan biten yalnız hesap
 * tarafında. Oyuncunun bunu bağlantıya tıklamadan ÖNCE bilmesi gerekiyor; onay sayfası da aynı
 * listeyi tekrar gösteriyor.
 *
 * ⚠️ "Eski adını alamazsın" maddesi süs değil: ad dünyada kaldığı için aynı e-postayla dönen
 * oyuncu yeni bir ad seçmek zorunda ve bunu **kararı vermeden önce** bilmeli.
 */
export function deleteAccount(o: { username: string; url: string }): Template {
  const text = [
    `Merhaba ${o.username},`,
    '',
    'Hesabını silmek için bir istek aldık. Silme işlemini tamamlamak için:',
    o.url,
    '',
    'Bağlantı 12 saat geçerli ve yalnız BİR kez kullanılabilir.',
    '',
    'Silme onaylandığında:',
    '• tüm oturumların kapanır ve bir daha giriş yapamazsın',
    '• e-posta adresin, şifren ve bildirim aboneliklerin hesaptan silinir',
    '• ŞEHİRLERİN adlarıyla birlikte dünyada kalır: saldırılabilir ve ganimet üretmeyi sürdürür',
    '• oyuncu adın ve puanın da değişmez, sıralamalarda görünmeye devam eder',
    '• aynı e-posta adresiyle yeniden kayıt olabilirsin ama ESKİ OYUNCU ADINI ALAMAZSIN',
    '',
    'Bu isteği sen yapmadıysan dikkate alma; hesabında hiçbir şey değişmez.',
  ].join('\n');

  return {
    subject: 'MobilWar — hesap silme onayı',
    text,
    html: shell(
      'Hesabını silmek üzeresin',
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">Merhaba <strong>${esc(o.username)}</strong>,
       hesabını silmek için bir istek aldık.</p>
       <p style="margin:0 0 8px;font-size:13px;color:#6b6153">Onayladığında:</p>
       <ul style="margin:0 0 10px;padding-left:18px;font-size:13px;color:#6b6153;line-height:1.6">
         <li>tüm oturumların kapanır ve <strong>bir daha giriş yapamazsın</strong></li>
         <li>e-posta adresin, şifren ve bildirim aboneliklerin hesaptan silinir</li>
         <li><strong>şehirlerin adlarıyla birlikte dünyada kalır</strong>: saldırılabilir ve ganimet üretmeyi sürdürür</li>
         <li>oyuncu adın ve puanın da değişmez, sıralamalarda görünmeye devam eder</li>
         <li>aynı adresle yeniden kayıt olabilirsin ama <strong>eski oyuncu adını alamazsın</strong></li>
       </ul>
       <p style="margin:0;font-size:13px;color:#8a2b2b">Bağlantı <strong>12 saat</strong> geçerli
       ve yalnız <strong>bir kez</strong> kullanılabilir. Bu işlem <strong>geri alınamaz</strong>.</p>`,
      o.url, 'Hesabımı Sil',
    ),
  };
}

/**
 * ⭐ E-POSTA ADRESİ DEĞİŞTİ — **ESKİ** adrese gider (yeni adrese doğrulama maili gider).
 *
 * ⚠️ Yeni adres **maskelenmiyor**: bu mailin okuyucusu ya işlemi kendi yaptı (bilgiyi zaten
 * biliyor) ya da hesabı ele geçirilmiş; ikinci hâlde adresi görmek "nereye gitti" sorusunun
 * cevabı ve şikâyet için gerekli. Kısmi maskeleme ikisine de yaramaz.
 */
export function emailChanged(o: { username: string; newEmail: string }): Template {
  const text = [
    `Merhaba ${o.username},`,
    '',
    `MobilWar hesabının e-posta adresi ${o.newEmail} olarak değiştirildi.`,
    'Doğrulama bağlantısı yeni adrese gönderildi; doğrulanana kadar hesap kısıtlı çalışır.',
    '',
    'Bu işlemi SEN yapmadıysan hesabın ele geçirilmiş olabilir — hemen bizimle iletişime geç.',
  ].join('\n');

  return {
    subject: 'MobilWar — e-posta adresin değiştirildi',
    text,
    html: `<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1410">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:2px solid #cbbfa6;border-radius:8px;overflow:hidden">
    <div style="background:#1a1410;color:#e8dcc0;padding:14px 20px;font-size:18px;font-weight:600;letter-spacing:.5px">MobilWar</div>
    <div style="padding:20px">
      <h1 style="margin:0 0 12px;font-size:17px;color:#1a1410">E-posta adresin değiştirildi</h1>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5">Merhaba <strong>${esc(o.username)}</strong>,
       hesabının e-posta adresi <strong>${esc(o.newEmail)}</strong> olarak değiştirildi.</p>
      <p style="margin:0 0 10px;font-size:13px;color:#6b6153">Doğrulama bağlantısı yeni adrese
       gönderildi; doğrulanana kadar hesap kısıtlı çalışır.</p>
      <p style="margin:0;font-size:13px;color:#8a2b2b"><strong>Bu işlemi sen yapmadıysan</strong>
       hesabın ele geçirilmiş olabilir.</p>
    </div>
    <div style="border-top:1px solid #e3dac6;padding:12px 20px;font-size:11px;color:#8b8172">
      Bu bir bilgilendirme e-postasıdır; yanıtlamana gerek yok.
    </div>
  </div>
</div>`,
  };
}

export function resetPassword(o: { username: string; url: string }): Template {
  const text = [
    `Merhaba ${o.username},`,
    '',
    'MobilWar hesabın için şifre sıfırlama isteği aldık. Yeni şifreni belirlemek için:',
    o.url,
    '',
    `Bağlantı ${mailLimits().resetTtlMinutes} dakika geçerli ve yalnız BİR kez kullanılabilir.`,
    '',
    'Şifreni değiştirdiğinde açık olan tüm oturumların kapanır.',
    'Bu isteği sen yapmadıysan dikkate alma; şifren değişmez.',
  ].join('\n');

  return {
    subject: 'MobilWar — şifre sıfırlama',
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
