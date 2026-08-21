/**
 * ⭐ SUNUCU OLAYI → TAZELENECEK SORGU ANAHTARLARI. Eşleme TEK yerde.
 *
 * ⚠️ Bu tablo **yoklama aralıklarının dayanağıdır** (`queries.ts`). Bir olay burada karşılıksız
 * kalırsa ekran ancak emniyet ağı yoklaması dönene kadar eski veriyi gösterir. Ve o ağ soket
 * BAĞLIYKEN 5 dakikaya kadar seyreliyor (`WS_IDLE_MS`) — yani eksik bir satırın bedeli
 * "biraz gecikme" değil, dakikalarca yalan söyleyen bir ekran.
 *
 * ⚠️⚠️ `useCatalog`ta **hiç yoklama yok** (`refetchInterval` verilmiyor, `staleTime` 5 dk):
 * o anahtarın tazelenmesi TAMAMEN bu tabloya bağlı. Katalogu unutan bir olay, ekranı
 * süresiz bayat bırakır.
 *
 * ⚠️ `realtime.ts`ten AYRI dosyada, çünkü projede tarayıcı testi altyapısı yok: `realtime.ts`
 * socket.io bağlantısı kuruyor ve içindeki tablo ancak bir soket ayağa kaldırılarak
 * sınanabilirdi. Saf tablo ayrı durunca kapsama bir testle kilitlenebiliyor
 * (`lib/world-coords.ts` · `lib/city-screens.ts` ile aynı gerekçe).
 */

/**
 * ⭐ SAVAŞIN DOKUNDUĞU HER SORGU (kullanıcı, 2026-08-16).
 *
 * Kullanıcının sorusu: *"Bir oyuncu şehrine saldırı yediği anda ekran açıksa … savaş sonrası
 * kalan ordu, savunma birimi hatta ganimet bilgisinin anlık olarak güncellenmesi gerekir.
 * Varsa kahraman durumu, mağara durumu, sur durumu gibi savaştan etkilenebilecek her sayfaya
 * anlık güncelleme atılmalı."*
 *
 * Denetimde üç anahtarın eksik olduğu çıktı; hepsi ayrı bir ekranı bayat bırakıyordu:
 *
 * | anahtar | savaşta ne değişiyor | eksikken ne oluyordu |
 * | :-- | :-- | :-- |
 * | `catalog` | Sur ve Büyü Kalkanı **seviyesi** (`defenses[].current`) | Savunma ekranı yıkılan suru ayakta gösteriyordu, üstelik **süresiz** (o anahtarın yoklaması yok) |
 * | `temple` | kahraman ölür, esir düşer, tecrübe kazanır | Tapınak ekranı ölü kahramanı diri gösteriyor, Dünya modalı onu sefere **seçtiriyordu** |
 * | `overview`| Komuta Merkezi'nin şehir başına ordu/savunma/kaynak dökümü | Toplamlar 5 dakikaya kadar savaş öncesini yazıyordu |
 *
 * ⚠️ `city` zaten vardı ve **çoğu şeyi o taşıyor**: kalan ordu, savunma birimleri, kasa
 * (ganimet sonrası), mağara durumu, sur onarım penceresi, kapasite. Eksikler onun taşımadığı
 * üç kalemdi — yani sorun "olay hiç gelmiyor" değil, "gelen olay yeterince geniş değil"di.
 *
 * ⚠️ `cities` **bilerek yok**: şehir ŞERİDİ ad/koordinat/başkent taşıyor ve savaş bunların
 * hiçbirini değiştirmiyor. Fetih yok (§oyun kuralları), şehir savaşla el değiştirmiyor.
 */
export const BATTLE_KEYS = [
  'messages', 'missions', 'city', 'catalog', 'temple', 'overview',
] as const;

export const INVALIDATES: Record<string, readonly string[]> = {
  'missions:changed': ['missions'],
  'city:changed': ['city', 'catalog', 'overview'],
  /**
   * ⭐⭐ ORDU EVE DÖNDÜ (kullanıcı, 2026-08-21): *"ordu şehre geri döndüğünde oyun açık
   * durumda olunca görevlerde anlık olarak kullanılabilir hâle gelmeli."*
   *
   * ⚠️⚠️ Bu satır 2026-08-21'e kadar YAZILAMIYORDU: sunucu olayı `missions:changed` konusuna
   * düzleştiriyordu, yani `city:army_returned` adı istemciye hiç ulaşmıyordu
   * (`realtime.bus.ts`). Bedeli tek bir ekranda görünüyordu ama tam da oyuncunun beklediği
   * yerde: dönen KAHRAMAN. `temple` tazelenmediği için Tapınak kahramanı hâlâ «görevde»
   * gösteriyor, sefer formu da onu seçtirmiyordu.
   *
   * ⚠️ `catalog` listede ÇÜNKÜ Baraka/Savunma ekranları birimlerin güncel adedini oradan
   * okuyor (`useCatalog` yoklama YAPMIYOR — o anahtar yalnız bu tabloyla tazeleniyor).
   * ⚠️ `missions` gereksiz görünebilir (`mission:completed` de yayınlanıyor) ama duruyor:
   * iki olayın sırası garanti değil ve bu tablonun kuralı «olayın değiştirdiği her şeyi
   * yaz», «başka bir olay nasılsa halleder» değil.
   */
  'city:army_returned': ['city', 'catalog', 'missions', 'temple', 'overview'],
  // Yeni şehir kurulması şehir ŞERİDİNİ de değiştirir; ⭐ o koordinata YOLDA olan şehir
  // kurma görevleri de yeni sahibe "gelen saldırı" olarak görünür hâle gelir → missions da tazelenir.
  'cities:changed': ['cities', 'city', 'world', 'missions'],
  // Posta kutusuna düşen her satır — okunmamış rozeti anında güncellensin.
  'messages:changed': ['messages'],
  /**
   * ⭐ Destek talebi (2026-08-14): açıldı · yanıtlandı · kapatıldı.
   * `support-thread` de listede çünkü modal AÇIKKEN gelen yanıt anında görünmeli — yalnız
   * listeyi tazelemek, açık yazışmayı bayat bırakırdı.
   */
  'support:changed': ['support', 'support-thread'],
  /** Savaş: dosya başındaki tabloya bak — kapsamı `BATTLE_KEYS` tutuyor. */
  'battle:resolved': BATTLE_KEYS,
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
  'alliance:changed': ['alliance', 'alliances', 'overview', 'world', 'rankings',
    /* ⭐ Susturma/üyelik değişimi sohbet sheet'inin yazma hakkını ve üye listesini etkiler. */
    'alliance-chat'],
  /**
   * ⭐ İTTİFAK SOHBETİ (§13.15c) — olay **KANAL ODASINDAN** geliyor.
   *
   * ⚠️ Sheet kapalıyken odaya katılmıyoruz (`alliance:chat:close`), dolayısıyla bu satır
   * kapalıyken HİÇ tetiklenmez — kullanıcı şartı "kapalıyken tam sessizlik" böyle sağlanıyor.
   * ⚠️ `alliance-chat` (üye listesi) BİLEREK tazelenmiyor: her mesajda roster çekmek
   * gereksiz trafik olurdu; liste zaten `alliance:changed` ile güncelleniyor.
   */
  'chat:alliance': ['alliance-chat-history'],
  /* Lider/konsey bir mesajı kaldırdı → geçmiş tazelenir, mesaj ekrandan düşer. */
  'chat:alliance:deleted': ['alliance-chat-history'],
  /**
   * ⭐ GENEL SOHBET (§13.12) — ittifak sohbetiyle aynı kalıp: olay **kanal odasından** geliyor.
   *
   * ⚠️ Odaya yalnız «Sohbete Bağlan» denince katılınıyor (`global:chat:open`), dolayısıyla
   * bağlantı kopukken bu satır HİÇ tetiklenmez — kullanıcı şartı *"bağlantıyı kopardığında
   * sohbet çevrimdışı"* böyle sağlanıyor: bir bayrakla değil, oda üyeliğiyle.
   * ⚠️ `global-chat` (açılış paketi) BİLEREK tazelenmiyor: her mesajda yazma hakkını yeniden
   * sormak gereksiz trafik olurdu.
   */
  'chat:global': ['global-chat-history'],
  /* Yönetici bir mesajı kaldırdı → geçmiş tazelenir, mesaj ekrandan düşer. */
  'chat:global:deleted': ['global-chat-history'],
  /* ⭐ ÖZEL MESAJ (2026-07-31): sohbet listesi + açık pencerenin geçmişi tazelenir. Olay gövde
   * taşımaz; balon metni tazelenen geçmişten gelir (tek doğru kaynak sunucu). */
  'chat:message': ['chat', 'chat-history'],
};
