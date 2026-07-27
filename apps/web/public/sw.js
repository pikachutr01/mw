/*
 * ⭐ SERVICE WORKER — **BİLEREK ÇEVRİMDIŞI DESTEĞİ YOK** (kullanıcı kararı).
 *
 * Mobiwar'da her ekran sunucu durumudur: kaynak birikimi, geri sayım, gelen ordu. Önbellekten
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
