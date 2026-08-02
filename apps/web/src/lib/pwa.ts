/**
 * ⭐ UYGULAMAYI KURMA (PWA) — «Uygulamayı İndir» düğmesinin tüm mantığı.
 *
 * Oyun zaten kurulabilir bir PWA'dı: manifest eksiksiz (ad, `start_url`, `display: standalone`,
 * 192+512 `any` ve `maskable` simgeler), service worker `sw.js` kayıtlı. Eksik olan tek şey
 * kurulumu BAŞLATAN düğmeydi — tarayıcının kendi "yükle" ikonu adres çubuğunda saklı duruyor
 * ve oyuncuların çoğu onu hiç görmüyor.
 *
 * ⚠️ **`beforeinstallprompt` MODÜL DÜZEYİNDE yakalanır, React içinde değil.** Chrome bu olayı
 * sayfa yüklenir yüklenmez bir kez ateşler; bir bileşenin `useEffect`'ini beklersek olay çoktan
 * geçmiş olabilir ve **bir daha ateşlenmez** → düğme o oturumda hiç çıkmaz. Bu dosya `Shell`
 * tarafından içe aktarıldığı için `main.tsx`in `createRoot` çağrısından ÖNCE değerlendirilir.
 *
 * ⚠️ **`pnpm dev`de bu olay HİÇ ateşlenmez**, çünkü service worker yalnız üretim derlemesinde
 * kaydediliyor (`main.tsx`, HMR çakışması yüzünden bilerek). Yani düğmeyi denemek için
 * `pnpm --filter @mobilwar/web build && pnpm --filter @mobilwar/web preview` gerekir.
 * "Geliştirmede çıkmıyor" bir hata değil, tasarımın sonucudur.
 *
 * ⚠️ **iOS'un `beforeinstallprompt`u yok.** Safari'de kurulum yalnız elle yapılır (Paylaş →
 * Ana Ekrana Ekle), programla tetiklenemez. Orada düğme bir yönerge kutusu açar. Bu, iOS'ta
 * push bildiriminin ön koşulu olduğu için önemli: `push.ts` kurulmamış Safari'de `unsupported`
 * döner — yani iOS oyuncusu kurmadan hiç bildirim alamaz.
 */
import { useSyncExternalStore } from 'react';

/** Tarayıcının bize verdiği, saklayıp sonra tetiklediğimiz kurulum olayı. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Tarayıcı kurulumu üstlenebiliyor → düğme doğrudan kurulum akışını açar. */
  | 'installable'
  /** iOS/Safari → düğme elle ekleme yönergelerini gösterir. */
  | 'ios'
  /** Zaten kurulu (uygulama penceresinde çalışıyoruz) → düğme HİÇ çizilmez. */
  | 'installed'
  /** Kurulamıyor ya da henüz kurulabilir olduğu bilinmiyor → düğme çizilmez. */
  | 'unavailable';

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const emit = (): void => { for (const l of listeners) l(); };

/**
 * Uygulama penceresinde mi çalışıyoruz?
 * `display-mode: standalone` Chrome/Edge/Android'i, `navigator.standalone` iOS Safari'yi
 * karşılar — ikisi ayrı mekanizma, biri diğerinin yerine geçmiyor.
 */
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

/**
 * iOS mu? iPadOS 13+ kendini masaüstü Safari gibi tanıtır (`Macintosh`), bu yüzden
 * dokunma noktası sayısına da bakılır — Mac'te `maxTouchPoints` 0'dır.
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

function snapshot(): InstallState {
  if (isInstalled()) return 'installed';
  if (deferred != null) return 'installable';
  if (isIos()) return 'ios';
  return 'unavailable';
}

/* ⚠️ Modül yüklenir yüklenmez dinle — gerekçe dosya başındaki nottadır. */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    /* Varsayılan davranışı kes: yoksa Chrome kendi mini şeridini gösterir ve bizimki
       yanında ikinci bir davet olarak durur. */
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  /* Kurulum bitince düğme kaybolmalı; kullanıcı uygulamayı kurduktan sonra hâlâ
     "Uygulamayı İndir" görmek onu ikinci kez kurmaya çalıştırır. */
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  /* Uygulama penceresine geçiş `display-mode` sorgusunu değiştirir (kullanıcı kurup
     uygulamadan açtığında aynı sekme devam edebiliyor). */
  const mq = window.matchMedia?.('(display-mode: standalone)');
  mq?.addEventListener('change', cb);
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener('change', cb);
  };
}

/**
 * ⚠️ `snapshot` her çağrıldığında **aynı dizeyi** döndürmek zorunda (React'in
 * `useSyncExternalStore` sözleşmesi). Bu yüzden nesne değil düz bir birleşim tipi
 * döndürülüyor; `{ state, prompt }` nesnesi her render'da yeni referans olur ve
 * React sonsuz döngü uyarısı verirdi.
 */
const serverSnapshot = (): InstallState => 'unavailable';

export const useInstallState = (): InstallState =>
  useSyncExternalStore(subscribe, snapshot, serverSnapshot);

/**
 * Kurulum akışını başlatır. Sonuç ne olursa olsun olay **tüketilir**: tarayıcı aynı
 * `beforeinstallprompt` nesnesinin ikinci kez `prompt()` edilmesine izin vermiyor.
 * Reddedilirse Chrome bir süre sonra olayı yeniden ateşler, düğme o zaman geri gelir.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (e == null) return 'unavailable';
  deferred = null;
  emit();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  } catch {
    return 'dismissed';
  }
}

/*
 * ⭐ MAĞAZA BAĞLANTILARI (Play Store / App Store) — kullanıcı "şimdilik yalnız PWA" dedi.
 * Geldiğinde `InstallButton` içine, kurulum düğmesinin altına bir bağlantı listesi eklenir;
 * buradaki durum makinesine dokunmak GEREKMEZ: mağaza bağlantısı tarayıcının kurulum
 * yeteneğinden bağımsızdır, `'unavailable'` durumunda bile gösterilebilir. Boş bir sabit
 * bırakmıyorum — okunmayan bir dizi, sözü tutulmuş gibi görünen ölü koddur.
 */
