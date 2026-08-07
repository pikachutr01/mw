/**
 * ⭐ BİLDİRİM KATALOĞU — outbox satırı → İNSANIN OKUYACAĞI metin.
 *
 * `realtime.bus.ts`'teki `eventForOutbox`'ın kardeşi. O, aynı satıra bakıp *"istemci hangi
 * sorguyu tazelesin"* der; bu ise *"insana ne yazacağız"* der. İkisi bilerek ayrı:
 * bir olayın ekranı tazelemesi gerekir ama bildirim üretmesi gerekmeyebilir (ve tersi).
 *
 * ⭐ **TEK METİN KAYNAĞI.** Buradan çıkan dize hem WS toast'ında hem işletim sistemi push
 * bildiriminde görünür. İki ayrı yerde üretilseydi kaçınılmaz olarak birbirinden kayardı —
 * projenin "sefer süresi önizlemesi motorun AYNI travel.ts'ini çağırır" kuralının aynısı.
 *
 * ⚠️ Bir outbox satırı BİRDEN ÇOK bildirim üretebilir ve metinleri FARKLI olabilir: savaş
 * bittiğinde saldıran "Savaşı kazandın" görürken savunan "Savunmayı kaybettin" görür.
 * Bu yüzden dönüş tipi dizi.
 *
 * ══ 2026-08-07 · BİLDİRİM DÜZENİ (kullanıcı) ═══════════════════════════════════════════
 *
 * Kullanıcı canlı ortamdan bir kilit ekranı görüntüsü gönderdi:
 * *«Casus kuş geliyor! · 1:4:1'den · 100 Casus Kuş · birazdan»*. İki kural buradan çıktı:
 *
 * 1️⃣ **BİLDİRİM DETAY TAŞIMAZ.** Başlık *ne olduğunu*, gövde *hangi şehir + koordinat*
 *    olduğunu söyler; başka hiçbir şey. Birim dökümü Ordular ekranında zaten var, göreli
 *    süre ("birazdan", "15 dk sonra") bildirim okunduğunda çoktan yanlış, *"Rapor mesaj
 *    kutunda."* gibi dolgu cümleleri de hiçbir bilgi vermiyor. Bu yüzden `inWords()`
 *    yardımcısı **komple silindi** — kullanılmayan bir yardımcıyı bırakmak, bir sonraki
 *    bildirim tipinde kuralın sessizce delinmesi demekti.
 *
 * 2️⃣ **KALKIŞ UYARISI PUSH ATMAZ** (`push: false`). Saldırı/casusluk *başlatıldığı anda*
 *    hedefin telefonunu titretmek oyunun en temel gerilimini — **ani saldırı** — yok
 *    ediyordu. Savunan çevrimiçiyse toast'ı yine görür (uygulama zaten açık), çevrimdışıysa
 *    hiçbir şey gitmez ve orduyu varışta öğrenir. Sonuç bildirimi (kazandın/kaybettin)
 *    varışta push olarak gider — haber değeri orada.
 */
import { UNITS_BY_ID, BUILDINGS_BY_ID, TECHS_BY_ID } from '@mobilwar/catalog';

import { notifyLimits, type NotifyCategory } from './notify.limits.ts';

export interface Notification {
  /** Alıcı OYUNCU (hesap değil) — tercih ve çevrimiçilik bunun üzerinden çözülür. */
  playerId: number;
  worldId: number | null;
  category: NotifyCategory;
  title: string;
  body: string;
  /** Toast tıklaması ve push `notificationclick` AYNI adrese gider — tek davranış. */
  url: string;
  /**
   * Aynı `tag`li önceki bildirimi **değiştirir**, yanına eklemez. Örn. bir sohbetten arka arkaya
   * üç mesaj gelince bildirim merkezinde üç satır değil, güncellenen tek satır olur.
   */
  tag: string;
  /**
   * ⭐ `false` → çevrimdışı oyuncuya **PUSH GİTMEZ**, yalnız çevrimiçiyken toast görünür
   * (kullanıcı 2026-08-07; gerekçe dosya başındaki 2️⃣).
   *
   * ⚠️ Varsayılan `true`: yeni bir bildirim tipi eklenirken alan unutulursa push AÇIK kalır.
   * Ters varsayılan, sessizce kaybolan bildirimler üretirdi — hata olarak fark edilmesi çok
   * daha zor bir durum.
   */
  push?: boolean;
}

/* ── Küçük yardımcılar ──────────────────────────────────────────────────────── */

const nameOfItem = (id: string): string =>
  UNITS_BY_ID[id]?.name.tr ?? BUILDINGS_BY_ID[id]?.name.tr ?? TECHS_BY_ID[id]?.name.tr ?? id;

const n = (v: unknown): number | null => {
  const x = v == null ? NaN : Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

const tr = (x: number): string => x.toLocaleString('tr-TR');

/**
 * ⭐ BİLDİRİM GÖVDESİNİN TAMAMI: `{k,d,s,name?}` → `Çığlıktepe (1:45:7)`.
 *
 * Ad yoksa (boş koordinata şehir kurma — orası kimsenin değil) yalnız `3:7:2` yazılır;
 * koordinat da eksikse boş dize döner ve çağıran yedek cümlesine düşer.
 *
 * ⚠️ Adı **outbox yükünden** alıyoruz, okuma anında `cities`ten değil: raporlardaki `route`un
 * dondurulmasıyla aynı ilke (`report-route.ts`). Şehir sonradan yeniden adlandırılırsa
 * bildirim yine olayın olduğu andaki adı gösterir.
 */
const place = (v: unknown): string => {
  const c = v as { k?: unknown; d?: unknown; s?: unknown; name?: unknown } | null | undefined;
  if (c?.k == null || c.d == null || c.s == null) return '';
  const at = `${Number(c.k)}:${Number(c.d)}:${Number(c.s)}`;
  const name = c.name == null ? '' : String(c.name).trim();
  return name === '' ? at : `${name} (${at})`;
};

/** `{origin, target}` güzergâhının bir ucu → yer dizesi. Güzergâh yoksa boş dize. */
const placeOf = (route: unknown, end: 'origin' | 'target'): string => {
  const r = route as { origin?: unknown; target?: unknown } | null | undefined;
  return r == null ? '' : place(r[end]);
};

/** `{cuce: 3000, elf: 20}` → `3.000 Cüce · 20 Elf`; uzunsa "ve N tür daha". */
const unitList = (v: unknown, max = 3): string => {
  const raw = (v ?? {}) as Record<string, unknown>;
  const items = Object.entries(raw)
    .map(([id, count]) => [id, Number(count)] as const)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (items.length === 0) return '';
  const head = items.slice(0, max).map(([id, count]) => `${tr(count)} ${nameOfItem(id)}`);
  const rest = items.length - head.length;
  return rest > 0 ? `${head.join(' · ')} ve ${rest} tür daha` : head.join(' · ');
};

const clip = (s: string, max: number): string =>
  (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const note = (o: Notification): Notification => ({
  ...o,
  title: clip(o.title.trim(), notifyLimits().titleMax),
  body: clip(o.body.trim(), notifyLimits().bodyMax),
});

/**
 * ⭐ MESAJ KUTUSUNA DÜŞEN SATIRLARIN BİLDİRİMİ — `kind` · `side` · `outcome` üçlüsüne göre.
 *
 * Arama sırası: `kind:side:outcome` → `kind:side` → `kind`. Kullanıcının *"bu bildirim
 * türleri ileride genişletilebilir olsun"* şartının karşılığı bu tablo: yeni bir rapor tipi
 * ya da yeni bir taraf eklemek tek satır yazmak demek, katalogda yeni `case` açmak değil.
 *
 * `place` gövdeye güzergâhın **hangi ucunun** yazılacağını söyler:
 *  • casusluğu GÖNDEREN hedefi merak eder (`target`), casuslanan ise saldırganı (`origin`);
 *  • nakliyeyi ALAN nereden geldiğini merak eder (`origin`), gönderen nereye vardığını (`target`).
 * `body` yazılıysa güzergâh hiç okunmaz (ittifak satırlarında `route` zaten yok).
 *
 * ⚠️ `battle_report` BİLEREK yok — savaşın bildirimi `battle:resolved` üzerinden çok daha
 * zengin (kim kazandı) üretiliyor; ikisi de üretse oyuncu aynı savaş için İKİ bildirim alırdı.
 *
 * ⚠️ Casusluk önleme bildiriminde saldıranın şehir ADI yeni bir sızıntı DEĞİL: `writeMessage`
 * (`mission.handlers.ts`) `route`u **her** rapora koşulsuz yazıyor, yani savunan o adı bugün
 * de raporun güzergâh satırında görüyor.
 */
const REPORT_TEXT: Readonly<Record<string, {
  title: string;
  place?: 'origin' | 'target';
  body?: string;
  category?: NotifyCategory;
}>> = {
  /* ⚠️ Casusluk `attack` kategorisinde: Seçenekler'deki tek anahtar ("Savaş ve casusluk")
     hem gelen uyarıyı hem sonucu yönetiyor (kullanıcı kararı 2026-08-07). */
  'spy_report:spy': { title: 'Casusluk raporu', place: 'target', category: 'attack' },
  'spy_report:target': { title: 'Casusluk önleme raporu', place: 'origin', category: 'attack' },

  'transport_report:receiver': { title: 'Nakliye ulaştı', place: 'origin' },
  'transport_report:sender': { title: 'Nakliyen ulaştı', place: 'target' },
  'support_report:receiver': { title: 'Destek ulaştı', place: 'origin' },

  /* Aynı `kind`+`side`, iki farklı sonuç → `outcome` basamağının var olma sebebi. */
  'found_city_report:owner:ok': { title: 'Yeni şehir kuruldu', place: 'target' },
  'found_city_report:owner:fail': { title: 'Şehir kurulamadı', place: 'target' },

  /* Güzergâhsız satırlar — gövdeleri dolgu değil, oyuncuya YAPILACAK İŞİ söylüyor. */
  alliance_invite: { title: 'İttifak daveti', body: 'Mesaj kutunda Kabul / Red ile bekliyor.' },
  alliance_application: {
    title: 'İttifak başvurusu', body: 'Mesaj kutunda Kabul / Red ile bekliyor.',
  },
  alliance_message: { title: 'İttifak mesajı', body: 'İttifakından yeni bir duyuru var.' },
  system: { title: 'Bildirim', body: 'Mesaj kutunda yeni bir kayıt var.' },
};

/* ── Katalog ────────────────────────────────────────────────────────────────── */

export function notificationForOutbox(
  topic: string,
  payload: Record<string, unknown>,
  worldId: number | null,
): Notification[] {
  switch (topic) {
    /**
     * ⭐ KALKIŞ UYARISI — **push YOK** (`push: false`, gerekçe dosya başındaki 2️⃣).
     *
     * ⚠️ Yükte `units`, `heroCount` ve `arrivesAt` hâlâ duruyor ama METNE GİRMİYOR: gövde
     * yalnız savunanın hangi şehrinin hedef olduğunu yazar. Alanları yükten silmedik —
     * `realtime.bus.ts` aynı satırı okuyor ve outbox yükünü daraltmak sessiz bir kırılma
     * riski; katalogun onları okumaması yeterli.
     */
    case 'city:incoming_attack': {
      const to = n(payload['defenderPlayerId']);
      if (to == null) return [];
      return [note({
        playerId: to, worldId, category: 'attack',
        title: 'Saldırı geliyor!',
        // Yedek cümle: dağıtım sırasında yoldaki ESKİ satırlarda `targetCity` yok.
        body: place(payload['targetCity']) || 'Şehrine bir ordu yaklaşıyor.',
        url: '/armies',
        tag: `attack:${n(payload['missionId']) ?? to}`,
        push: false,
      })];
    }

    case 'city:incoming_spy': {
      const to = n(payload['defenderPlayerId']);
      if (to == null) return [];
      return [note({
        playerId: to, worldId, category: 'attack',
        title: 'Casus kuş geliyor!',
        body: place(payload['targetCity']) || 'Şehrine casus kuş yaklaşıyor.',
        url: '/armies',
        tag: `spy:${n(payload['missionId']) ?? to}`,
        push: false,
      })];
    }

    /**
     * ⭐ NAKLİYE KALKIŞI — kalkışta haber veren **tek** sefer tipi (kullanıcı 2026-08-07).
     *
     * Gerekçe kullanıcının kendi cümlesi: *"bunlar oyuncu için olumlu bilgiler"* — gelen mal
     * kimseyi gafil avlamıyor, dolayısıyla saldırıdaki push kısıtı burada anlamsız.
     *
     * ⚠️ Kapı TİP değil **ALICI** üzerinden: kendi şehrine nakliyede (`targetPlayerId ===
     * ownerPlayerId`) bildirim üretilmez — kimse kendi eylemini kendinden duymamalı
     * (`chat:dm`in "yalnız alıcıya" kuralının ikizi). Destek bugün yalnız kendi şehrine
     * gidebildiği için (`requireOwnTarget`) bu kural onu kendiliğinden eliyor; müttefik
     * desteği geldiğinde ise ayrıca kod yazmadan çalışmaya başlayacak.
     */
    case 'mission:sent': {
      if (String(payload['type'] ?? '') !== 'transport') return [];
      const to = n(payload['targetPlayerId']);
      if (to == null || to === n(payload['ownerPlayerId'])) return [];
      return [note({
        playerId: to, worldId, category: 'report',
        title: 'Sana nakliye yolda',
        body: place(payload['originCity']),
        url: '/armies',
        tag: `transport:${n(payload['missionId']) ?? to}`,
      })];
    }

    /**
     * ⚠️ Yalnız ALICIYA. `chat:dm` outbox satırı WS için iki tarafa da gidiyor (gönderenin
     * başka sekmesi senkronlansın diye) ama kimse kendi yazdığı mesajın bildirimini almamalı.
     */
    case 'chat:dm': {
      const to = n(payload['recipientId']);
      const from = n(payload['senderId']);
      if (to == null) return [];
      const name = String(payload['senderName'] ?? '').trim();
      return [note({
        playerId: to, worldId, category: 'dm',
        title: name === '' ? 'Yeni mesaj' : name,
        body: String(payload['preview'] ?? '').trim() || 'Sana bir mesaj gönderdi.',
        // Derin bağlantı: Mesajlar açılır ve sohbet penceresi bu oyuncuyla doğrudan gelir.
        url: from == null ? '/messages' : `/messages?dm=${from}`,
        tag: `dm:${n(payload['channelId']) ?? to}`,
      })];
    }

    /**
     * ⭐ İKİ ALICI, İKİ FARKLI METİN — dönüş tipinin dizi olmasının sebebi bu dal.
     * `winner` motorun `'attacker' | 'defender' | 'draw'` değeri (`engine/combat.ts`).
     *
     * ⭐ **SALDIRININ ASIL BİLDİRİMİ BURASI** (kullanıcı 2026-08-07): kalkışta susan sistem
     * varışta konuşur. Başlık kazanan/kaybeden, gövde ise güzergâhın oyuncuyu ilgilendiren
     * ucu — saldıran *"hangi şehre vurdum"*, savunan *"saldırı nereden geldi"* okur.
     *
     * ⚠️ Kategori `report` değil **`attack`**: oyuncu savaş sonuçlarını nakliye/ittifak
     * bildirimlerinden ayrı kapatabilsin (Seçenekler'deki "Savaş ve casusluk" anahtarı).
     */
    case 'battle:resolved': {
      const winner = String(payload['winner'] ?? '');
      const attacker = n(payload['attackerPlayerId']);
      const defender = n(payload['defenderPlayerId']);
      const battleId = n(payload['battleId']);
      const route = payload['route'];
      const tag = `battle:${battleId ?? 0}`;
      const out: Notification[] = [];
      if (attacker != null) {
        out.push(note({
          playerId: attacker, worldId, category: 'attack',
          title: winner === 'attacker' ? 'Savaşı kazandın'
            : winner === 'defender' ? 'Savaşı kaybettin' : 'Savaş berabere bitti',
          body: placeOf(route, 'target'),
          url: '/messages', tag,
        }));
      }
      if (defender != null) {
        out.push(note({
          playerId: defender, worldId, category: 'attack',
          title: winner === 'defender' ? 'Saldırıyı püskürttün'
            : winner === 'attacker' ? 'Savunmayı kaybettin' : 'Savaş berabere bitti',
          body: placeOf(route, 'origin'),
          url: '/messages', tag,
        }));
      }
      return out;
    }

    /**
     * ⭐ ASKERÎ ÜNVAN (§ünvanlar) — rozetin kazanıldığını söyleyen TEK anlık haber.
     *
     * ⚠️ Ayrı bir `tag` kullanılıyor (`merit:<tier>`), savaşınkiyle aynı değil: aynı savaş
     * hem "Savaşı kazandın" hem "Başkomutan oldun" üretiyor ve ikisi aynı etikete düşseydi
     * biri ötekini ezerdi (`renotify: true` ile aynı etiket tek bildirim demek).
     *
     * ⚠️ **Terfi olmayan yenilemede bildirim YOK.** Aynı ünvanı tekrar hak eden oyuncuya her
     * büyük savaşta "Subay oldun" demek gürültü olurdu; haber olan şey basamağın DEĞİŞMESİ.
     */
    case 'merit:granted': {
      const to = n(payload['playerId']);
      if (to == null || payload['promoted'] !== true) return [];
      const name = String(payload['name'] ?? 'Rütbe');
      return [note({
        playerId: to, worldId, category: 'report',
        title: `${name} oldun`,
        // Başlık unvanı zaten yazıyor; gövde tek cümlede ne olduğunu söyler (§sadelik).
        body: 'Askerî rütben yükseldi.',
        url: '/command', tag: `merit:${String(payload['tier'] ?? '')}`,
      })];
    }

    /**
     * ⭐ MAĞARADAN DÖNÜŞ (kullanıcı 2026-08-07) — mağarası yıkılan oyuncunun içerideki
     * ordusu şehre vardığında haber verilir. Öncesinde `cave.handlers.ts` yalnız
     * `city:changed` yazıyordu, yani ordu sessizce garnizona ekleniyordu.
     *
     * ⚠️ Kendi ordunun NORMAL dönüşü hâlâ bildirim üretmez (`city:army_returned`, aşağıdaki
     * varsayılan dal): oyuncu onu zaten bekliyor. Mağara dönüşü farklı — oyuncu o seferi
     * kendi başlatmadı, savaş başlattı.
     */
    case 'cave:returned': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      return [note({
        playerId: to, worldId, category: 'report',
        title: 'Ordun mağaradan döndü',
        body: place(payload['city']),
        url: '/barracks', tag: `cave:${n(payload['cityId']) ?? to}`,
      })];
    }

    /**
     * ⭐ İTTİFAK SOHBETİNDE BAHSEDİLME (§13.15c, kullanıcı şartı).
     *
     * ⚠️ **Yalnız `@` ile ANILANA gider.** Sıradan bir ittifak mesajı HİÇBİR bildirim
     * üretmez — kullanıcının "kapalıyken tam sessizlik" şartının bildirim tarafındaki
     * karşılığı bu. Kalabalık bir ittifakta her mesaja bildirim atmak kategoriyi kapattırırdı.
     *
     * ⚠️ Metinler kullanıcının verdiği şekilde SABİT: başlık «İttifak sohbeti», gövde
     * «Sohbette sizden bahsedildi.» Gönderenin adı BİLEREK yok (tarif böyle).
     *
     * ⚠️ `mentions` yükü **gönderen SÜZÜLMÜŞ** hâlde geliyor (`mentionRecipients`, serviste):
     * kimse kendi bahsetmesinin bildirimini almamalı — `chat:dm`in "yalnız alıcıya" kuralının
     * ikizi. Katalog saf bir eşleyici kalsın diye süzgeç burada DEĞİL.
     *
     * ⚠️ `tag` KANAL başına: art arda üç bahsetme, bildirim merkezinde üç satır değil
     * güncellenen tek satır olur (`renotify: true` sözleşmesi).
     */
    case 'chat:alliance': {
      const ids = Array.isArray(payload['mentions'])
        ? [...new Set((payload['mentions'] as unknown[]).map((x) => Number(x)))]
          .filter((x) => Number.isInteger(x) && x > 0)
        : [];
      const channelId = n(payload['channelId']);
      return ids.map((to) => note({
        playerId: to, worldId, category: 'mention',
        title: 'İttifak sohbeti',
        body: 'Sohbette sizden bahsedildi.',
        /* Derin bağlantı: İttifak sekmesi açılır ve sohbet kendiliğinden açılır (§13.15c). */
        url: '/command/alliance?chat=1',
        tag: `mention:${channelId ?? to}`,
      }));
    }

    /**
     * Mesaj kutusuna düşen satırlar — metin `REPORT_TEXT` tablosundan çözülür.
     * Savaş raporu orada bilerek yok (bildirimi `battle:resolved` üretti) → burada atlanır.
     */
    case 'message:written': {
      const to = n(payload['playerId']);
      const kind = String(payload['kind'] ?? '');
      if (to == null || kind === 'battle_report') return [];
      const side = payload['side'] == null ? '' : String(payload['side']);
      const outcome = payload['outcome'] == null ? '' : String(payload['outcome']);
      const t = REPORT_TEXT[`${kind}:${side}:${outcome}`]
        ?? REPORT_TEXT[`${kind}:${side}`]
        ?? REPORT_TEXT[kind];
      if (!t) return [];
      return [note({
        playerId: to, worldId,
        category: t.category ?? 'report',
        title: t.title,
        body: t.body ?? placeOf(payload['route'], t.place ?? 'target'),
        url: '/messages',
        tag: `msg:${kind}:${to}`,
      })];
    }

    case 'city:building_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const level = n(payload['level']);
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Yapı tamamlandı',
        body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
        url: '/buildings', tag: `prod:${to}`,
      })];
    }

    case 'player:tech_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const level = n(payload['level']);
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Araştırma tamamlandı',
        body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
        url: '/academy', tag: `prod:${to}`,
      })];
    }

    /**
     * ⚠️ `city:defense_finished` İKİ AYRI ŞEKİL taşır (`queue.handlers.ts`): savunma birimi
     * bandı `{produced}` yazar, Sur/Büyü Kalkanı yükseltmesi ise `{type, level}` yazar.
     * İkisi de buradan geçiyor; ayrım `produced`ın varlığında.
     *
     * ⚠️ Üretim gövdeleri **döküm taşımaya devam ediyor** ("120 Cüce · 30 Elf hazır.") ve bu
     * 1️⃣ kuralına aykırı değil: kullanıcı *"hangi tekniğin seviyesi, hangi yapının kaç
     * seviyeye çıktığı yazılabilir"* dedi. Kaldırılan şey KARŞI TARAFIN ordusunun dökümüydü.
     */
    case 'city:units_finished':
    case 'city:defense_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const isUnits = topic === 'city:units_finished';
      if (payload['produced'] == null) {
        const level = n(payload['level']);
        return [note({
          playerId: to, worldId, category: 'production',
          title: 'Yapı tamamlandı',
          body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
          url: '/defense', tag: `prod:${to}`,
        })];
      }
      const list = unitList(payload['produced']);
      if (list === '') return [];
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Üretim tamamlandı',
        body: `${list} hazır.`,
        url: isUnits ? '/barracks' : '/defense',
        tag: `prod:${to}`,
      })];
    }

    /**
     * Bildirim ÜRETMEYEN olaylar (ekranı tazeler ama insana haber değildir):
     * `mission:completed` · `mission:canceled` · `city:army_returned` · `city:changed` ·
     * `city:founded` · `alliance:changed` · `ranking:updated` · `echo:done`.
     * ⚠️ Kendi ordunun dönüşü için bildirim BİLEREK yok — oyuncu onu zaten bekliyor ve
     * her seferde bildirim atmak `production`dan bile gürültülü olurdu.
     * ⚠️ `mission:sent` artık bu listede DEĞİL: nakliyenin alıcısına kalkış bildirimi
     * üretiyor (yukarıdaki dal), diğer tiplerde yine sessiz.
     */
    default:
      return [];
  }
}
