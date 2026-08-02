/**
 * Uçtan uca duman testi — GERÇEK HTTP üzerinden tam oyun döngüsü.
 *
 * Vitest takımının yerine geçmez; onun ölçmediği şeyi ölçer: **controller + guard + zod + rota
 * katmanının gerçekten birbirine bağlı olduğunu**. Web arayüzü yazılırken "API mi bozuk, arayüz mü"
 * sorusunun ilk cevabı burasıdır.
 *
 * Kullanım (API ayakta olmalı):
 *   node apps/api/scripts/smoke.mjs [http://localhost:3099]
 *
 * ⛔ ÜRETİMDE ÇALIŞTIRILMAZ. Betik GERÇEK hesap açıyor, GERÇEK şehir kuruyor ve kayıt
 * doğrulama maili tetikliyor. 2026-08-02'de canlı sunucuda bir kez koşturuldu ve sonucu şu
 * oldu: üretim veritabanına iki test oyuncusu yazıldı ve `@smoke.local` gibi VAR OLMAYAN
 * adreslere Resend üzerinden iki mail gönderildi — ikisi de hard bounce, üstelik hesabın
 * ilk gönderimleri oldukları için bounce oranı bir anda %100 göründü. Veritabanı sıfırlandı
 * ama Resend'deki kayıt geri alınamıyor.
 *
 * Aşağıdaki kapı bu yüzden var; kaldırma. Denemek gerekiyorsa yerelde koştur.
 */
if (process.env['NODE_ENV'] === 'production') {
  console.error(
    '⛔ smoke.mjs üretimde çalıştırılamaz: gerçek hesap açar ve gerçek e-posta gönderir.\n'
    + '   Yerelde koştur. Gerçekten üretimde denemek şartsa NODE_ENV değerini geçici\n'
    + '   değiştirmek yerine ÖNCE bu satırların üstündeki açıklamayı oku.',
  );
  process.exit(1);
}

const BASE = process.argv[2] ?? 'http://localhost:3099';
const tag = Math.random().toString(36).slice(2, 6);

let failures = 0;
const ok = (cond, label, extra) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${cond ? '' : `  → ${JSON.stringify(extra)}`}`);
  if (!cond) failures++;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-device-id': `smoke-${tag}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

const register = (name) => call('POST', '/api/v1/auth/register', {
  body: {
    email: `${name}${tag}@smoke.local`,
    password: 'parola-12345',
    username: `${name}${tag}`,
    worldId: 1,
  },
});

async function main() {
  console.log(`\n▶ Duman testi — ${BASE}\n`);

  console.log('1. Sağlık');
  ok((await call('GET', '/healthz')).status === 200, 'GET /healthz 200');

  console.log('\n2. Kayıt (iki hesap)');
  const a = await register('alfa');
  const b = await register('beta');
  ok(a.status === 201 || a.status === 200, 'saldıran kayıt oldu', a.body);
  ok(b.status === 201 || b.status === 200, 'savunan kayıt oldu', b.body);
  const A = a.body?.accessToken;
  const B = b.body?.accessToken;
  if (!A || !B) { console.log('\n✗ Token alınamadı, devam edilemiyor.'); process.exit(1); }

  console.log('\n3. Yetkilendirme');
  ok((await call('GET', '/api/v1/cities')).status === 401, 'token\'sız istek 401');

  console.log('\n4. Şehirler');
  const aCities = await call('GET', '/api/v1/cities', { token: A });
  const bCities = await call('GET', '/api/v1/cities', { token: B });
  ok(aCities.body?.cities?.length === 1, 'saldıranın 1 başkenti var', aCities.body);
  const aCity = aCities.body.cities[0];
  const bCity = bCities.body.cities[0];
  ok(aCity.isCapital === true, 'şehir başkent olarak işaretli');

  const city = await call('GET', `/api/v1/cities/${aCity.id}`, { token: A });
  ok(city.body?.resources?.gold === 4000, 'başlangıç kesesi 4.000 altın', city.body?.resources);
  ok(city.body?.buildings?.castle === 1, 'Kale 1 ile başlıyor', city.body?.buildings);
  ok(city.body?.capacity?.castle?.total === 10, 'Kale bütçesi 10', city.body?.capacity);

  console.log('\n5. Sahiplik');
  const stolen = await call('GET', `/api/v1/cities/${bCity.id}`, { token: A });
  ok(stolen.status === 403, 'başkasının şehri 403', stolen.body);

  console.log('\n6. Katalog');
  const cat = await call('GET', `/api/v1/cities/${aCity.id}/catalog`, { token: A });
  ok(cat.body?.buildings?.length === 9, 'katalog 9 yapı döndü');
  const farm = cat.body.buildings.find((x) => x.id === 'farm');
  ok(farm?.nextCost?.gold > 0, 'Çiftlik 2 maliyeti sunucudan geliyor', farm);

  console.log('\n7. Kuyruk');
  const q = await call('POST', `/api/v1/cities/${aCity.id}/queues`, {
    token: A, body: { category: 'building', type: 'farm' },
  });
  ok(q.status === 201, 'Çiftlik kuyruğa girdi', q.body);
  ok(q.body?.targetLevel === 2, 'hedef seviye 2');
  const busy = await call('POST', `/api/v1/cities/${aCity.id}/queues`, {
    token: A, body: { category: 'building', type: 'mine' },
  });
  ok(busy.status === 409, 'aynı kategoride ikinci iş 409', busy.body);

  const afterSpend = await call('GET', `/api/v1/cities/${aCity.id}`, { token: A });
  ok(afterSpend.body.resources.gold < 4000, 'kaynak düştü', afterSpend.body.resources);
  ok(afterSpend.body.queues.length === 1, 'açık kuyruk listeleniyor');

  const cancel = await call('DELETE', `/api/v1/cities/queues/${q.body.id}`, { token: A });
  ok(cancel.status === 200, 'kuyruk iptal edildi', cancel.body);
  ok(cancel.body?.rule === 'timeProgress', 'yapı iadesi SÜREYE göre', cancel.body);

  console.log('\n8. Dünya ekranı');
  const w = await call('GET', `/api/v1/world/${aCity.coordinates.k}/${aCity.coordinates.d}`, { token: A });
  ok(w.body?.slots?.length === 10, 'diyar 10 şehir döndürüyor');
  const mine = w.body.slots.find((s) => s.city?.id === aCity.id);
  ok(mine?.city?.isOwn === true, 'kendi şehrim işaretli');
  ok(mine?.city?.protection === 'beginner', 'acemi koruması görünüyor', mine?.city);
  ok(!('units' in (mine?.city ?? {})), '⭐ asker sayısı GÖSTERİLMİYOR (§13.16.5)');

  console.log('\n9. Saldırı doğrulamaları');
  const noUnits = await call('POST', '/api/v1/missions/attack', {
    token: A,
    body: {
      type: 'attack', originCityId: aCity.id,
      target: bCity.coordinates, units: { dwarf: 5 },
    },
  });
  // Savunan acemi koruması altında → koruma hatası birim hatasından ÖNCE gelir.
  ok(noUnits.status === 403, 'korumalı oyuncuya saldırı 403', noUnits.body);
  ok(noUnits.body?.code === 'target_protected', 'hata kodu target_protected', noUnits.body);

  console.log('\n10. Görev ve mesaj listeleri');
  const missions = await call('GET', '/api/v1/missions', { token: A });
  ok(Array.isArray(missions.body?.movements), 'ordu hareketleri listesi var', missions.body);
  const msgs = await call('GET', '/api/v1/messages', { token: A });
  ok(typeof msgs.body?.unread === 'number', 'okunmamış sayacı var', msgs.body);

  console.log('\n11. Komuta Merkezi');
  const ov = await call('GET', '/api/v1/command/overview', { token: A });
  ok(typeof ov.body?.player?.score === 'number', 'genel durum puan döndürüyor', ov.body);
  ok(Array.isArray(ov.body?.cities) && ov.body.cities.length > 0, 'şehir tablosu dolu', ov.body);
  ok(Array.isArray(ov.body?.techs) && ov.body.techs[0]?.name, 'teknik adları TÜRKÇE geliyor', ov.body?.techs?.[0]);
  // ⭐ Puan harcamayla yazılıyor: 7. adımda Çiftlik yükseltmesi yapıldı (sonra iptal edildi),
  //    yani taban artmış olmalı. Sıfır dönerse puanlama hattı kopmuş demektir.
  ok(ov.body?.player?.toNextPoint <= 1000, 'sonraki puana kalan kaynak hesaplanıyor', ov.body?.player);

  const rank = await call('GET', '/api/v1/command/rankings?kind=player', { token: A });
  ok(Array.isArray(rank.body?.rows), 'oyuncu sıralaması listeleniyor', rank.body);
  ok(rank.body?.nextAt?.endsWith(':00:00.000Z'), 'sıradaki anlık görüntü tam saatte', rank.body?.nextAt);
  const ally = await call('GET', '/api/v1/command/rankings?kind=alliance', { token: A });
  ok(Array.isArray(ally.body?.rows), 'ittifak sıralaması şekil olarak doğru (boşsa unavailable dolu)', ally.body);

  console.log(`\n${failures === 0 ? '✅ Duman testi TEMİZ' : `❌ ${failures} kontrol başarısız`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
