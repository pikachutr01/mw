/*
 * ⭐ SERVICE WORKER — **BİLEREK ÇEVRİMDIŞI DESTEĞİ YOK** (kullanıcı kararı).
 *
 * MobilWar'da her ekran sunucu durumudur: kaynak birikimi, geri sayım, gelen ordu. Önbellekten
 * çizilen bir sayfa oyuncuya **yanlış** bir dünya gösterirdi ("gelen saldırı yok" derken saldırı
 * yolda olurdu) ve bu, oyunun kaybettirebilen bir yalanı olurdu. Bu yüzden burada hiçbir yanıt
 * saklanmıyor; SW yalnız iki iş yapıyor:
 *
 *   1. Uygulamanın **kurulabilir** olması (PWA ölçütü: manifest + fetch dinleyicisi olan bir SW).
 *   2. Yeni sürüm çıktığında eski SW'nin ortalıkta kalmaması (`skipWaiting` + `clients.claim`).
 *
 * `fetch` dinleyicisi isteğe DOKUNMAZ — yanıt ağdan gelir. Ağ yoksa istek başarısız olur ve
 * arayüzdeki çevrimdışı şeridi devreye girer (`OfflineBanner`), sahte bir "çalışıyor" görüntüsü
 * verilmez.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Geçmişte bir önbellek açılmışsa (ya da ileride yanlışlıkla açılırsa) burada temizlenir:
      // bayat kabuk, çevrimdışı desteği olmayan bir oyunda en sinsi hata kaynağıdır.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', () => {
  // Kasıtlı olarak boş: `respondWith` çağrılmadığında tarayıcı isteği normal şekilde ağa götürür.
});

/*
 * ⭐ WEB PUSH (§7.2) — yalnız oyuncu ÇEVRİMDIŞIYKEN buraya bir şey düşer. Uygulama açıkken
 * sunucu push atmaz, WS üzerinden toast gönderir (`NotifyService.deliver` tek dallanma noktası).
 *
 * ⚠️ Yukarıdaki "hiçbir yanıt önbelleğe alınmaz" kuralı burada da geçerli: bu dal ağa da
 * cache'e de dokunmaz, yalnız gelen yükü bildirime çevirir.
 */
self.addEventListener('push', (event) => {
  /** Yük bozuksa bile bildirim GÖSTERİLİR: bazı tarayıcılar sessiz push'u izin iptaliyle cezalandırır. */
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'MobilWar';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // `tag` aynı olanlar birikmez, ÜSTÜNE yazar: bir sohbetten üç mesaj = tek satır.
      tag: data.tag || 'mobilwar',
      renotify: true,
      /**
       * ⭐ `icon` ≠ `badge` — İKİSİ FARKLI DOSYA OLMALI (2026-08-03).
       *
       * `icon`  → bildirim gövdesindeki büyük görsel. Tam renkli, 192 px. Uygulama ikonu doğru.
       * `badge` → **Android durum çubuğu** simgesi. Tarayıcı burada rengi tamamen atar ve
       *           **yalnız alfa kanalını** maske olarak kullanır.
       *
       * ⚠️ İkisine de `/icon-192.png` veriliyordu: tam opak bir PNG'nin alfa maskesi dolu bir
       * karedir, dolayısıyla durum çubuğunda içi dolu bir leke çıkıyordu. Kullanıcının
       * bildirdiği "sıradan ikon" tam olarak buydu.
       *
       * ⚠️ `badge-96.png` **monokrom siluet + şeffaf zemin** olmalı; renkli ya da zeminli bir
       * görsel koyulursa hata aynen geri gelir. iOS/Safari `badge`i yok sayar ve uygulama
       * ikonunu kullanır → orada ek iş yok.
       *
       * ⚠️ **Kaynağı `public/badge.svg`** (kullanıcının seçtiği ikon). PNG ondan türetildi:
       * `currentColor` → `#ffffff`, 96×96 tuvale **%10 iç boşlukla** çizildi (tarayıcı rozeti
       * kendi maskesine oturtuyor, kenara dayanan şekil kırpılır). İkon değişirse PNG'yi
       * yeniden üretmek gerekir — SVG tek başına yeterli DEĞİL, `badge` alanı SVG'yi her
       * tarayıcıda kabul etmiyor.
       */
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url: data.url || '/armies' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/armies';

  /*
   * Açık bir sekme varsa YENİSİ AÇILMAZ, var olan öne getirilip oraya yönlendirilir. Aksi
   * hâlde oyuncu her bildirimde bir sekme daha biriktirir ve iki sekme aynı oyunu açık tutar.
   */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        return client.focus().then((focused) => focused.navigate(url).catch(() => focused));
      }
      return self.clients.openWindow(url);
    }),
  );
});
