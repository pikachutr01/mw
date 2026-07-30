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
import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { getSession, onSessionChange } from './api.ts';

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
  /* ⭐ İTTİFAK (2026-07-30): üyelik/metin/ad/dağıtma — ittifak ekranı + sağ panel + ittifak
   * sütunlarını taşıyan görünümler tazelenir. */
  'alliance:changed': ['alliance', 'alliances', 'overview', 'world', 'rankings'],
};

export function connectRealtime(queryClient: QueryClient): () => void {
  const start = (): void => {
    const session = getSession();
    if (!session) { stop(); return; }

    stop();
    setState('connecting');

    socket = io({
      path: '/ws',
      auth: { token: session.accessToken },
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
    });
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));

    for (const [topic, keys] of Object.entries(INVALIDATES)) {
      socket.on(topic, () => {
        for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
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
