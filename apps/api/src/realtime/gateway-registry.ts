/**
 * ⭐ GATEWAY KAYDI — socket.io gateway'i Nest DI'da DEĞİL, `main.ts`'te HTTP sunucusuna elle
 * takılıyor. İttifak tarafının iki ihtiyacı var: üye listesinde çevrimiçi rozeti (`isOnline`)
 * ve üyelik değişiminde soket odalarını senkonlamak (`setMembership`). Aynı süreçteki instance'a
 * bu küçük kayıt üzerinden ulaşılır; testlerde/worker rolünde `null` kalır ve her şey sessizce
 * "çevrimdışı / no-op" davranır (tek süreç profili — §4.0).
 */
import type { RealtimeGateway } from './realtime.gateway.ts';

let current: RealtimeGateway | null = null;

export function setGateway(g: RealtimeGateway | null): void {
  current = g;
}

export function getGateway(): RealtimeGateway | null {
  return current;
}
