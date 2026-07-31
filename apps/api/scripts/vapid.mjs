/**
 * VAPID anahtar çifti üretir (web push için).
 *
 *   node scripts/vapid.mjs
 *
 * Çıkan iki satır `mw/.env`'deki BOŞ duran `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=`
 * satırlarına yapıştırılır.
 *
 * ⚠️ Çift BİR KEZ üretilir ve bir daha DEĞİŞMEZ. Değişirse tarayıcılardaki tüm mevcut
 * abonelikler geçersiz olur ve her oyuncunun bildirim iznini yeniden vermesi gerekir.
 * Anahtarları yedekle; özel anahtar gizlidir, açık anahtar istemciye zaten servis edilir.
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

process.stdout.write(`
Aşağıdaki iki satırı mw/.env dosyasına yapıştır:

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}

VAPID_SUBJECT satırını da kendi adresinle güncelle (ör. mailto:sen@example.com).
Push servisleri sorun çıktığında bu adrese ulaşır.
`);
