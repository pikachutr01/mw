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
import { INVALIDATES } from './realtime-topics.ts';
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
 * ⭐ Olay → sorgu eşlemesi **`realtime-topics.ts`te** (2026-08-16). Tablo saf olduğu için
 * ayrı dosyada duruyor ve kapsaması bir testle kilitleniyor; bu dosya soket kurduğu için
 * tablo burada kalsaydı sınanamazdı. Yeni bir sunucu olayı eklendiğinde önce oraya bakılmalı.
 */

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

/**
 * ⭐ Şu an ekranda AÇIK olan DM kanalı — yoksa `null` (kullanıcı, 2026-08-09).
 *
 * Tek kullanıcısı `Toaster`: aynı kişiyle konuşurken onun mesajının sol altta toast olarak da
 * belirmesi *"kullanıcı deneyimini kötü etkiliyor"*. Pencere açıksa toast bastırılır.
 *
 * ⚠️ Bu değişken **zaten vardı** ve zaten "pencere açık mı"nın istemcideki tek kaynağı:
 * `ChatWindow` bağlanınca `openChatChannel`, sökülünce `closeChatChannel` çağırıyor ve
 * yeniden bağlanmada odaya buradan dönülüyor. İkinci bir bayrak eklemek, bu oturumda
 * defalarca ısırılan "aynı kural iki yerde" hatasını yeniden üretirdi.
 *
 * ⚠️ **Fonksiyon, değer değil.** Modül seviyesinde bir sabit dışa aktarılsaydı içe aktaran
 * tarafta ilk değeri donardı; olay anında okunması gereken bir durum bu.
 */
export const currentChatChannel = (): number | null => openChatChannelId;

export function sendTyping(channelId: number): void {
  socket?.emit('chat:typing', { channelId });
}

/* ── İttifak sohbeti (§13.15c) ───────────────────────────────────────────────
 *
 * ⚠️ **AYRI değişken, DM'inkiyle paylaşılmıyor.** Sunucu tarafında da ayrı slot var
 * (`socket.data.allianceChatChannelId`): DM penceresi ve ittifak sheet'i aynı anda açık
 * olabilir, ortak bir slot biri diğerini odadan atardı.
 *
 * ⚠️ Mesaj olayı BU odadan geliyor (DM'de kişisel odadan geliyordu). Sheet kapanınca oda
 * terk ediliyor ve o andan itibaren hiçbir şey gelmiyor — "kapalıyken tam sessizlik"
 * bir bayrağa değil oda üyeliğine, yani yapıya bağlı. */
let openAllianceChannelId: number | null = null;

export function openAllianceChat(channelId: number): void {
  openAllianceChannelId = channelId;
  socket?.emit('alliance:chat:open', { channelId });
}

export function closeAllianceChat(): void {
  openAllianceChannelId = null;
  socket?.emit('alliance:chat:close');
}

/* ── Genel sohbet (§13.12) ───────────────────────────────────────────────────
 *
 * ⚠️ **ÜÇÜNCÜ değişken.** Sunucuda da üçüncü bir slot var
 * (`socket.data.globalChatChannelId`): oyuncu aynı anda bir DM penceresi, ittifak sheet'i ve
 * genel sohbet kartı açık tutabilir; ortak bir slot birini diğerinin odasından atardı. */
let openGlobalChannelId: number | null = null;

export function openGlobalChat(channelId: number): void {
  openGlobalChannelId = channelId;
  socket?.emit('global:chat:open', { channelId });
}

export function closeGlobalChat(): void {
  openGlobalChannelId = null;
  socket?.emit('global:chat:close');
}

/**
 * ⭐ Şu an BAĞLI olunan genel sohbet kanalı — yoksa `null`.
 *
 * Tek kullanıcısı `Toaster`: kullanıcı şartı *"sohbete ister mobil ister masaüstünde bağlı
 * olsun kendinden bahsetmelerde notify bildirim gelmesin; sadece sohbet bağlı değilse bu
 * bildirimler sağ alttan gelsin"*.
 *
 * ⚠️ **Fonksiyon, değer değil** (`currentChatChannel` ile aynı gerekçe): modül seviyesinde bir
 * sabit dışa aktarılsaydı içe aktaran tarafta ilk değeri donardı.
 */
export const currentGlobalChannel = (): number | null => openGlobalChannelId;

/** Yazıyor bildirimi — kanal kimliği taşımaz, sunucu soketin açık odasından çözer. */
export function sendGlobalTyping(): void {
  socket?.emit('global:chat:typing');
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
      /* ⚠️ `platform` de gönderiliyor: soket sahipliği aldığında `claim` platformu da yazıyor
       * ve o alan olmadan çakışma modalı «nerede açık» diyemiyor (`realtime.gateway.ts`). */
      auth: { token: session.accessToken, instanceId: instanceId(), platform: 'web' },
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
      /* ⚠️ İttifak sohbeti de yeniden katılmalı — bu satır olmadan bağlantı kopup dönünce
       * sheet açık görünür ama mesajlar SESSİZCE gelmez (DM'de aynı hata bir kez yapıldı). */
      if (openAllianceChannelId != null) {
        socket?.emit('alliance:chat:open', { channelId: openAllianceChannelId });
      }
      /* ⚠️ Genel sohbet de yeniden katılmalı — aksi hâlde kart «bağlı» görünür ama mesajlar
       * sessizce gelmez ve oyuncu sohbetin öldüğünü sanır. */
      if (openGlobalChannelId != null) {
        socket?.emit('global:chat:open', { channelId: openGlobalChannelId });
      }
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
        /* Sohbet sheet'indeki çevrimiçi noktaları da aynı kaynaktan besleniyor. */
        void queryClient.invalidateQueries({ queryKey: ['alliance-chat'] });
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
    /* ⭐ `global:chat:typing` ve `global:chat:presence` de abonelere dağıtılıyor: ikisi de
     * sorgu tazelemiyor (`INVALIDATES`'te yok), yalnız sohbet penceresinin şeridini ve
     * başlığındaki sayıyı besliyor. Sunucuda ikisi de DB'ye hiç inmiyor. */
    for (const topic of [
      'chat:message', 'chat:typing', 'notify:show',
      'global:chat:typing', 'global:chat:presence',
    ]) {
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
