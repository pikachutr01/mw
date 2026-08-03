/**
 * ⭐ GERÇEK ZAMANLI BAĞLANTI (socket.io).
 *
 * Kullanıcı kuralı: *"biri bize casus kuş gönderdiği ANDA görünmeli"*. Sunucu olayı yalnız
 * **haber** olarak yollar (`{topic, ref}`); veri taşımaz. İstemci ilgili sorguyu tazeler.
 * Böylece tek doğru kaynak HTTP uçları kalır — WS yükü ile DB'nin birbirinden kayma ihtimali yok.
 *
 * ⚠️ **Otomatik yeniden bağlanma zorunlu** (kullanıcı vurguladı): socket.io'nun kendi üstel
 * backoff'u açık. Bağlantı koptuğunda durum "çevrimdışı" değil **"bilinmiyor"** olur — kopan
 * bizim soketimizdir, karşı oyuncunun durumu hakkında bir şey söylemez.
 *
 * ⚠️ Kopukken kaçan olaylar: yeniden bağlanınca **her şey tazelenir**. Kaçırılan bildirim kalıcı
 * kayıtta (DB) zaten var; WS "hızlı" katman, "kayıpsız" katman değil (§1 outbox).
 */
import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { getSession, instanceId, onSessionChange, setSession } from './api.ts';
import { setConflict } from './session-conflict.ts';

export type ConnectionState = 'connecting' | 'online' | 'offline';

let socket: Socket | null = null;
let state: ConnectionState = 'connecting';
const stateListeners = new Set<(s: ConnectionState) => void>();

function setState(next: ConnectionState): void {
  if (state === next) return;
  state = next;
  for (const fn of stateListeners) fn(next);
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function onConnectionChange(fn: (s: ConnectionState) => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/**
 * ⭐ Bağlantı durumunu React'e bağlar — **yoklama aralığı buna göre belirleniyor**
 * (`queries.ts` → `useSafetyNet`).
 *
 * `getConnectionState` ve `onConnectionChange` modül düzeyinde kararlı referanslar olduğu
 * için `useSyncExternalStore` sözleşmesi (değişmeyen abone + değişmeyen anlık görüntü)
 * kendiliğinden sağlanıyor; `useSession` de aynı deseni kullanıyor.
 */
export const useConnection = (): ConnectionState =>
  useSyncExternalStore(onConnectionChange, getConnectionState, getConnectionState);

/**
 * Sunucu olayı → tazelenecek sorgu anahtarları. Eşleme TEK yerde.
 *
 * ⚠️ Bu tablo **yoklama aralıklarının dayanağıdır** (`queries.ts`). Bir olay burada karşılıksız
 * kalırsa ekran ancak emniyet ağı yoklaması dönene kadar (60 sn) eski veriyi gösterir. Yeni bir
 * sunucu olayı eklendiğinde önce buraya bakılmalı.
 */
const INVALIDATES: Record<string, string[]> = {
  'missions:changed': ['missions'],
  'city:changed': ['city', 'catalog', 'overview'],
  // Yeni şehir kurulması şehir ŞERİDİNİ de değiştirir; ⭐ o koordinata YOLDA olan şehir
  // kurma görevleri de yeni sahibe "gelen saldırı" olarak görünür hâle gelir → missions da tazelenir.
  'cities:changed': ['cities', 'city', 'world', 'missions'],
  // Posta kutusuna düşen her satır — okunmamış rozeti anında güncellensin.
  'messages:changed': ['messages'],
  // Savaş hem raporu hem orduyu hem şehri değiştirir.
  'battle:resolved': ['messages', 'missions', 'city'],
  // Sıralama günde 3 kez donuyor; donduğu an ekrandaki sıra bayatlamasın.
  'ranking:updated': ['rankings', 'overview', 'world'],
  // Askerî ünvan: kendi Genel Durum satırı + (ittifaktaysa) kendi satırındaki rozet.
  'merit:granted': ['overview', 'alliance'],
  /**
   * ⭐ BAKIM MODU (admin Faz 2) — perde bu olayla açılıp kapanır.
   *
   * ⚠️ Olay yükünü DOĞRUDAN kullanmıyoruz, sorguyu tazeliyoruz: perdenin metni tek bir
   * yerden (`/world/state`) gelsin. Yükten okusaydık ilk yüklemede sorgudan, değişimde
   * olaydan gelen iki metin ayrışabilirdi. `world` da tazeleniyor çünkü bakımdan çıkınca
   * diyar listesindeki geri sayımlar yeniden hesaplanmalı.
   */
  'world:maintenance': ['world-state', 'world'],
  /* ⭐ İTTİFAK (2026-07-30): üyelik/metin/ad/dağıtma — ittifak ekranı + sağ panel + ittifak
   * sütunlarını taşıyan görünümler tazelenir. */
  'alliance:changed': ['alliance', 'alliances', 'overview', 'world', 'rankings'],
  /* ⭐ ÖZEL MESAJ (2026-07-31): sohbet listesi + açık pencerenin geçmişi tazelenir. Olay gövde
   * taşımaz; balon metni tazelenen geçmişten gelir (tek doğru kaynak sunucu). */
  'chat:message': ['chat', 'chat-history'],
};

/* ── Sohbetin istemci→sunucu ucu (§13.12.3) ─────────────────────────────────────
 *
 * ⚠️ Socket örneği DIŞARI VERİLMEZ: token yenilendiğinde `start()` soketi komple yeniden
 * kuruyor ve `removeAllListeners()` çağırıyor. Bir bileşen referansı tutsaydı ölü sokete
 * emit etmeye devam ederdi. Bunun yerine dinleyiciler MODÜL seviyesinde tutulur ve her yeni
 * sokete yeniden bağlanır — `stateListeners` ile aynı desen.
 */
type Listener = (payload: Record<string, unknown>) => void;
const chatListeners = new Map<string, Set<Listener>>();
/** Açık sohbet kanalı — yeniden bağlanınca odaya YENİDEN katılmak için saklanır. */
let openChatChannelId: number | null = null;

export function onSocketEvent(topic: string, fn: Listener): () => void {
  const set = chatListeners.get(topic) ?? new Set<Listener>();
  set.add(fn);
  chatListeners.set(topic, set);
  return () => { set.delete(fn); };
}

/** Sohbet penceresi açıldı → kanal odasına katıl ("yazıyor…" bu odadan akar). */
export function openChatChannel(channelId: number): void {
  openChatChannelId = channelId;
  socket?.emit('chat:open', { channelId });
}

export function closeChatChannel(): void {
  openChatChannelId = null;
  socket?.emit('chat:close');
}

export function sendTyping(channelId: number): void {
  socket?.emit('chat:typing', { channelId });
}

export function connectRealtime(queryClient: QueryClient): () => void {
  const start = (): void => {
    const session = getSession();
    if (!session) { stop(); return; }

    stop();
    setState('connecting');

    socket = io({
      path: '/ws',
      /**
       * ⚠️ `instanceId` el sıkışmada gönderiliyor: tek cihaz kuralının sahipliğini asıl olarak
       * SOKET alıyor (bağlanınca sahiplen, kopunca bırak). HTTP tarafı yalnız kontrol ediyor —
       * yani tarayıcı kapanınca sahiplik saniyeler içinde serbest kalıyor, zaman aşımını
       * beklemek gerekmiyor.
       */
      auth: { token: session.accessToken, instanceId: instanceId() },
      transports: ['websocket', 'polling'],
      // Üstel backoff + jitter: sunucu yeniden başlarken tüm istemciler aynı anda vurmasın.
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
    });

    socket.on('connect', () => {
      setState('online');
      // Kopukken kaçan olaylar olabilir → bağlanır bağlanmaz her şeyi tazele.
      void queryClient.invalidateQueries();
      /* ⚠️ Tam yeniden bağlanmada socket.io odaları GERİ YÜKLEMEZ (yalnız kısa kesintide
       * `connectionStateRecovery` çalışır) → açık sohbet varsa odaya yeniden katıl, yoksa
       * "yazıyor…" sessizce ölür. */
      if (openChatChannelId != null) socket?.emit('chat:open', { channelId: openChatChannelId });
    });
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));

    /**
     * ⭐ OTURUM UZAKTAN KAPATILDI (§admin Faz 3) — oyuncu başka bir cihazından "bu cihazı çıkar"
     * dedi, ya da parola değişti.
     *
     * ⚠️ Bu olay olmasaydı da güvenlik sağlamdı (her HTTP isteği 401 alırdı) ama kullanıcı
     * deneyimi kötü olurdu: ekran açık kalır, soket sessizce kopar ve istemci bunu ağ arızası
     * sanıp **yeniden bağlanmayı denemeye devam ederdi**. Olay, kopmanın sebebini söylüyor:
     * yerel oturum hemen düşürülür, `App.tsx` giriş ekranına döner.
     */
    socket.on('session:revoked', () => {
      setSession(null);
      queryClient.clear();
    });

    /**
     * ⭐ DEVRALINDIK (tek cihaz kuralı) — başka bir cihaz «Bu cihazda devam et» dedi.
     *
     * ⚠️ Oturum DÜŞÜRÜLMÜYOR, `session:revoked`ın aksine. Jeton hâlâ geçerli; kaybettiğimiz
     * yalnız sahiplik. Oyuncu modaldaki düğmeyle oyunu buraya geri alabilmeli — çıkış
     * yaptırsaydık parolayı yeniden girmesi gerekirdi ve devralma "iki cihaz arasında gidip
     * gelme" değil "tek yönlü kapı" olurdu.
     */
    socket.on('session:takeover', () => {
      setConflict({ platform: null, seenAt: null, kind: 'takeover' });
    });

    /**
     * ⚠️ El sıkışma reddi tek cihaz kuralından geliyorsa modalı AÇ. Bunu `connect_error`
     * içinde ayırmak şart: aksi hâlde socket.io kopmayı ağ arızası sanıp sonsuz yeniden
     * bağlanma döngüsüne girerdi ve oyuncu neden oynayamadığını hiç öğrenemezdi.
     */
    socket.on('connect_error', (err: Error) => {
      if (err?.message === 'session_conflict') {
        setConflict({ platform: null, seenAt: null, kind: 'blocked' });
      }
    });

    for (const [topic, keys] of Object.entries(INVALIDATES)) {
      socket.on(topic, () => {
        for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
      });
    }

    /**
     * ⭐ ÇEVRİMİÇİLİK (2026-08-03) — **sunucu bunu aylardır yayıyordu, istemci hiç dinlemiyordu.**
     *
     * `realtime.gateway.ts` üç yerden `presence:update` gönderiyor (bağlanma/kopma ve ittifak
     * değişimi) ama `INVALIDATES` tablosunda karşılığı yoktu. Sonuç: sağ paneldeki Online/Offline
     * rozeti yalnız 60 saniyelik `['alliance']` yoklamasıyla değişiyordu. `Shell.tsx`'te
     * *"presence olayı geldikçe liste kendiliğinden tazelenir"* diye bir yorum vardı; **yanlıştı**.
     *
     * ⚠️ `INVALIDATES` tablosuna KONMADI, ayrı ele alınıyor: bu olay üye başına ve bağlantı
     * başına geliyor. Kalabalık bir ittifakta akşam saatlerinde saniyeler içinde onlarca
     * olay düşebilir; her biri ayrı bir `/alliance` isteği demek olurdu. **Debounce şart** —
     * rozet için 2 saniyelik gecikme fark edilmez, istek fırtınası edilir.
     */
    let presenceTimer: ReturnType<typeof setTimeout> | null = null;
    socket.on('presence:update', () => {
      if (presenceTimer) return;
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        void queryClient.invalidateQueries({ queryKey: ['alliance'] });
      }, 2000);
    });

    /**
     * Sohbet olayları ayrıca abonelere de dağıtılır (pencere balonu anında eklesin diye).
     *
     * ⚠️ Gateway olayı `{ topic, ref }` sarmalıyla yolluyor (`dispatch`), `chat:typing` ise
     * doğrudan düz nesne. Abone her iki şekli de aynı görsün diye `ref` burada AÇILIR —
     * bu kaçırıldığında balon düşüyor ama "okundu" işareti sessizce hiç tetiklenmiyordu.
     */
    /**
     * ⭐ `notify:show` — sohbetle AYNI kanaldan geçer ama sorgu TAZELEMEZ (`INVALIDATES`'te
     * yok): bu olay ekrandaki veriyi değil, oyuncuya gösterilecek toast'ı taşır. İlgili
     * sorgular zaten kendi olaylarıyla (`missions:changed`, `messages:changed`…) tazeleniyor.
     */
    for (const topic of ['chat:message', 'chat:typing', 'notify:show']) {
      socket.on(topic, (raw: Record<string, unknown>) => {
        const payload = (raw?.['ref'] ?? raw ?? {}) as Record<string, unknown>;
        for (const fn of chatListeners.get(topic) ?? []) fn(payload);
      });
    }
  };

  const stop = (): void => {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
  };

  start();
  // Token yenilenince (refresh döndürmeli) soket de yeni token'la kurulmalı.
  const off = onSessionChange(() => start());

  return () => { off(); stop(); };
}
