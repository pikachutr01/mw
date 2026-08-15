/**
 * ⭐ DART'A ÜRETİLECEK ŞEMALAR — "sözleşme borcu defteri"nin ödenmiş tarafı.
 *
 * ⚠️ Bu liste **kademeli büyür**: bir ekran mobile taşınırken önce o ekranın yanıt şeması
 * `packages/contracts/src/responses/` altına yazılır, controller'ın dönüş tipi daraltılır,
 * sonra şema buraya eklenir. Yani port işi, sözleşme borcunu ödeyen zorlayıcı güçtür
 * (MOBIL_MIMARI.md §4).
 *
 * ⚠️ Anahtar = Dart sınıf adı. `PascalCase` ve şemanın TS tipiyle aynı olmalı — iki dilde iki
 * ayrı ad, tam olarak kaçındığımız sürüklenmenin kapısıdır.
 *
 * ⚠️ Buraya bir şema eklemek onu **yayın sözleşmesi** yapar: mobil mağazaya çıktıktan sonra
 * alan silmek/yeniden adlandırmak kırıcı değişikliktir (DAGITIM.md §6). Eklemeden önce şeklin
 * doğru olduğundan emin ol.
 */
import { citySummary, queueItem, worldSlot } from '../city.ts';
import type { Registry } from './emit.ts';

export const REGISTRY: Registry = {
  CitySummary: citySummary,
  QueueItem: queueItem,
  WorldSlot: worldSlot,
};
