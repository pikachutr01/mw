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
import { chatConversation } from '../chat.ts';
import { citySummary, queueItem, worldSlot } from '../city.ts';
import type { Registry } from './emit.ts';

export const REGISTRY: Registry = {
  CitySummary: citySummary,
  QueueItem: queueItem,
  WorldSlot: worldSlot,
  /**
   * ⭐ SOHBET LİSTESİ SATIRI (2026-08-18) — mobile Sohbet taşınırken eklendi.
   *
   * ⚠️ Buraya girebilmesinin sebebi, servisin `ConversationRow`unun bu şemayla **birebir**
   * olması: `chat.service.ts` sekiz alanı da aynı adla döndürüyor. Yani şema gerçeğin
   * kopyası değil, gerçeğin kendisi.
   *
   * ⚠️ Kardeşi `chatMessage` BİLEREK eklenmedi: DM geçmişi ucu o şemanın alt kümesini
   * döndürüyor (`senderName` · `isPinned` · `deletedAt` YOK — bkz. `ConversationRow`un
   * yanındaki `MessageRow`). Şemayı üretmek, istemciye hiç gelmeyen üç alanı varmış gibi
   * göstermek olurdu; sahte kapı yerine o model elle yazıldı ve gerekçesi orada duruyor.
   */
  ChatConversation: chatConversation,
};
