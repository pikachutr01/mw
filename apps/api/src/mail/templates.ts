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

/* ═══ DESTEK / İLETİŞİM (2026-08-14) ════════════════════════════════════════ */

/** Çok satırlı kullanıcı metnini güvenli HTML'e çevirir. ⚠️ `esc` ÖNCE, `<br>` SONRA. */
const paragraph = (s: string): string =>
  `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;white-space:pre-wrap">${
    esc(s)}</p>`;

/**
 * ⭐ YÖNETİCİYE: yeni destek talebi. **Yalnız ilk açılışta** gider (kullanıcı kararı).
 *
 * ⚠️ Gövdenin yalnız ilk 400 karakteri: `alertTo` bir operasyon kutusu ve kopyanın en
 * korumasız durduğu yer. Ama önizlemesiz bir bildirim de yöneticiyi her talep için panele
 * sokardı — bu, ikisi arasındaki denge.
 * ⚠️ Ek **asla** maile konmaz; panelde yetkiyle iniyor.
 */
export function supportTicketOpened(o: {
  ticketId: number; subject: string; category: string; body: string;
  who: string; anonymous: boolean; adminUrl: string;
}): Template {
  const preview = o.body.length > 400 ? `${o.body.slice(0, 400)}…` : o.body;
  const kim = o.anonymous ? `${o.who} (ANONİM — giriş yapmamış)` : o.who;
  const text = [
    `Yeni destek talebi #${o.ticketId}`,
    '',
    `Kimden : ${kim}`,
    `Kategori: ${o.category}`,
    `Konu   : ${o.subject}`,
    '',
    preview,
    '',
    'Panelden yanıtla:',
    o.adminUrl,
  ].join('\n');

  return {
    subject: `MobilWar destek — #${o.ticketId} ${o.subject}`,
    text,
    html: shell(
      `Yeni destek talebi #${o.ticketId}`,
      `<p style="margin:0 0 10px;font-size:13px;color:#6b6153">
         <strong>Kimden:</strong> ${esc(kim)}<br>
         <strong>Kategori:</strong> ${esc(o.category)}<br>
         <strong>Konu:</strong> ${esc(o.subject)}</p>
       <div style="border-left:3px solid #cbbfa6;padding-left:12px;margin:12px 0">
         ${paragraph(preview)}
       </div>`,
      o.adminUrl, 'Panelde Aç',
    ),
  };
}

/**
 * ⭐ KULLANICIYA: "talebin alındı".
 *
 * ⚠️ Kullanıcı bu maili istememişti; **yine de gerekli** ve gerekçesi üç katmanlı:
 *  (a) Anonim kullanıcının takip bağlantısını taşıyan TEK araç — onsuz anonim tarafta
 *      "karşılıklı yazışma" şartı yarım kalırdı (yönetici yazar, kullanıcı yanıtlayamaz).
 *  (b) En ucuz spam önlemi: "ulaştı mı" belirsizliği aynı talebi üç kez açtıran şeydir.
 *  (c) Adresin gerçek olduğunu, yönetici cevabı YAZMADAN ÖNCE doğrular.
 */
export function supportTicketReceived(o: {
  ticketId: number; subject: string; url: string;
}): Template {
  const text = [
    `Destek talebin alındı (#${o.ticketId}).`,
    '',
    `Konu: ${o.subject}`,
    '',
    'Yönetim en kısa sürede yanıtlayacak; yanıt geldiğinde bu adrese bilgi maili göndereceğiz.',
    '',
    'Talebini görüntülemek ve yanıtlamak için:',
    o.url,
  ].join('\n');

  return {
    subject: `MobilWar destek — talebin alındı (#${o.ticketId})`,
    text,
    html: shell(
      'Destek talebin alındı',
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">Talebini aldık
         (<strong>#${o.ticketId}</strong>) ve yönetim en kısa sürede yanıtlayacak.</p>
       <p style="margin:0 0 10px;font-size:13px;color:#6b6153"><strong>Konu:</strong>
         ${esc(o.subject)}</p>
       <p style="margin:0;font-size:13px;color:#6b6153">Yanıt geldiğinde bu adrese bilgi maili
         göndereceğiz.</p>`,
      o.url, 'Talebimi Gör',
    ),
  };
}

/**
 * ⭐ KULLANICIYA: yönetici yanıtladı. **Her** yanıtta gider (kullanıcı şartı).
 *
 * ⚠️ **Yanıt gövdesi TAM gidiyor**, "girip bak" değil. Anonimde zaten mecburi (başka kanal
 * yok); kayıtlıda da aynısı, çünkü (1) ikinci bir varyant aynı davranışın iki uygulaması
 * demek, (2) "girmek için tıkla" kalıbı kullanıcıyı maildeki bağlantıya tıklamaya eğitir —
 * `passwordChanged`ın açıkça reddettiği oltalama kalıbı.
 * ⚠️ Telafisi yönetici tarafında: yazma kutusunda *"bu metin oyuncuya AYNEN e-posta ile
 * gidecek"* uyarısı var, yani kararı bilgiyle veriyor.
 */
export function supportTicketReplied(o: {
  ticketId: number; subject: string; body: string; url: string;
}): Template {
  const text = [
    `Destek talebine (#${o.ticketId}) yanıt verildi.`,
    '',
    `Konu: ${o.subject}`,
    '',
    '— Yönetim —',
    o.body,
    '',
    'Yanıtlamak için:',
    o.url,
  ].join('\n');

  return {
    subject: `MobilWar destek — talebine yanıt verildi (#${o.ticketId})`,
    text,
    html: shell(
      'Talebine yanıt verildi',
      `<p style="margin:0 0 10px;font-size:13px;color:#6b6153"><strong>Konu:</strong>
         ${esc(o.subject)}</p>
       <div style="border-left:3px solid #8a5a2b;padding-left:12px;margin:12px 0">
         <p style="margin:0 0 6px;font-size:12px;color:#8a5a2b;font-weight:600">Yönetim</p>
         ${paragraph(o.body)}
       </div>`,
      o.url, 'Talebi Aç ve Yanıtla',
    ),
  };
}

/**
 * ⭐ YÖNETİCİYE: günlük özet — **telafi edici kontrol**.
 *
 * ⚠️ Yönetici oyuncunun SONRAKİ yanıtları için mail almıyor (kullanıcı kararı: *"sadece ilk
 * açıldığında"*). Panel rozeti bunu telafi ediyor ama rozet yalnız panel açıkken çalışır;
 * tek kişilik bir operasyonda bir emniyet ağı gerekiyor. Günde en fazla bir kez.
 */
export function supportPendingDigest(o: {
  count: number; oldestHours: number; adminUrl: string;
}): Template {
  const text = [
    `${o.count} destek talebinde yanıtın bekleniyor.`,
    '',
    `En eskisi ${o.oldestHours} saattir bekliyor.`,
    '',
    'Panel:',
    o.adminUrl,
  ].join('\n');

  return {
    subject: `MobilWar destek — ${o.count} talep yanıt bekliyor`,
    text,
    html: shell(
      'Yanıt bekleyen destek talepleri',
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">
         <strong>${o.count}</strong> talepte yanıtın bekleniyor.</p>
       <p style="margin:0;font-size:13px;color:#6b6153">En eskisi
         <strong>${o.oldestHours} saattir</strong> bekliyor.</p>`,
      o.adminUrl, 'Destek Kuyruğunu Aç',
    ),
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
