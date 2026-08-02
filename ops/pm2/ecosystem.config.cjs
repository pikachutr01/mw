/**
 * ── MobilWar — PM2 uygulama tanımı ───────────────────────────────────────────
 * Sunucuda: /var/www/mobilwar/shared/ecosystem.config.cjs  (kaynak: mw/ops/pm2/)
 *
 * ⚠️ `.cjs` uzantısı ŞART: PM2 yapılandırmayı `require` ile okur, `.js` olsaydı depodaki
 * `"type": "module"` yüzünden ESM sanılıp patlardı.
 *
 * ⭐ NEDEN `interpreter` VERİLİYOR — bu sunucunun sistem Node'u **v20** ve onu iki CANLI
 * site kullanıyor (`scrabble-backend`, `typing-backend`). MobilWar `engines: >=22` istiyor.
 * Sistem Node'unu 22'ye yükseltmek o iki siteyi de habersiz taşırdı; onun yerine Node 22
 * `/opt/node22` altına AYRI kuruldu ve yalnız bu uygulama ona bakıyor. Diğer siteler
 * v20'de kalıyor — birbirinden tamamen bağımsız.
 */
module.exports = {
  apps: [
    {
      name: 'mobilwar',
      // `current` symlink'i üzerinden: sürüm değişiminde bu satır değişmiyor.
      script: '/var/www/mobilwar/current/api/dist/main.js',
      cwd: '/var/www/mobilwar/current/api',
      interpreter: '/opt/node22/bin/node',

      /**
       * ⭐ Tek süreç, `ROLE=all` (§4.0 küçük sunucu profili): api + worker aynı süreçte.
       * ⚠️ `ROLE=worker` diye ayırmak, push kararını çevrimiçilik bilgisinden koparır —
       * worker herkesi çevrimdışı sanar ve WS bağlıyken de bildirim gönderir.
       */
      instances: 1,
      exec_mode: 'fork',

      /**
       * 4 GB'lik kutuda Postgres ~768 MB, mevcut iki site ~790 MB kullanıyor. 512 MB heap
       * tavanı oyuna bol geliyor ve kaçak bir bellek artışında sistemi değil YALNIZ bu
       * süreci düşürüyor — PM2 onu saniyeler içinde geri kaldırır.
       */
      node_args: '--max-old-space-size=512',
      max_memory_restart: '700M',

      env: {
        NODE_ENV: 'production',
        // Sırlar burada DEĞİL: /etc/mobilwar/.env (chmod 600) → aşağıdaki --env-file.
      },

      /**
       * ⚠️ `node --env-file` PM2'nin `script`inden ÖNCE gelmeli; bu yüzden yorumlayıcıya
       * argüman olarak veriliyor. `.env`i PM2'nin kendi `env` alanına kopyalamak sırları
       * `pm2 describe` ve `~/.pm2/dump.pm2` çıktısına düşürürdü.
       */
      interpreter_args: '--env-file=/etc/mobilwar/.env --max-old-space-size=512',

      /**
       * ⭐ `main.ts` SIGTERM'i yakalayıp çalışan görev turunu bitiriyor, kilitleri bırakıyor
       * ve bağlantıları kapatıyor. 10 sn ona rahat yetiyor; bu süre dolmadan PM2 SIGKILL
       * göndermez, yani yarım kalan savaş çözümü olmaz.
       */
      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 15000,

      autorestart: true,
      // Açılışta DB henüz hazır değilse sonsuz döngüye girmesin.
      max_restarts: 10,
      restart_delay: 3000,

      merge_logs: true,
      time: true,
      out_file: '/var/www/mobilwar/shared/logs/out.log',
      error_file: '/var/www/mobilwar/shared/logs/err.log',
    },
  ],
};
