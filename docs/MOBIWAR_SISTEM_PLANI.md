# MOBIWAR — SİSTEM PLANI (rebuild teknik temeli)

> ### ⭐ 2026-08-02 — ÜRÜN ADI: **MobilWar** (`mobilwar.com`)
> Bu belgenin **başlığı ve içindeki «Mobiwar» geçişleri BİLEREK KORUNDU**: burada anlatılan
> kaynak, tersine mühendislikle çözülen **orijinal J2ME oyunudur**. Yeniden yazılan ürünün
> adı ise **MobilWar** — kod, `@mobilwar/*` paketleri, `mobilwar` veritabanı, ekran metinleri
> ve mail şablonlarının hepsi o adı taşıyor. Bir cümleyi okurken hangisinden bahsedildiğini
> ayırmak için: **tasarım/ölçüm bağlamı → Mobiwar (kaynak) · çalışan sistem → MobilWar.**

> **Tarih:** 2026-07-25 · **Durum:** tasarım kararları + yol haritası. Kod başlamadan önce üzerinde
> anlaşılacak belge. Tamamlayıcılar: `MOBIWAR_MIMARI_RAPOR.md` (eski istemci analizi),
> `TEKNIK_MANTIK_RAPORU.md` (savaş motoru v0.6), `MOBIWAR_OYUN_VERISI.md` (katalog).

## 0.0 KULLANICI KARARLARI (2026-07-25) — bağlayıcı

1. **Çoklu dünya ilk günden.** Her tabloda `world_id`, tüm sorgular dünya-kapsamlı, tüm servisler
   dünya bağlamı alır. Tek dünya ile başlansa bile şema/kod hazır → beta veya ikinci dünya bedava.
2. **Hesap = e-posta + kullanıcı adı.** Kayıtta e-posta doğrulaması, argon2id, şifre sıfırlama akışı.
   Oyun içinde yalnız kullanıcı adı görünür ve **değiştirilemez** (orijinale sadık). E-posta; kurtarma,
   bildirim tercihleri ve web push için zorunlu altyapı.
3. **Barındırma = tek VPS + Docker Compose** (postgres, redis, api, worker, reverse proxy).
   Yedekleme: WAL arşivi ile PITR + günlük dump (off-site). Yatay ölçek gerektiğinde aynı imajlar
   çoklu makineye taşınabilecek şekilde yazılacak (worker zaten N kopya güvenli).

### Ek kararlar (2026-07-26, kullanıcı) — bağlayıcı

4. **Canlı sohbet üç kanalda:** İttifak sohbeti (yalnız üyeler) · Özel mesaj (oyuncudan oyuncuya) ·
   Genel Sohbet (beta/geliştirme geri bildirimi). Hepsi **WebSocket ile gerçek zamanlı**, arayüzde
   **bottom sheet** olarak açılır — **kendi rotaları yoktur**. Tasarım: §13.12.
5. **Gece/gündüz teması** hem web hem Flutter'da, **antik oyun renk paleti** ile ve **tek kaynaktan**
   yönetilen tasarım token'ları üzerinden. Tasarım: §13.13.
6. **Adlandırma:** dosya adları, URL yolları, kod/DB/config tanımlayıcıları **İngilizce**;
   **açıklamalar (yorumlar) ve dokümanlar Türkçe**; kullanıcıya görünen metinler i18n dosyasında.
   Sözleşme: §13.14. (Bu karar §13.7 config anahtarlarını ve katalog `id`'lerini İngilizceye çevirir.)
7. **Savunma tabanı:** her savunma birimi tipinden savaş sonrası **en az 4 tanesi kalır** (savaş
   öncesi adedi 4'ü geçmişse). Her şehir küçük ordulara karşı asgari savunma şansını kalıcı korur;
   4 okçu kulesi casus kuşlarını vurma şansını da kalıcı kılar. Tasarım: §13.11.10.
8. **Ganimet açıklığa kavuştu:** saldıran kazandıysa **önce ölen ordunun enkazı**, **kalan taşıma
   kapasitesi kadar da şehrin kaynağından yağma** (%40 × yoksulluk sönümlemesi) alınır — kapasite
   yetmiyorsa kısmi alınır. §13.10.4 yeniden yazıldı; "yağma şartı" açık sorusu **kapandı**.
9. **Dünya yalıtımı mutlaktır.** Genel Sohbet, DM ve ittifak sohbeti **her dünyada ayrıdır**;
   dünyalar arasında ortak olan **yalnız `accounts`** (e-posta, parola, tema/dil tercihi, push aboneliği).
   Oyuncu kimliği, sohbeti, mesajı, sıralaması dünya-kapsamlıdır. Kural: §13.12.1b.
10. **DM için acemi kısıtı:** yeni oyuncu ilk **12 saat** özel mesaj **başlatamaz** (spam/çok-hesap
    kalkanı). §13.12.4.
11. **Başlangıç kaynağı:** yeni başkent **4.000 altın + 4.000 yemek** ile başlar — cömert değil,
    ilk günü dolu dolu geçirtip 2. günde orduya geçirten miktar. Gerekçe ve tablo: §13.11.1a.
12. **İttifak kurma ön-şartı: Kale ≥ 5.** Şart listesi veri olarak tutulur, ileride başka koşullar
    eklenebilir. §13.15.

Önceki bağlayıcı kararlar (`MOBIWAR_MIMARI_RAPOR.md` §0.1): savaş motoru yalnız sunucuda · dahili
simülatör aynı motordan · savaş animasyonu yok · motor izole/versiyonlu/test-korumalı · backend
NestJS+TS · MVP ince dikey dilim.

## 0. Ürünün doğası (tasarımı belirleyen 5 gerçek)

1. **Sunucu-otoriter, istemci ince.** Orijinal de böyleydi; hile yüzeyi sıfıra yakın olmalı.
2. **Oyun asenkron ve uzun soluklu.** Aksiyonlar saniyeler değil **dakikalar/saatler** sürer. Yüksek
   frekanslı tick'e gerek YOK; gereken şey **kesin zamanlı, kaçırılmayan olaylar**.
3. **Olaylar iki oyuncuyu birden ilgilendirir.** Saldırı, saldıranı da savunanı da değiştirir → olay
   "kimin oturumu"na bağlanamaz.
4. **Zamanlama oyunun kendisidir.** Oyuncular saldırıyı saniyesine göre planlar (gece savaşı, eş zamanlı
   dalga). Bu yüzden zaman otoritesi ve sıra (ordering) garantisi kritik.
5. **Motor sürekli değişecek.** Savaş motoru canlıda güncellenecek → her savaş, hangi motor sürümü ve
   hangi girdiyle çözüldüğünü **saklamalı ve yeniden oynatılabilmeli**.

---

## 1. ⭐ ÇEKİRDEK KARAR: Zamanlanmış olaylar nasıl çalışır?

**Sorunun cevabı: sunucu-otoriter zamanlayıcı (scheduler). "Oyuncu girince tetiklenir" modeli REDDEDİLDİ.**

### Neden lazy (girişte tetikleme) modeli olmaz
- Saldırı **iki** oyuncuyu etkiler; hangisi önce girerse ona göre mi çalışacak? → belirsizlik.
- **Sıra** bozulur: t1'de saldırı, t2'de destek geliyorsa, t2 önce işlenirse savaş yanlış orduyla çözülür.
- Bildirim zamanında gitmez ("2 saat önce şehrin yandı, yeni haber veriyoruz").
- Sıralama/puanlama/istatistik tutarsız olur; ittifak üyeleri "gerçekleşmemiş" savaşı göremez.

### Uygulanacak model: **Postgres tabanlı görev kuyruğu + ayrı worker süreci**

```
mission (görev)  ──► scheduler döngüsü ──► handler (transaction) ──► sonuç + outbox
   execute_at         due olanları              engine çağrısı          rapor/WS/push
   status             SKIP LOCKED ile           state mutasyonu
   idempotency_key    kilitler
```

**Akış (saldırı örneği):**
1. Oyuncu "Saldır" der → API **doğrular** (ordu var mı, limit dolmuş mu, tatil modu, 24s/3 saldırı kuralı),
   birlikleri şehirden **düşer** (rezerve eder), `mission` satırı yazar: `type=attack`,
   `execute_at = now + travel_time`, `payload = {units, hero_ids, resources}`.
   → Bu tek bir DB transaction'ı. Ordu artık şehirde değil, "yolda".
2. Worker her saniye `SELECT ... WHERE status='scheduled' AND execute_at <= game_now()
   ORDER BY execute_at, id FOR UPDATE SKIP LOCKED LIMIT n` ile hazır görevleri **kilitleyip** alır.
3. Handler transaction içinde: hedef şehri `pg_advisory_xact_lock(city_id)` ile kilitler (aynı şehre
   aynı anda düşen görevler seri hâle gelir), savunanın anlık durumunu okur, **engine**'i çağırır,
   sonucu `battles`'a yazar, kayıpları uygular, ganimeti dönüş görevine bağlar (`mission type=return`),
   **outbox**'a 2 rapor + 2 bildirim satırı ekler, görevi `done` yapar.
4. **Dispatcher** outbox'ı okur: oyuncu online ise WebSocket, değilse Web Push / FCM. Rapor her hâlükârda
   DB'de (`messages`) — bildirim gitmese bile oyuncu girince görür.

**Bu neden güvenli:**
- **Idempotency:** `battles.mission_id` UNIQUE + `mission.status` geçişi aynı transaction'da → süreç
  ortasında ölürse yeniden denendiğinde çifte savaş olmaz.
- **At-least-once + idempotent = exactly-once etkisi.** Outbox sayesinde "savaş oldu ama rapor gitmedi"
  durumu imkânsız (ikisi aynı transaction).
- **Kaçırılan görev diye bir şey yok:** worker 3 saat kapalı kalsa bile açıldığında birikmiş görevleri
  `execute_at` sırasıyla işler (catch-up). Sıra korunur.
- **Ölçeklenir:** SKIP LOCKED sayesinde N worker aynı anda çalışabilir, çakışmaz.

**Neden Redis/BullMQ değil (şimdilik):** görev = oyuncunun ekranında gördüğü **oyun varlığı** ("Ordular"
ekranı). Kuyruk Redis'te, ordu Postgres'te olursa split-brain riski doğar. Postgres tek doğruluk kaynağı;
Redis yalnız presence/pub-sub/rate-limit için. Ölçek gerekirse ileride BullMQ *önbellek* katmanı eklenir.

**Kesinlik:** görev süreleri dakika/saat mertebesinde; 1 sn'lik poll + "en yakın deadline'a uyanma"
yeterli (±1 sn). Sniping için tutarlılık yeterlidir, mikro-saniye değil.

**Sıra kuralı (deterministik):** aynı şehre aynı anda düşen görevler `(execute_at, id)` sırasıyla,
şehir advisory lock'u altında işlenir. Böylece "önce destek mi geldi, önce saldırı mı düştü" her zaman
tekrarlanabilir bir cevaba sahiptir.

### Görev tipleri (hepsi aynı çatı)
`attack · support · transport · spy · found_city · teleport · return · building_finish · unit_batch_finish
· tech_finish · hero_revive · cave_load/unload · wall_repair · vacation_end`

---

## 2. ⭐ OYUN SAATİ ve BAKIM MODU (kritik gereksinim)

**Karar: mantıksal oyun saati.** Gerçek zaman değil, `game_now()` otoritedir:

```
game_now() = now() - world.clock_offset          -- clock_offset = toplam duraklama süresi
```

Tüm `execute_at`, `finish_at`, kaynak birikimi zaman damgaları **oyun saatinde** tutulur.

**Bakıma alma:** `world.state = 'maintenance'`, `paused_at = now()`.
- Scheduler yeni görev **almaz**, çalışan görevi bitirir (graceful drain).
- API mutasyonları 503 + sebep döner; okuma serbest (istersen tamamen kapalı).
- WS üzerinden tüm istemcilere `world:maintenance` yayını → arayüzde bant + geri sayım.

**Bakımdan çıkma:** `clock_offset += now() - paused_at`, `state='running'`.
- **Hiçbir satır güncellenmez.** Tüm geri sayımlar duraklamanın süresi kadar otomatik ötelenir; 4 saat
  kalan saldırı yine 4 saat kalır. Bu, "devam eden savaşlar korunsun" gereksinimini **yapısal olarak**
  çözer — özel bir kurtarma koduna gerek kalmaz.
- Kaynak üretimi de oyun saatiyle hesaplandığı için bakım süresince kaynak birikmez (adil).

**Ek koruma katmanları:**
- `PANIC_FREEZE` bayrağı: yalnız mutasyonları durdurur (okuma + WS açık), acil bug durumunda tek komutla.
- Her görevde `attempts` + `last_error`; 3 denemede başarısız → `dead_letter` + alarm; oyun durmaz.
- Worker `SIGTERM` alınca: yeni görev alma, çalışanı bitir, kilitleri bırak, çık.
- Deploy sırası: **worker'ı durdur → migration → API deploy → worker başlat**. (Görevler DB'de beklediği
  için kayıp yok.)

---

## 3. Kaynaklar: tick YOK, tembel birikim (lazy accrual)

Altın/yemek her saniye güncellenmez. `cities` tablosunda `gold, food, resources_at` tutulur:
```
current = min(cap, stored + rate_per_hour * (game_now() - resources_at) / 3600)
```
Her okuma/yazmada materialize edilir (tek yardımcı fonksiyon: `materializeCity(cityId, tx)`).
Milyonlarca satırı tick'lemek yerine O(1) hesap → sunucu yükü neredeyse sıfır, ölçek sorunsuz.
Bina/teknik/üretim bitişleri ise **görev** olarak zamanlanır (bildirim ve ön-şart doğruluğu için).

---

## 4. Veri tabanı

**PostgreSQL 16** (tek doğruluk kaynağı) + **Redis** (oturum/presence, WS pub-sub fan-out, rate limit).
Gerekçe: oyun yoğun ilişkisel, transaction şart (kaynak düşme + görev yazma atomik olmalı), `SKIP LOCKED`
görev kuyruğu için ideal, `JSONB` savaş raporu/anlık görüntü için yeterli. NoSQL bu iş için yanlış araç.

### Şema (çekirdek — `world_id` ilk günden itibaren her tabloda)
```sql
worlds(id, name, state, clock_offset_ms, speed_multiplier, started_at)
players(id, world_id, username UNIQUE, email, password_hash, is_premium, vacation_until,
        score, banned_at, created_at, last_seen_at)
cities(id, world_id, player_id, name, k, d, s,        -- koordinat: kıta:diyar:şehir
       is_capital, gold, food, resources_at, area_used)
buildings(city_id, type, level)                        -- PK(city_id,type)
units(city_id, type, count)                            -- barakadaki hazır birlikler
cave_units(city_id, type, count)                       -- mağaradakiler (savaşa girmez)
defenses(city_id, type, count)                         -- okçu/tuzak/... ; sur & kalkan seviye
wall(city_id, level, integrity)                        -- savaş sonrası onarım görevi ile geri döner
techs(player_id, type, level)                          -- oyuncu-genel
heroes(id, player_id, city_id, name, level, xp, f_atk, f_def, m_atk, m_def,
       status, revive_until, destroyed_at)   -- status: alive|dead|reviving|destroyed
queues(id, city_id, category, item_type, count, started_at, finish_at, spent_gold, spent_food)
missions(id, world_id, type, status, owner_player_id, origin_city_id,
         target_city_id, target_k, target_d, target_s,
         execute_at, created_at, locked_by, locked_at, attempts, last_error,
         idempotency_key UNIQUE, payload JSONB)
mission_units(mission_id, unit_type, count)
battles(id, world_id, mission_id UNIQUE, attacker_id, defender_id, city_id,
        engine_version, rng_seed, input JSONB, result JSONB, created_at)
messages(id, world_id, player_id, kind, subject, body JSONB, read_at, created_at)  -- rapor/sistem
chat_channels(id, world_id, kind, alliance_id, dm_key, slow_mode_s, created_at)   -- §13.12
chat_participants(channel_id, player_id, last_read_message_id, muted_until, notify, joined_at)
chat_messages(id, channel_id, world_id, sender_id, body, created_at, deleted_at, deleted_by)
chat_bans(id, world_id, player_id, scope, until, reason, created_by)
outbox(id, topic, payload JSONB, created_at, dispatched_at, attempts)
audit_log(id, world_id, player_id, action, entity, before JSONB, after JSONB, at, ip, trace_id)
alliances / alliance_members / rankings_snapshot / push_subscriptions / login_sessions
```
**Kritik indeksler:** `missions(status, execute_at)`, `missions(target_city_id, execute_at)`,
`cities(world_id, k, d, s)` UNIQUE, `messages(player_id, created_at DESC)`, `outbox(dispatched_at NULL)`,
`chat_messages(channel_id, id DESC)`, `chat_channels(world_id, dm_key)` UNIQUE.

> **Not — `messages` ≠ `chat_*`:** `messages` yalnız **rapor ve sistem bildirimi** kutusudur
> (savaş/casus/nakliye raporları). Oyuncular arası yazışma tamamen `chat_*` tablolarında yaşar;
> eski oyunun ilkel "özel mesaj" kutusu artık **DM kanalı** olarak sohbet sistemine taşındı (§13.12).

**Neden `battles.input` + `rng_seed` + `engine_version`:** her savaş **birebir yeniden oynatılabilir**.
Motor güncellendiğinde eski savaşlar bozulmaz; şikâyet/hata durumunda "o savaş neden böyle bitti"
sorusuna kanıtla cevap verilir; regresyon testleri gerçek savaşlardan üretilebilir.

---

## 5. Motor: determinizm + versiyonlama (kod başlamadan alınacak karar)

- `Math.random()` motordan **çıkarılacak**; yerine enjekte edilen **seed'li PRNG** (mulberry32/xorshift).
  Savaş çözümünde seed = `hash(mission_id)` → aynı savaş her yeniden oynatmada aynı sonucu verir.
  Bu, v0.6'da eklediğimiz tüm rastgeleliği (tuzak, onarım, jitter) **denetlenebilir** kılar.
- `engine.version` sabiti + `catalog.hash` her savaşa yazılır.
- Motor paketi (`packages/engine`) saf/yan-etkisiz kalır: girdi → çıktı. DB, zaman, IO bilmez.
- Simülatör (`POST /simulate`) aynı motoru çağırır, seed'i isteğe bağlı verir → "aynı savaşı 20 kez
  çevir, dağılımı gör" özelliği doğal olarak gelir.

---

## 6. Servis topolojisi (monorepo)

```
mobiwar/
├─ packages/
│  ├─ engine/        # savaş motoru (saf TS, seed'li RNG, sürümlü) + testler
│  ├─ economy/       # maliyet/süre/üretim formülleri (k.java §5) + testler
│  ├─ catalog/       # birim/yapı/teknik verisi (JSON + tipler + hash)
│  └─ contracts/     # zod şemaları → REST/WS DTO'ları, istemci+sunucu ORTAK
├─ apps/
│  ├─ api/           # NestJS: REST + WS gateway (stateless, N kopya)
│  ├─ worker/        # NestJS standalone: scheduler + handler'lar + outbox dispatcher
│  ├─ web/           # React + Vite + Tailwind
│  └─ mobile/        # Flutter (Faz 4)
└─ infra/            # docker-compose, migration, CI, grafana/loki
```
- **api ve worker AYRI süreç.** API'nin restart'ı görevleri etkilemez; worker CPU'yu (savaş çözümü)
  API'nin gecikmesinden izole eder.
- Ölçek: API yatay, worker N kopya (SKIP LOCKED güvenli), Postgres tek birincil + replika (okuma).

---

## 7. Protokol

- **REST** (mutasyon + ilk yükleme): `POST /missions/attack`, `GET /cities/:id`, `POST /queues/...`.
  Idempotency-Key header'ı ile çift-tıklama koruması.
- **WebSocket** (tek kalıcı bağlantı, JWT ile handshake): sunucu→istemci **olay** kanalı.
  `city:updated · mission:created|updated|completed · battle:report · message:new · world:maintenance`
  `chat:message · chat:typing · chat:presence · chat:deleted` (§13.12)
  İstemci WS üzerinden **oyun komutu göndermez** (tek yol REST) → yetkilendirme yüzeyi tek noktada.
- **⚠️ Tek istisna: sohbet.** İstemci→sunucu WS olayları yalnız `ChatGateway`'de ve yalnız
  `chat:send · chat:typing · chat:read` için kabul edilir. Bu gateway **oyun durumuna dokunamaz**
  (ayrı modül, yalnız `chat_*` tablolarına yazar); zod doğrulaması + kendi rate limit kovası vardır.
  Gerekçe: sohbet için REST turu gereksiz gecikme ve ikinci bir yetki yüzeyi demekti; oyun
  mutasyonlarının REST'te kalması ilkesi bozulmuyor.
- **serverTime senkronu:** her WS handshake ve REST yanıtında `serverNow`; istemci lokal saate GÜVENMEZ,
  offset tutup geri sayımı ondan çizer.
- **Bildirim:** Web Push (VAPID + service worker) / FCM (Flutter). Kaynak = aynı `outbox`.
  Oyuncu tercihleri: hangi olay bildirim üretir (saldırı geliyor / üretim bitti / rapor geldi).
- Eski `.do` protokolü `packages/contracts/legacy-map.md`'de **referans** olarak kalır.

### 7.1 ⭐ RAPOR TÜR KATALOĞU (kullanıcı, 2026-07-30)

Her rapor `kind:side` ikilisiyle tanımlanır; satır başlığı ve ikonu (Ordular sayfasıyla aynı
`assets/missions` PNG'leri) istemcideki tek eşleme tablosundan gelir (`Messages.tsx: REPORT_TYPE`):

| kind:side | İkon | Başlık |
| :-- | :-- | :-- |
| battle_report:attacker | attack (yeşil kılıç) | Saldırı Raporu |
| battle_report:defender | attack_in (kırmızı kılıç) | Saldırı Önleme Raporu |
| spy_report:spy | spy_out (yeşil kuş) | Casusluk Raporu |
| spy_report:target | spy_back (kırmızı kuş) | Casusluk Önleme Raporu |
| transport_report:receiver | transport_back (sarı tekerlek) | Gelen Nakliye Raporu |
| transport_report:sender | transport_out (yeşil tekerlek) | Giden Nakliye Raporu |
| support_report:receiver | support_out (yeşil kalkan) | Destek Raporu |
| found_city_report:owner | found_city (sarı kale) | Şehir Kurma Raporu |
| system | ⚙ | Sistem |

- ⭐ **Nakliye GÖNDERENİ de rapor alır** (`side: 'sender'`, 2026-07-30) — alıcı farklı oyuncuysa;
  kendi şehirleri arasında tek satır yeter (receiver).
- ⭐ **DÖNÜŞ RAPOR ÜRETMEZ** (kullanıcı kararı): ordu eve varınca posta düşmez — yalnız
  `mission:completed` bildirimi. Eski `return_report` kayıtları arşivde soluk "Ordu Döndü"
  olarak çizilir. Okunmamış satır: sol kırmızı accent şerit + hafif zemin + kalın başlık.
- ⭐ **LİSTE TEK TİP** (kullanıcı, 2026-07-30): satırda ganimet/kayıp ÖNİZLEMESİ YOK — yalnız
  ikon + tür başlığı + subject + tarih. Sayılar detay modalında.

### 7.1b ⭐ SAVAŞ RAPORU DETAYI — zengin sözleşme (kullanıcı, 2026-07-30)

Rapor `battles.result`'tan türetilir (`buildBattleReport`); 2026-07-30 zenginleştirmesiyle
savaş anında satıra şunlar da işlenir: `heroesDetail` (id/ad/seviye/sağ-mı/XP),
`wall {level, destroyed}`, `coords {origin, target}`, ve **savunana özel** `defenderPrivate`
(mağara `escaped` dökümü + `repairUntil`).

- **Bölümler OKUYANIN perspektifinde**: `myArmy` ("Ordun") · `enemyArmy` ("Rakip ordu") ·
  `defenderStructs` ("Savunma birimleri") — her satır Katılan → Kalan · Ölen (+ taban).
- **Kahraman kartları**: `assets/hero/kahraman.png` + ad + seviye + rozet (**"Sağ"** ya da
  **"Yok Edildi !"** — k.java kalıbı; 2026-08-01'den beri ölen kahramanın TEK etiketi) +
  "+n tecrübe" (yalnız KENDİ kahramanlarında; rakibin XP'si sızdırılmaz). Yeni çıkan kahraman
  yeşil kartla kutlanır.
- **Sur kartı**: seviye + bütünlük % / YIKILDI. **Mağara kartı**: YIKILDI/dayandı; saldırana
  yalnız gereken/sağ kalan cüce; savunana ek olarak "şehre yola çıkanlar" birim dökümü.
- **Ganimet dökümü** (yalnız saldıran, mesajlar.txt'teki oyuncu isteği): "Ortaya çıkan"
  (enkaz+yağma havuzu) vs "Taşınan". Başlık orijinal kalıpla: "Kazandınız !" / "Kaybettiniz !";
  koordinat satırı "Kaynak: → Hedef:".
- **Sızıntı kilidi iki katman**: `buildBattleReport` `defenderPrivate`'ı yalnız savunan
  tarafta okur; `/battles/:id` ucu saldıran tarafta anahtarı komple SİLER. Eski (zenginleşme
  öncesi) savaş kayıtları degrade olur: kahraman kartları yerine "N kahraman düştü" notu.
- Motor sürümü **1.0.0'a çekildi** (temiz başlangıç, kullanıcı 2026-07-30): tek kaynak
  `packages/engine/src/config.ts ENGINE_VERSION`; package.json senkronu testle kilitli.
  Eski `battles.engine_version=0.6.0` satırları künye olarak öylece kalır.

### 7.2 ⭐ SUNUCUNUN KENDİ KENDİNE BİLDİRİMİ (kullanıcının sorusu, 2026-07-30)

**Döngü zaten var, yeni mimari gerekmedi:** `SchedulerService` API süreciyle (ROLE=all) 1 sn'lik
`setInterval` döngüsü kurar; `execute_at` geçen görev OYUNCU ETKİLEŞİMİ OLMADAN işlenir. Handler
aynı transaction'da `outbox`a yazar → `OutboxDispatcher` (500 ms) → Postgres NOTIFY →
socket.io gateway → oyuncu-bazlı odalar (`w{world}:p{player}`). Sunucu kapalıyken biriken
görevler açılışta sırayla işlenir (catch-up).

2026-07-30'da kapatılan üç boşluk:
1. `city:incoming_spy` outbox'ı eşlenmemişti → sessizce düşüyordu; artık `missions:changed`.
2. `city:army_returned` şehre birlik+ganimet yazdığı hâlde `['city']` tazelenmiyordu →
   dönüş handler'ı artık `city:changed` de yayar.
3. ⭐ **`mission:completed`** — scheduler, Ordular'da görünen her görev tipinin
   (`attack · return · transport · support · spy · found_city · cave_return`) bitişinde tek
   yerden yazar; sahibi + hedef şehrin sahibi `missions:changed` alır. Böylece Ordular satırı
   anlık düşer, sol menü rozeti her sayfada kendiliğinden güncellenir. Nakliye varışında
   gönderenin listesi bu olaydan önce hiç tetiklenmiyordu.

### 7.2b ⭐ BİLDİRİM KATMANI — toast + web push (kullanıcı, 2026-07-31) ✅ YAPILDI

Kullanıcının çekirdek şartı: ***"Push sisteminin en önemli özelliği ws bağlı iken bildirim
gelmemesi gerekir."*** Uygulama açıkken sağ alttan kayan bir şerit, kapalıyken işletim sistemi
bildirimi.

**K1 — Tek metin kaynağı.** `notify/notify.catalog.ts` → `notificationForOutbox(topic, payload,
worldId)`, `realtime.bus.ts`'teki `eventForOutbox`'ın kardeşi. O *"hangi sorguyu tazele"* der,
bu *"insana ne yazacağız"* der. Türkçe metin **tek yerde** üretilir; aynı dize hem toast'ta hem
push'ta görünür. İki yerde üretilseydi kaçınılmaz olarak ayrışırdı (aynı gerekçe: sefer süresi
önizlemesi motorun AYNI `travel.ts`'ini çağırıyor).
⚠️ Dönüş tipi **dizi**: bir outbox satırı birden çok alıcıya, FARKLI metinlerle gidebilir —
savaş bitince saldıran *"Saldırın başarılı oldu"*, savunan *"Savunma çöktü"* görür.

**K2 — Tek dallanma noktası.** `NotifyService.deliver()` içinde tek `if`: kategori tercihi →
`isOnline(playerId)` → çevrimiçiyse `notify:show` WS olayı, değilse `push_subscriptions` +
`web-push`. İkinci bir kod yolu OLMADIĞI için "hem toast hem push geldi" yapısal olarak imkânsız.
⚠️ **İkinci `'*'` sink EKLENMEDİ** — `sinkFor` tek sink döndürür, ikincisi birincisini
susturur; bildirim dalı mevcut sink'in İÇİNDE.
⚠️ Oyuncunun **herhangi bir** soketi açıksa push gitmez (cihaz başına ayrım yapılamaz: abonelik
tarayıcıya, soket oturuma ait).

**K3 — Abonelik HESAP düzeyinde** (`push_subscriptions.account_id`, `endpoint` küresel unique).
Abonelik tarayıcıya aittir, tarayıcı hesaba; hedefleme `player → account → subscriptions`.
Tercihler de hesap düzeyinde (`accounts.notify_prefs` jsonb, **eksik anahtar = varsayılan**) —
`ui_theme` emsali, yeni kategori eklenince eski satırlara dokunulmaz.

**K4 — Ölü abonelik temizliği.** Push servisi 404/410 dönerse satır **anında silinir**; başka
hatada `fail_count++`, 5'te düşer. Yapılmasaydı izni geri alan her oyuncu tabloda kalıcı bir
başarısız HTTP isteği bırakırdı.

**K5 — WS "veri değil haber taşır" kuralına dar istisna.** `notify:show` olayı `title`/`body`
taşır. Gerekçe: bu bir oyun durumu değil, o an üretilmiş bir mesaj — hiç yeniden okunmadığı
için DB ile ayrışamaz. Sınır zorunlu (`title ≤ 60`, `body ≤ 120`). `INVALIDATES`'e GİRMEZ.

**Kategoriler** (dördü de varsayılan AÇIK, kullanıcı kararı): `attack` (gelen saldırı/casusluk,
birim dökümüyle) · `dm` · `report` (savaş + mesaj kutusu) · `production`.
⚠️ `message:written`'da `battle_report` **atlanır** — savaşın bildirimi `battle:resolved`'dan
çok daha zengin; ikisi de üretse oyuncu aynı savaş için iki bildirim alırdı.
⚠️ `production` push'u oyuncu başına **10 dk** birleştirilir (`NOTIFY_PRODUCTION_COALESCE_SECONDS`);
toast birleştirilmez — uygulama açıkken her bitiş görünmeli, kilitli telefona beş bildirim düşmemeli.

**Toast** (`components/Toaster.tsx`): sağdan kayarak girer, 6 sn durur, sağa kayarak çıkar;
mobilde alt gezinti barının üstünde, aynı yön. `z-50` (alt bar 20 < sohbet 30 < modal 40 <
**toast 50** < tooltip 60) → modal açıkken de görünür. Üzerine gelince sayaç durur; tıklayınca
`url`'e gider. `prefers-reduced-motion`'da kayma yok.

**İzin** asla kendiliğinden istenmez (Seçenekler → Bildirimler paneli). Bir kez reddedilirse
karar kalıcıdır ve uygulamadan geri alınamaz.

⚠️ **`ROLE` KISITI (tuzak):** çevrimiçilik `RealtimeGateway`'in bellek-içi sayacında; o kayıt
yalnız `ROLE=api|all` süreçlerinde dolu. `ROLE=worker` ayrımında herkes çevrimdışı sayılır →
**WS açıkken de push gider**. Profil `ROLE=all`; ayrılırsa açılışta uyarı basılır.

**Kalan:** Flutter/FCM token kaydı (aynı tabloya girer) · bildirim geçmişi ekranı yok.

### 7.3 Menü aktivite noktaları (kullanıcı, 2026-07-30)

Sol menüde (ve mobil Şehir hub'ında) AKTİF ŞEHİRDE süren iş varsa ilgili satırın sağında yeşil
nokta: Baraka=birim bandı · Savunma=savunma bandı∨sur onarımı · Yapılar=yapı kuyruğu∨mağara ·
Akademi=BU şehirden başlatılan araştırma (akademiler ortak ama nokta şehir-bazlı, kullanıcı
kararı) · Tapınak=diriltilen kahraman (`CityDetail.heroReviving`). Alt bar Şehir ikonunda nokta
YOK. Ek uç gerekmedi — sidebar `useCity` cache'inden okur.

---

## 8. Gözlemlenebilirlik & denetim (üretim ciddiyeti)

- **Yapılandırılmış log** (pino, JSON): her istek `trace_id`, her görev `mission_id` + `trace_id`.
- **Kritik SLO metriği: görev gecikmesi** `game_now() - execute_at` (p95 < 2 sn). Bu tek metrik
  "oyun zamanında çalışıyor mu" sorusunu cevaplar. Ayrıca: outbox bekleyen sayısı, savaş çözüm süresi,
  WS bağlantı sayısı, DB kilit bekleme.
- **audit_log**: kaynak/asker değiştiren HER işlem before/after ile yazılır. Hem hile/şikâyet analizi
  hem de bug sonrası **onarım** (geri alma) için vazgeçilmez.
- **Alarm:** dead_letter > 0, görev gecikmesi > 30 sn, outbox birikmesi, hata oranı → Sentry + webhook.

---

## 9. Güvenlik

- **argon2id** parola; JWT access (15 dk) + rotating refresh (httpOnly, SameSite=Strict cookie web'de).
  *Orijinaldeki "3-8 karakter şifre" kuralı KULLANILMAYACAK* (modern minimum 8+).
- Her istekte **sahiplik doğrulaması** (şehir gerçekten bu oyuncunun mu) — servis katmanında guard.
- **zod** ile giriş doğrulama (contracts paketinden, istemciyle ortak şema).
- Rate limit: IP + hesap bazlı; ordu gönderme/mesaj için ayrı kova.
- Oyun-içi kötüye kullanım: 24 saatte 3 saldırı limiti, tatil modu koşulları, **çok-hesap tespiti
  → §9.1** (aksiyon değil, sinyal).
- Yedek: PITR (WAL arşivi) + günlük dump + **geri yükleme tatbikatı** (yılda 2, yazılı prosedür).

### 9.0b Jeton ömürleri — ölçülmüş durum (kullanıcı sorusu, 2026-08-01)

| Soru | Cevap | Kaynak |
| :-- | :-- | :-- |
| Access token süresi | **15 dk**, HS256, içinde `sub`/`pid`/`wid`/`sid` | `token.service.ts:56` |
| 15 dk uzun mu | **Hayır, kısa uçtur.** Uzun sayılan değerler saatler/günlerdir. | — |
| Çalınan access ne kadar yaşar | **≤ 15 dk** ve kendini yenileyemez (yenileme refresh ister) | `token.service.ts:60-69` |
| Refresh token | 30 gün, JWT **değil** (32 bayt rastgele), DB'de yalnız SHA-256 özeti | `token.service.ts:57, 84-92` |
| Refresh **ekstra satır açmadan** yeniliyor mu | **HAYIR — her yenileme YENİ bir `sessions` satırı yazar**, eskisini iptal eder. Cihaz başına ~96 satır/gün. | `auth.service.ts:253-266` |

⚠️ **Asıl önemli ayrıntı:** access token durumsuz olmasına rağmen `AuthGuard` **her istekte**
`sessions` satırına bakıp iptal kontrolü yapıyor (`auth.guard.ts:52-56`). Sonuçları:

- **İptal anında işler** — çıkış, parola değişimi ve hesap silme 15 dk beklemez.
- Bu yüzden TTL'i kısaltmanın güvenlik kazancı **yok**; TTL yalnız yenileme sıklığını belirler.
  Uzatmanın da riski sınırlı, ama gereksiz: 15 dk zaten sorun çıkarmıyor.
- Satır büyümesi tasarımın kabul ettiği bedel: cihaz listesi `chain_id` ile tekilleştiriyor
  (§admin Faz 3), tablo da yönetim panelindeki `sessions` temizlik göreviyle budanıyor
  (`ops-jobs.ts:129-143`).

⚠️ `device-signal.service.ts`teki `pruneOldSessions` **hiç çağrılmıyordu** ve mantığı da
yanlıştı; 2026-08-02'de silindi (§9.3.8).

---

## 9.1 ⭐ ÇOKLU HESAP (MULTI-BOX) TESPİTİ (kullanıcı isteği, 2026-07-26)

Tehdit: bir kişi birkaç e-postayla hesap açıp **kendi kendini besliyor** — bilerek ordusunu
kırdırıyor (enkaz + XP hediyesi), nakliyeyle kaynak aktarıyor, sahte savaşlarla puan/kahraman
üretiyor. Bu, sıralamayı ve ekonomiyi bozan **en yaygın** kötüye kullanım.

### 9.1.0 ⏰ Neden ŞİMDİ kurulmalı (asıl cevap)
**Tespit mantığı sonradan yazılabilir, VERİ sonradan toplanamaz.** Bugün kaydetmediğimiz cihaz/IP
izini, oturum örtüşmesini, görev grafiğini altı ay sonra geri getirmenin yolu yok. Bu yüzden iş
ikiye bölünüyor:

| Katman | Ne zaman | Neden |
| :-- | :-- | :-- |
| **A. TOPLAMA** (sinyal kaydı) | **Faz 2 — şimdi** | Veri kaybı geri alınamaz. Ucuz: birkaç tablo + bir header. |
| **B. ANALİZ** (kural + skor) | Faz 4 | Eşikler gerçek oyuncu davranışı olmadan **tahminden ibaret** olur; yanlış eşik masum oyuncuyu suçlar. |
| **C. RAPOR** (e-posta) | Faz 4 (altyapı Faz 2'de hazır) | `outbox` zaten var → Resend geldiğinde tek "sink" eklenir, kod değişmez. |

### 9.1.1 Değişmez ilke: SİNYAL, KARAR DEĞİL
**Sistem asla otomatik ceza vermez.** Sebep: her teknik sinyalin masum açıklaması var —
aynı evdeki kardeşler, aynı ofis/okul ağı, mobil operatör NAT'ı (binlerce kullanıcı tek IP),
paylaşılan tablet. Yanlış pozitifin bedeli çok yüksek (haksız ban = oyuncu kaybı + itibar).
→ Çıktı **skorlu bir rapor**; kararı **sen** verirsin. Her moderasyon işlemi `audit_log`'a düşer.

### 9.1.2 A katmanı — hangi sinyaller kaydedilecek

**Teknik izler (web ve mobil AYRI, çünkü elde farklı şeyler var):**

| Sinyal | Web | Flutter (mobil) | Güç |
| :-- | :-- | :-- | :-: |
| **`device_id`** — istemcide üretilen rastgele UUID, kalıcı saklanır ve `X-Device-Id` başlığıyla gelir | `localStorage` + httpOnly çerez (ikisi birden → biri silinse diğeri kalır) | güvenli depo (`flutter_secure_storage`); kurulum silinmedikçe kalıcı | ⭐⭐⭐ |
| **IP + ASN + /24 öbeği** | var | var | ⭐⭐ |
| **User-Agent** | var (kolay taklit edilir) | **YOK** — yerine `platform/os/model/appVersion` | ⭐ |
| Saat dilimi + dil | `Intl.DateTimeFormat().resolvedOptions()` | `Platform.localeName` | ⭐ |
| Ekran ölçüleri | var | var | ⭐ |

> ⚠️ **Canvas/WebGL parmak izi KULLANILMAYACAK.** Hem KVKK/GDPR açısından ağır (açık rıza gerektirir),
> hem kolay atlatılır, hem de aşağıdaki davranış sinyalleri zaten çok daha güçlü. Topladığımız veri
> "hesap güvenliği ve hile önleme" meşru menfaati ile sınırlı, **90 gün** saklanır, gizlilik
> metninde açıkça yazılır.

**Davranış ve grafik izleri (ASIL GÜÇLÜ OLANLAR — teknik izler taklit edilebilir, bunlar edilemez):**

| # | Sinyal | Neyi yakalar |
| :-: | :-- | :-- |
| B1 | **Tek yönlü kaynak akışı** — A→B nakliye/destek var, B→A hiç yok | besleme hesabı |
| B2 | **Kârsız saldırı** — saldıran hep kazanıyor, savunan hep aynı ucuz orduyu yeniden kuruyor | XP/enkaz çiftliği |
| B3 | **Oturum örtüşmemesi** — iki hesap hiç aynı anda online değil, ama sırayla dakikalar içinde devralıyor | tek kişi, hesap değiştiriyor |
| B4 | **Aynı `device_id`** iki oyuncuda | aynı cihaz |
| B5 | **Kayıt kohortu** — aynı /24'ten dakikalar içinde açılan hesaplar | seri hesap açma |
| B6 | **Savunma tutarsızlığı** — savunan, tam da ezilecek kadar birim tutuyor (kapasitesi varken savunma üretmiyor) | bilerek kırdırma |
| B7 | **Mesaj sessizliği** — aralarında hiç sohbet yok ama yoğun kaynak alışverişi var | gerçek müttefik değil |

**Şema (Faz 2'de kurulacak):**
```sql
player_devices(player_id, device_id, first_seen, last_seen, hits)   -- PK(player_id, device_id)
player_ips(player_id, ip inet, asn text, first_seen, last_seen, hits)
sessions(... ip, ua, device_id, platform, app_version ...)          -- mevcut tablo genişletilir
abuse_signals(id, world_id, kind, subject_player_id, related_player_id,
              score, evidence jsonb, window_from, window_to, created_at, resolved_at, resolution)
abuse_scan_runs(id, window_from, window_to, started_at, finished_at,
                signals_found, players_flagged, emailed_at)          -- artımlı tarama çıpası
```
`player_devices` ve `player_ips` **sayaç tablosu** (satır sayısı oyuncu×cihaz ile sınırlı) → tüm
oturum geçmişini saklamaya gerek yok, `sessions` 90 günde budanır ama öbek bilgisi kalır.

### 9.1.3 B katmanı — tarama işi
**Tarama bir GÖREV TİPİDİR** (`abuse_scan`) → Faz 1 omurgasını olduğu gibi kullanır: zamanlanır,
tekrarlanır, crash'e dayanır, denetlenir, bakımda durur. Ayrı bir cron/altyapı **gerekmez**.

- **Artımlı:** `window_from = son başarılı taramanın window_to`'su. Böylece "son kontrolden sonraki
  işlemler" tam olarak bir kez incelenir; worker kapalı kalsa bile pencere kaymaz.
- **Aralık:** `world_config.abuse.scanIntervalHours` (varsayılan **168** = haftalık, kullanıcı isteği).
- **Skor:** her sinyalin ağırlığı config'te; bir oyuncu çifti için toplam skor eşiği aşarsa rapora girer.
  Ağırlıklar **veri görüldükten sonra** ayarlanacak (bu yüzden B katmanı Faz 4'te).
- **Çıktı:** `abuse_signals` satırları + `outbox` konusu **`admin:abuse_report`**.

### 9.1.4 C katmanı — rapor e-postası
- Faz 2'de: `outbox`'a düşer, geliştirmede **Mailpit**'te görünür (kanal kaydı zaten var).
- Resend geldiğinde: dispatcher'a tek `sink` eklenir (`admin:abuse_report` → Resend API). **Motor,
  görev, şema hiç değişmez** — outbox deseninin bütün kazancı bu.
- Rapor içeriği: şüpheli çiftler, skor, kanıt özeti (hangi görevler/oturumlar), ve **her biri için
  "masum açıklama" notu** (ör. "aynı ASN — mobil operatör NAT'ı olabilir").

### 9.1.5 Neyi ASLA yapmayacağız
- Otomatik ban/kaynak silme.
- Rapor dışında oyunculara birbirinin IP/cihaz bilgisini göstermek.
- DM içeriğini analize sokmak — yalnız **var/yok** ve **sıklık** (B7 sinyali); metin okunmaz (§13.12.4 gizlilik).
- Canvas/WebGL parmak izi.

### 9.1.6 Kabul kriteri
Faz 2 çıkışında: iki farklı hesapla aynı tarayıcıdan giriş yapıldığında `player_devices`'ta
**aynı `device_id` iki `player_id` ile** görünüyor; `player_ips` dolu; `sessions.platform` web/mobil
ayrımını taşıyor. Analiz henüz yok — **veri var.**

## 9.2 ⭐ E-POSTA (Resend) — doğrulama + şifre sıfırlama (kullanıcı, 2026-07-31) ✅ YAPILDI

`accounts.email_verified_at` kolonu 0000'dan beri duruyordu ama hiçbir kod dokunmuyordu; bu
yüzden **şifre sıfırlama da imkânsızdı**. Kapandı.

**K1 — SDK yok, `fetch` var.** `resend` npm paketi eklenmedi: uç tek
(`POST https://api.resend.com/emails`), gövde dört alan, kimlik `Bearer`. Node 22'nin global
`fetch`'i yetiyor ve projede zaten hiç HTTP istemci bağımlılığı yok.

**K2 — Gönderim OUTBOX üzerinden** (`mail:send` topic'i + worker'da **konuya özel sink**).
Bu güvenli: `sinkFor` önce tam eşleşmeye bakar, `'*'` fallback'tir (⚠️ ikinci bir `'*'` sink
birincisini susturur — o tuzağa düşülmedi). Kazanç: yeniden deneme, `attempts`/`last_error`,
dead-letter bedava. **Hata ATILIR** (bildirimden farklı olarak): şifre sıfırlama maili
gitmezse oyuncu hesabına giremez, sessizce yutulamaz.
⭐ Resend'in **`Idempotency-Key`** başlığına **outbox satır id'si** verilir → ağ zaman
aşımından sonraki yeniden deneme aynı maili İKİNCİ kez göndermez. Outbox'ın "en az bir kez"
garantisi ile Resend'in tekilleştirmesi tam burada birleşiyor.

**K3 — Doğrulama YUMUŞAK: ⛔ ARTIK DEĞİL** (kullanıcı, 2026-08-01 → §9.2b). Giriş hâlâ serbest
ama oyunun içinde gerçek kısıtlar var. Eski hâl — *"doğrulanmamış hesap oyunun hiçbir yerinde
engellenmez"* — sahte hesap üretmenin bedelini sıfır yapıyordu.
Doğrulama ayrıca **şifre sıfırlama** için şart: doğrulanmamış (yanlış yazılmış ya da başkasına
ait) bir adrese sıfırlama bağlantısı göndermek, doğrulamanın varlık sebebini ortadan kaldırırdı.

**K4 — Jetonlar `sessions.refresh_hash` deseninde**: `randomBytes(32).base64url`, DB'ye
**yalnız sha256**. `email_tokens.email` kolonu kasıtlı denormalize — adres değişirse eski
jeton kendiliğinden ölür. Tüketim tek `UPDATE … WHERE used_at IS NULL … RETURNING` (yarış
koşulunda jeton iki kez kullanılamaz).

**K5 — Sayım sızdırmaz.** `forgot-password` **DAİMA 204**: adres kayıtlı olmasa da,
doğrulanmamış olsa da, kota dolmuş olsa da. Aksi hâlde uç "bu e-posta bu oyunda kayıtlı mı"
sorusunu cevaplayan bir araç olurdu (`auth.service.ts`teki sahte-hash zaman eşitlemesiyle
aynı felsefe). Arayüz de *"gönderdik"* değil ***"kayıtlıysa gönderdik"*** der.

**Sıfırlama TÜM oturumları düşürür** — `AuthService.revokeAll` bugüne kadar yazılmış ama hiç
çağrılmamıştı; yeri burasıydı. Aynısı parola değiştirmede de geçerli.

**Limitler** (`mail.limits.ts`, env ile): doğrulama 24 sa · sıfırlama **60 dk** (bu bağlantı
hesabı ele geçirmeye yeter, pencere dar olmalı) · cooldown 60 sn · hesap başına günde 10 ·
IP başına günde 30. Yeni bağımlılık yok, `chat.service.ts` gibi **DB sayımlı**.
⚠️ **Cooldown AMAÇ BAŞINA** sayılır: ortak sayılınca kayıt olur olmaz "şifremi unuttum" diyen
oyuncuya, kayıt maili cooldown'u doldurduğu için sıfırlama maili SESSİZCE hiç gitmiyordu
(canlı denemede bulundu, regresyon testi var).

**Anahtarsız geliştirme:** `RESEND_API_KEY` boşsa `LogSender` devreye girer, gövde **konsola**
basılır ve bağlantı log'dan açılır → akışın tamamı posta kurmadan denenebilir.

**Ekranlar:** giriş ekranında "Şifremi unuttum" · oturumsuz `/verify-email` ve
`/reset-password` (bağlantı çoğu zaman telefonun posta uygulamasından, oturumsuz bir
tarayıcıda açılır → oturum kapısının ÖNÜNDE ele alınır) · Shell'de doğrulama şeridi ·
Seçenekler → Hesap panelinde e-posta + rozet + **Şifre Değiştir**.
⚠️ `/verify-email` etkisi **ref ile korunur**: StrictMode etkiyi iki kez koşturuyor, tek
kullanımlık jeton birinci istekte tükeniyor, ikincisi "geçersiz" diye ekrana hata yazıyordu —
doğrulama olmuşken kullanıcı olmadı sanıyordu (canlı denemede bulundu).

---

## 9.2b ⭐ DOĞRULANMAMIŞ HESAP KISITLARI (kullanıcı, 2026-08-01) ✅ YAPILDI

Doğrulama 2026-07-31'de geldi ama **dişsizdi**: kod iki ayrı yerde *"hiçbir yerde
engellenmez"* diyordu. Yani sahte hesap üretmenin bedeli sıfırdı. Yeni denge:
**oyunu keşfetmeyi engelleme, ilerlemeye izin verme.**

| serbest | yasak |
| :-- | :-- |
| üretim · yapı · teknik (tavana kadar) | saldırı · nakliye · şehir kurma |
| casusluk | adetli savunma birimi üretimi |
| KENDİ şehirleri arasında destek | ittifak kurma / katılma |
| kahraman · mağara · kuyruk · rapor | mesaj YAZMA (gelen okunur) · şehir adı değiştirme |

**Tavanlar** (`verify` ayar grubu, panelden ayarlanabilir): yapı 3 · teknik 3 · Sur ve Büyü
Kalkanı 3 · toplam savaşçı 200.

**K1 — Sınırlar «≥», geri alma YOK** (kullanıcının açık şartı). Kapı *"hedef seviye tavanı
aşıyor mu"* diye değil **"mevcut seviye tavana ULAŞTI mı"** diye sorar. Fark yalnız doğrulamayı
SONRADAN kaybeden hesapta görünür — e-posta adresi değiştirmek tam olarak bunu yapıyor (§9.2c):
seviye 6 akademisi olan oyuncu akademiyi kaybetmez, sadece 7'ye çıkamaz.

**K2 — Şehir kurma AYRICA yasak.** Kullanıcının *"zaten en fazla 1 şehir kurabilir"* varsayımı
kendiliğinden doğru DEĞİLDİ: Sömürgecilik de bir teknik ve tavanı 3, `maxCities(3) = 2`.

**K3 — Savaşçı sayımı DÖRT kaynaktan**: baraka + mağara + yoldaki `mission_units` + bekleyen
üretim kuyruğu. Yalnız baraka sayılsaydı "üret → gönder → yine üret" döngüsüyle sınırsız ordu
kurulurdu ve limit hiçbir şey ifade etmezdi.

**K4 — Küresel kesici (interceptor) DEĞİL, servis boğazları.** `MaintenanceInterceptor` deseni
hazırdı ama o HTTP METODUNA göre kilitliyor (tüm POST'lar); buradaki kısıtlar seçici (casusluk
serbest, saldırı yasak; yapı 3'e kadar serbest). Üç düzenleme yüzeyin %90'ını veriyor:
`queue.service.loadCity` · `mission.service.sendAttack` · `march`.

**K5 — İttifak kapısı İKİ yerde.** `alliance.service.ts`in başlığı *"üyelik tek yardımcıdan
geçer"* diyordu ve **bayattı**: `decide()` yarış koruması eklenirken kendi
`UPDATE players SET alliance_id … WHERE alliance_id IS NULL` sorgusunu yazmış ve
`applyMembership`ten çıkmıştı. Kontrol **katılana** (`subjectId`) bakar, onaylayana değil.

**K6 — Teleport'a kapı YOK ve gerekmiyor**: ön-şartı Kale 12 + Mimar Okulu 12, yapı tavanı 3 →
erişilemez. Boş bir kapı koymak, kapının neden var olduğunu unutturur.

**Ekranlar:** doğrulama şeridi artık **ne yapılamadığını sayıyor** · Yapılar/Akademi/Savunma
satırlarında tavana dayanınca düğme pasif + gerekçe (`Requirements` ile aynı görsel dil) ·
`GET /missions/options` yasak seçenekleri `enabled:false` + gerekçeyle döndürüyor, modal
oyuncuyu formu doldurduktan SONRA reddetmiyor · sohbet kutusu kapalı + açıklama.
⚠️ Tavan sayıları ekrana **sunucudan** iniyor (`/cities/:id/catalog` → `verify`): istemcide
sabit yazmak, yönetici tavanı değiştirdiğinde ekranın yalan söylemesi demekti.

⚠️ **Test kurulumu değişti:** `createPlayer` artık **doğrulanmış** hesap üretiyor ve
`auth.register` kullanan testler `verifyEmail(h, playerId)` çağırıyor. Gerçek kayıt akışı
hesabı doğrulanmamış bırakıyor, yani `register` çağıran her test bu kısıtların ortasına
doğuyordu; kısıtları ÖLÇMEYEN testler normal bir oyuncuya dönüştü.

---

## 9.2c ⭐ HESAP YÖNETİMİ: silme · adres değiştirme · şifre (kullanıcı, 2026-08-01) ✅ YAPILDI

### Hesap silme — mağaza şartı ve oyuncunun hakkı

Google Play, hesap silme için **oturum gerektirmeyen herkese açık bir sayfa** istiyor. Akış:
Seçenekler → Hesabı Sil → e-postaya **12 saatlik, tek kullanımlık** bağlantı → `/hesap-sil`
sayfası ne olacağını tek tek gösterir → onay.

**K1 — Silme değil ANONİMLEŞTİRME + STERİLİZASYON.**

| ne olur | neden |
| :-- | :-- |
| `players` satırı **KALIR**, adı `hükümdarN` | başkent dünyada duran gerçek bir şehir; satırı yok etmek savaş geçmişinde, sıralamada ve komşuların raporlarında delik açardı |
| başkent **KALIR**, adı oyuncuyla **AYNI** | kullanıcı şartı |
| başkent dışı şehirler **YIKILIR** (ordu olsa bile) | kullanıcı şartı |
| `accounts` sterilize: e-posta `silinmis+<id>@mobiwar.invalid`, parola rastgele | ⭐ gerçek adres **serbest kalır** → aynı e-postayla yeniden kayıt mümkün |
| oturum · push aboneliği · jeton **SİLİNİR** | kişisel veri gerçekten gider |

⚠️ Parola **boş bırakılmıyor, rastgeleye çevriliyor**: geçersiz bir hash `argon2.verify`i
patlatır ve giriş "sunucu hatası" verir; rastgele hash sessizce ve doğru şekilde
"parola yanlış" der.

**K2 — Üç engel.** Başkent DIŞI şehre değen hareket (kullanıcının kuralı) · başkentten
**çıkmış** ordu (kullanıcı seçimi: yoksa silinmiş hesabın ordusu saatler sonra birine saldırır
ve dönüşte anonim şehre girer) · **ittifak liderliği** (kullanıcı seçimi: lider silinirse
ittifak başsız kalır). ⚠️ Başkente **gelen** saldırı engel DEĞİL — kullanıcının açık kuralı.

⚠️ **Engeller onay anında YENİDEN bakılır.** Bağlantı 12 saat geçerli; önizlemedeki "temiz"
cevaba güvenmek, silmeyi tam da yasakladığımız durumda yapmak olurdu.

**K3 — Kahramanlar ÖNCE başkente taşınır.** `heroes.city_id` şehre `ON DELETE SET NULL` bağlı:
yıkılan şehirdeki kahraman şehirsiz kalır ve hiçbir tapınakta görünmez. Sıra load-bearing.

**K4 — `hükümdarN` sayacı `worlds.deleted_player_seq`te**, dünya başına ve `FOR UPDATE` ile
kilitli. Kayıt bu deseni **REZERVE eder** (`DELETED_NAME_RE`): gerçek bir oyuncu "hükümdar1"
alırsa sonraki silme aynı adı üretmek isteyip tekillik kısıtına çarpar ve **silme başarısız
olurdu**.

**K5 — Dünya kapsamı kendiliğinden çalışıyor.** Hesap ↔ dünya birebir (kayıt aynı e-postayı
ikinci kez kabul etmiyor), yani *"bir dünyadaki hesabını sil, başka dünyada devam et"* için
ek bir şey gerekmiyor: öbür dünya zaten ayrı bir hesap.

### E-posta adresi değiştirme

`POST /auth/change-email` — **mevcut parola şart** (şifre değiştirmekle aynı güvenlik sınıfı:
saldırgan adresi kendine çekip sonra "şifremi unuttum" ile hesabı tamamen alabilirdi).
Adres **hemen** değişir, hesap **doğrulanmamışa düşer** (§9.2b kısıtları «≥» ile yürürlüğe
girer, hiçbir seviye geri alınmaz), yeni adrese doğrulama + **eski adrese bilgi** maili gider.

⭐ Bedava gelen davranış: bekleyen `reset` jetonları kendiliğinden ölür — `consume()` jetondaki
adresi hesabın güncel adresiyle karşılaştırıyor (`email_tokens.email` kasıtlı denormalize).

⚠️ **`skipCooldown` — testte bulunan yara.** Cooldown "aynı maili tekrar isteme" freni; adres
değiştirmek başka bir eylem ve yan ürünü olarak doğrulama maili üretiyor. Fren orada da
işleyince, e-postasını yanlış yazıp hemen düzeltmek isteyen oyuncu kayıt mailinin 60 saniyesine
takılıyor ve **adres değişimi hiç gerçekleşmiyordu**. Günlük tavanlar yerinde.

### Şifre değiştirme

⭐ **Aktif oturum ayakta kalır**, yalnız diğer cihazlar düşer (`revokeOtherChains` — bugüne
kadar yazılmış ama hiç çağrılmamıştı). Oyuncuyu kendi şifresini değiştirdiği için oyundan
atmak gereksiz bir cezaydı; istemci de bunu bilip sayfayı zorla yeniden yüklüyordu.
⚠️ Sıfırlamada (`resetPassword`) **hepsi** düşmeye devam ediyor: orada niyet "hesabı geri al".
Değişiklik e-postayla bildiriliyor (şifreyi değiştiren kişi sahibi olmayabilir).

### Ad sınırı 10 → 15

`hükümdar` tek başına 8 karakter; sayı büyüdükçe 10 yetmiyor. Kullanıcı adı ve şehir adı
birlikte yükseldi. Kural artık **tek yerde** (`name-rules.ts`): `contracts → catalog` kenarı
açıldı (tek yönlü, `settings → catalog` ile aynı gerekçe) ve `CityAdminPanel`deki el kopyası
silindi. ⚠️ `Auth.tsx`teki `pattern="[A-Za-z0-9]+"` **kaldırıldı**: sunucunun `\p{L}\p{N}`
kuralıyla çelişiyordu — "Ayşe" tarayıcıda reddediliyor, sunucuda kabul ediliyordu.

### Panelden başlangıç kesesi

`economy.startingGold` / `economy.startingFood` (varsayılan 4000/4000). ⚠️ Koloni kesesi
ayarlanabilir DEĞİL ve öyle kalıyor: 0 bir denge düğmesi değil **değişmez** — koloniye kese
vermek "kur → al → terk et" döngüsünü açardı. `catalogHash` kaymadı (`diffFromDefault`).

**Gönderen:** `noreply@mailer.mobilwar.com` · **Yanıt adresi:** `destek@mobilwar.com`
(2026-08-02). Alt alan kullanılmasının sebebi değişmedi: gönderim itibarı kök alandan yalıtık
kalsın ve kök alanın kendi posta kayıtlarına hiç dokunulmasın. DNS **Cloudflare**'de;
`mobilwar.com`un MX'i Cloudflare Email Routing'e ait (**Locked**, elle düzenlenmez) ve
`destek@` oradan gerçek bir kutuya yönleniyor — **kendi posta sunucumuz yok, olmayacak da**.

---

## 9.2d ⭐ YAPI AÇIKLAMALARI ve AÇIKLAMA–KOD DENETİMİ (kullanıcı, 2026-08-01) ✅ YAPILDI

> ⛔ **TOOLTIP'LER İPTAL EDİLDİ (kullanıcı, 2026-08-02).** *"Yapılar sayfasındaki yapıların
> üzerine gelince çıkan açıklama tooltiplerini de komple iptal edelim, önceki mantığa dönelim."*
> `building-info.ts` silindi, katalog yükündeki `info` alanı kaldırıldı, `ItemName` açıklamasız
> hâline döndü. Yapılar sayfasında tıklanabilir tek ad yine **Mağara** (doldur/boşalt modalı).
> **Aşağıdaki denetim tablosu KALIYOR** — kullanıcının asıl sorusunun cevabı o, tooltip yalnız
> onu gösterme biçimiydi. Dokuz metnin kendisi commit `c1c2b48`te duruyor.

### Açıklama–kod denetimi (kullanıcının sorusu: *"örtüşmeyen bir mantık varsa bildir"*)

Dokuz metnin dokuzu da koda karşı okundu. **Tek gerçek çelişki Mimar Okulu'ndaydı:**

| Yapı | Bulgu |
| :-- | :-- |
| **Mimar Okulu** | ⚠️ Metin *"**diğer** şehir yapıları"* diyordu; kodumuz Mimar Okulu'nun **kendi inşasını da** hızlandırıyor (`formulas.ts:318-320` — orijinaldeki özel dal, bölen 1,4'ten 1,2'ye inince bilerek kaldırılmıştı). **Metin düzeltildi, kod değil**: özel dalı geri koymak sessiz bir tutarsızlık kaynağı olurdu. |
| **Tapınak** | Çelişki değil **eksik**: kahraman çıkma olasılığı o şehrin değil, oyuncunun **TÜM şehirlerindeki tapınakların toplamı** (`battle.handlers.ts:498-505`, 28/28 ölçülmüş binary sabiti). Dirilme süresi tarafı ✅ o şehrin tapınağı. `extra`'ya yazıldı. |
| **Baraka** | ✅ eğitim hızı. Eksik: seviye aynı zamanda **eşzamanlı sefer ve sipariş sayısını** da sınırlıyor (`queue.service.ts:178`). |
| **Kale** | ✅ ×10 bütçe. Eksik: Kale'nin kendisi ile Sur/Büyü Kalkanı bütçeyi **tüketmiyor**. |
| **Mağara** | ✅ alan bazlı süre, kaynak depolanmaz, savunmaya katılmaz. Eksik: yıkılan mağaranın onarım süresi **bizde seviyeyle kısalıyor** (oyunun kendi dokümanı sabit 24 saat diyordu; bilerek değiştirildi). |
| **Çiftlik · Maden** | ✅ birebir. Eksik: ikisi **40. seviyeye** çıkıyor (diğerleri 20'de duruyor). |
| **Akademi · Teleport** | ✅ birebir, ekleyecek bir şey yok. |

### ⛔ `Tooltip`e dokunma desteği eklenmesi de geri alındı

Açıklamaları telefonda göstermek için `Tooltip`e dokunmatik açma eklenmişti ve **oyundaki bütün
ipuçlarını bozdu**: ipucu bir kez açılınca kapanmıyor, fare çekilse bile ekranda kalıyordu.

⚠️ **Sebep — ders niteliğinde:** dokunmada gelen sahte `mouseleave`'i elemek için
`e.nativeEvent.detail === 0` koşulu yazılmıştı. `MouseEvent.detail` **tıklama sayacıdır** ve
`mouseleave`/`mouseenter` olaylarında **her zaman 0**'dır — yani koşul sahte olayları değil
**gerçek fare çıkışlarının hepsini** yutuyordu. Bileşen tur öncesi hâline döndürüldü:
yalnız `mouseenter`/`mouseleave` + `focus`/`blur`.

⚠️ Bir olay alanını "sahte olayı ayıklamak" için kullanmadan önce o alanın o olay türündeki
**gerçek** değeri okunmalı; `detail` burada hiçbir zaman ayırt edici değildi.

⛔ **Kale simgelerindeki ipucu da iptal** (kullanıcı, aynı gün): şeritte ad ve koordinat zaten
simgenin ALTINDA yazılı, ipucu aynı bilgiyi tekrarlıyordu. Artık hover'da hiçbir şey olmuyor;
tıklama şehri değiştirir. `aria-label` kalıyor (ekran okuyucunun tek erişim yolu).

## 9.2e ⭐ SAVAŞ SİMÜLATÖRÜ — sözleşmenin tamamı (kullanıcı, 2026-08-02)

İlk sürüm yalnız birim adetlerini soruyordu; **teknikler, kahramanlar, tapınak ve gece görüşü
`contracts/simulate.ts`te ZATEN VARDI ama forma konmamıştı**. Kullanıcının ölçütü binary araç
(`Mobiwar Simulator v0.5.5`) ve `docs/arsiv/index.html`; ikisi de bu alanları soruyor.

| Girdi | Yer | Not |
| :-- | :-- | :-- |
| Birim adetleri + **birim birim KALAN** | Savaşçılar / Savunma yapıları tabloları | Motor `SideResult.counts` ile bunu hep döndürüyordu, ekran basmıyordu. Savunma tabanının geri getirdiği birimler `+N` olarak yeşil |
| 8 savaş tekniği × 2 taraf | Teknikler | `stat: null` olanlar (Casusluk, Haritacılık, Sömürgecilik, Gece Görüş) listede YOK — savaş statına dokunmuyorlar |
| Taş Ustalığı | yalnız SAVUNAN | `techs.ts:52` yalnız Okçu Kulesi/Mangonel/Balista/Sur'u ölçekliyor; saldırandaki kutu etkisiz olurdu, binary araç da çizgiyle geçiyor |
| 0-5 kahraman × (seviye + 4 yetenek) | Kahraman panelleri | Puan sayacı `toplam/3×seviye`; **aşım ENGELLENMEZ**, yalnız kırmızı gösterilir (aşağıya bak) |
| Tapınak toplamı + mevcut kahraman | Kahraman panelinin altı | Savaşa girmez, **yalnız kazanan tarafta** kahraman çıkma ihtimalini belirler (`combat.ts:709`) |
| Gece savaşı + gece görüşü × 2 | Gece savaşı paneli | Teknikler tablosuyla aynı sütun düzeninde; gece kapalıyken kutular pasif |

**Sonuçta:** kazanan · süre · iki tarafın kaybı ve kalanı · **savaş ganimeti** altın/yemek ·
kahraman için deneyim · kahraman çıkma ihtimali · taşıma kapasitesi · kahraman durumu
(% veya «Yok Edildi»).

⚠️ Sur ve Büyü Kalkanı «Kalan» sütununda **adet değil bütünlük %** gösterir — seviyeleri
düşmez, savaş sonrası onarılırlar. Bu yüzden sonuç kutularında **ayrıca gösterilmiyor**.

Ölçüldü (dünya 1, canlıya dokunmadan): T=40 · K=0 · XP=1891 → **%18,91**; formül
`(40×10 − 0) × min(1, 1891×0,000025)` ile birebir.

⚠️ Ekranın tepesindeki açıklama metni kullanıcı isteğiyle **kaldırıldı** — *"ekstradan öyle
kalabalık yaratacak bilgiler yazmana gerek yok"*. Menü simgesi `assets/menu/simulator.png`.

### 9.2e.1 Kahraman puan aşımı serbest (2026-08-02)

`contracts/simulate.ts`teki `.refine()` **silindi**. Simülatör "ya seviye 5 kahramana 40 puan
verseydim" sorusunu sorabilmeli; kaynak harcamıyor, durumu değiştirmiyor.

⚠️ **Gerçek kural yerinde duruyor ve zaten başka bir yerdeydi:** `hero.controller.ts:161-163`
yetenek dağıtımını `seviye × pointsPerLevel` ile sınırlıyor. Refine yalnız iki **önizleme**
ucunu bağlıyordu (`/simulate` ve admin denge önizlemesi); **gerçek savaş bu şemadan hiç
geçmiyor** — `battle.handlers.ts:92-113` `SimulateInput`ı DB satırlarından elle kuruyor.
Yani gevşetmenin oyuna hiçbir etkisi yok.

### 9.2e.2 Ganimet ayrımı — motor zaten izole (kullanıcının sorusu)

Kullanıcı motorun rakibin şehir ganimetini hesaba katıp katmadığını sordu. **Katmıyor:**

- `SideInput` (`engine/src/types.ts:18-30`) yalnız `counts · tech · heroes · temple ·
  heroCount · wallIntegrity` taşıyor; altın/yemek/şehir alanı **yok**.
- `debris()` (`combat.ts:545-563`) yalnız ölen birim × katalog maliyeti. `combat.ts`,
  `loot.ts`'i **import bile etmiyor**.
- Şehir kaynağı tek yerden giriyor: `battle.handlers.ts:126-134` `readCityResources` →
  `calculateLoot({ debris, cityResources, … })`; havuz `loot.ts:108`te toplanıyor.

Yani görev dağılımı (motor = yalnız savaş ganimeti, çağıran kod = havuz + taşıma oranı) kodda
zaten kurulu. Değişen tek şey **etiket**: «Enkaz altını» → «Savaş ganimeti · altın», altına
gerçek savaşta havuzlandığını söyleyen bir satır.

### 9.2e.3 Seed ekranda yok, cihazda (kullanıcı kararı)

Seed gösterilmiyor; her koşudan sonra **girdilerle birlikte** `localStorage['mw-sim-last']`e
yazılıyor. «Son savaşı yükle» düğmesi formu geri doldurup **aynı seed'le** koşturuyor →
birebir aynı sonuç. Ardından «Savaştır» yeni rastgele seed üretiyor.

⚠️ **Seed'i istemci üretiyor.** Sunucu kendi ürettiğinde `repeat > 1` için `${seed}:${i}`
türetiyor (`simulate.controller.ts:40-43`) — dönen tek sayı bir SETİ tekrar oynatmaya
yetmezdi. Taban seed'i istemci gönderince sunucu aynı türetmeyi yapıyor ve set tekrarlanıyor.

⚠️ `localStorage` elle düzenlenebilir; okurken `v` alanı + tip kontrolü yapılıyor, bozuk kayıt
sessizce yok sayılıyor.

⭐ **Ölçüm sırasında öğrenilen:** motorda zar yalnız **tuzak tetiklenmesi ve onarım ruloları**
gibi dallarda dönüyor. Saf savaşçı-savaşçı savaşı **deterministik** — 6 koşu birebir aynı
çıkıyor. Tuzak eklenince aynı ordu 191/192/194/185/184/197 veriyor. "Aynı sonuç geldi, seed
çalışmıyor" diye rapor edilmeden önce bu bilinmeli.

---

## 9.3 ⭐ MİSAFİR MODU — zemin (kullanıcı, 2026-08-02)

Hesabı olmayan ziyaretçi ana sayfa + simülatör + yardım görebilecek (§10.x'te tamamlanıyor).
Bu bölüm **zemini** anlatıyor: görünür hiçbir değişiklik içermeyen ama en riskli olan kısım.

### 9.3.1 Sağlayıcı sırası değişti

`QueryClientProvider` · `OfflineBanner` · `ConfirmProvider` · `BrowserRouter` artık **oturum
dalının ÜSTÜNDE**; oyuna özgü olanlar (`MaintenanceCurtain`, `ActiveCityProvider`,
`NotifyProvider`, `ChatProvider`, `Shell`) `AuthedLayout` adlı **pathless layout rotasına**
indi. Üçü de mount olur olmaz oturum isteyen istek attığı için misafir ağacında mount
olmamaları şart.

⭐ **Yan kazanç — iki gerçek hata kapandı.** `EMAIL_PATHS` eskiden router yerine
`window.location.pathname` okuyup erken dönüyordu ve o dalın `<Routes>`'unda **catch-all
yoktu**: `EmailActions.tsx:62,73` «Oyuna dön» (`navigate('/armies')`) ve `:115` jetonsuz şifre
sıfırlamanın `navigate('/')` çağrısı hiçbir rotayla eşleşmiyor, ekran **bomboş** kalıyordu.
Üçü artık gerçek rota; ölçüldü, düzeldi.

### 9.3.2 Oturum reaktif oldu

`useSession()` (`lib/hooks.ts`) — `useSyncExternalStore(onSessionChange, getSession, getSession)`.
`getSession()` modül değişkeni okuduğu için reaktif değildi; giriş/çıkış artık sayfa
yenilemediğinden sorguların kendiliğinden açılıp kapanması buna bağlı.

⚠️ Kanca `api.ts`te **değil** `hooks.ts`te: `api.ts` çerçeveden bağımsız düz bir modül ve öyle
kalmalı (Flutter istemcisi de aynı sözleşmeyi okuyacak).

### 9.3.3 Sorgu kapısı — misafirde sıfır istek

`queries.ts`teki `useAuthed()` dokuz kancaya `enabled` olarak bağlandı (`cities`, `account`,
`city`, `catalog`, `missions`, `messages`, `world-state`, `alliance`, `chat`).

| Ölçüm | Önce | Sonra |
| :-- | :-- | :-- |
| Misafir, 45 sn | ~10 istek/dk (hepsi 401) | **0 istek** |
| Oturumlu, 70 sn | — | 9 istek (`world/state` ×3, diğerleri ×1) — beklenen ritim |

Bayat `mw-active-city` bilerek bırakılarak ölçüldü: `useCity`nin eski `cityId != null` kapısı
misafirde 401 üretiyordu, artık üretmiyor.

### 9.3.4 ⚠️⚠️ KANCA `&&`'İN SAĞINA YAZILMAZ — bu turda yaşandı

İlk yazımda `enabled: cityId != null && useAuthed()` vardı. JavaScript `&&`'i **kısa devre**
yapıyor: `cityId` null iken `useAuthed()` hiç çağrılmıyor, dolunca çağrılıyor → **kanca sırası
değişiyor** → React `SideMenu`'yü çökertiyor ve **ekran bembeyaz kalıyor**. Konsol
"change in the order of Hooks" diyordu.

Doğrusu: kanca önce koşulsuz çağrılır, sonuç sonra koşula girer.
```ts
const authed = useAuthed();
return useQuery({ …, enabled: cityId != null && authed });
```

### 9.3.5 Çıkışta önbellek temizliği

`onSessionChange` aboneliği oturum düşünce `queryClient.clear()` + `mw-active-city` siliyor.
Router artık remount olmadığı için temizlenmezse aynı sekmede başka hesapla girildiğinde
öncekinin şehirleri bir an görünürdü. Abonelik `api.ts` üzerinden olduğu için **başarısız
refresh** de (`setSession(null)`) kapsanıyor — yalnız menüden çıkış değil.

Ölçüldü: iki tam çıkış→giriş döngüsü, sayfa yenilemesi yok, **sıfır konsol hatası**, adres
korunuyor (`/armies`'te çıkıp giren `/armies`'te kalıyor).

### 9.3.6 Misafir kabuğu ve giriş modalı

**`components/GuestShell.tsx` (YENİ)** — üst bar (logo · Simülatör · Yardım · Giriş yap ·
Kayıt ol), tek sütun içerik, küçük footer (Yardım · Hesap silme). Misafir başlığını da o
yönetiyor (`InfoBar` mount olmuyor).

⚠️ **Neden `Shell`i "oturum bilir" yapmadık:**
1. **Kancalar koşullu olamaz.** `SideMenu` ve `BottomBar` ilk satırlarında `useMessages` /
   `useChatConversations` / `useMovements` / `useActiveCity` / `useCity` çağırıyor; "oturum
   varsa çağır" mümkün değil, yine iki ayrı bileşen gerekirdi.
2. Misafir düzeni alt küme değil **farklı bir düzen**: üst bar var, sol menü/sağ panel/alt bar
   yok. Ortak kod ~26 satırlık kancasız bir ızgara.
3. Asıl risk oturumlu deneyimin bozulmasıydı; bu yaklaşımda **`Shell.tsx`in diff'i tek kelime**
   (`MenuIcon` export edildi).

**`components/AuthModal.tsx` (YENİ)**, `screens/Auth.tsx` **silindi**. `GuestShell` modalı tek
örnek olarak tutuyor; `useAuthModal()` ile her misafir ekranından açılıyor (üst bardaki düğme
ile ana sayfadaki düğmeler aynı örneği açar).

| Tuzak | Karar |
| :-- | :-- |
| `Modal`ın `footer`ı `children`ın KARDEŞİ (`Modal.tsx:87`) | `footer` **kullanılmıyor**; form bütünüyle `children` içinde, yoksa `type="submit"` form dışında kalır ve Enter çalışmaz |
| Mod değiştirme düğmeleri | `<form>`ün **dışında** ve `type="button"`; içeride olsalardı varsayılan `submit` ile giriş denerlerdi |
| `onDone` geri çağrısı | **Yok.** `login()`/`register()` zaten `setSession()` çağırıyor, `App` abone; ağaç kendiliğinden devrediyor |
| Kullanıcı adı `pattern` | **Konulmuyor** — `[A-Za-z0-9]+` sunucunun `\p{L}\p{N}`siyle çelişip "Ayşe"yi engelliyordu |
| Şifremi unuttum metni | Hesap sızdırmaz dilde ("bu adres kayıtlıysa…") korunuyor |

**Rota tablosu (misafir):** `/` → `Landing` · `/simulate` · `/help` · üç e-posta rotası (kabuk
dışında) · `*` → `/`. Oturumlu tablo değişmedi.

Ölçüldü: misafir olarak savaş çevrilebiliyor ve **giden tek istek `/api/v1/simulate`**;
modal açıkken giriş olunca modal ve misafir barı kalkıp oyun kabuğu geliyor, **adres korunuyor**
(`/simulate`'te giren `/simulate`'te kalıyor), sıfır konsol hatası; oturumlu `/` → `/armies`,
misafir `/armies` → `/`; mobil 375px'te yatay kaydırma yok.

⚠️ Misafir `/world/5/5` gibi bir derin bağlantıyla gelirse catch-all onu ana sayfaya alıyor ve
**adres hatırlanmıyor**. Bilinçli: "giriş sonrası oraya dön" ayrı bir iş.

### 9.3.7 Hız sınırı — yalnız kimliksiz uçlar

Misafir modu simülatörü kimlik doğrulamasının dışına çıkardı. `POST /api/v1/simulate` gerçek
savaş motorunu koşturuyor ve tek istekte `repeat` ile 50 savaş çevirebiliyor; API'de o güne
kadar **hiçbir yerde hız sınırı yoktu** (`Throttle|rate.?limit|helmet` → 0 eşleşme).

`apps/api/src/auth/rate-limit.ts` — IP başına sabit pencere sayacı, `APP_GUARD` olarak global
kayıtlı ama **dar bir listede** iş yapıyor:

| Yol | Kova | Varsayılan (60 sn) |
| :-- | :-- | :-- |
| `POST /api/v1/simulate` | `simulate` | 30 |
| `POST /api/v1/auth/login` · `/register` · `/forgot-password` | `auth` | 10 |

⚠️⚠️ **Oyunun içindeki (kimlikli) trafiğe UYGULANMAZ.** Sınır IP başına; oyun istemcisi
dakikada onlarca istek atıyor ve aynı IP'yi paylaşan iki oyuncu (ev, okul, mobil NAT)
birbirini kilitlerdi. Bu yüzden kural **"yalnız şunları sınırla"**, "her şeyi sınırla gerekeni
muaf tut" değil.

⚠️ **Neden guard, interceptor değil:** sayaç `AuthGuard`tan **önce** işlemeli ki parola deneme
saldırısı argon2 doğrulamasını hiç tetiklemesin. (Bakım kilidi tam tersi sebeple interceptor —
o kimliğin hazır olmasını istiyor.)

⚠️ Sayaç **süreç belleğinde**. `ROLE=all` tek süreç profilinde doğru; çok süreçli dağıtımda
her sürecin kendi sayacı olur → gerçek sınır süreç sayısıyla çarpılır. O gün paylaşımlı sayaç
gerekir; bugün ikinci bir altyapı bağımlılığı istemiyoruz (§4.0).

⚠️ Sabit pencere (kayan değil): pencere sınırında kısa süreliğine iki katı isteğe izin verir.
Kötüye kullanımı yavaşlatmaya yeter, akıl yürütmesi basit.

**Ölçüldü (canlı API'ye karşı):** `/simulate` → 30 × 201, sonra 429; `/auth/login` → 10 × 401,
sonra 429 (kovalar ayrı); `GET /api/v1/cities` → **25 istek, hiç 429 yok** (oyun trafiği
dokunulmamış). 429 gövdesi: `{"code":"rate_limited","message":"… 29 saniye sonra tekrar
dene.","retryAfter":29}`. Ayrıca 10 birim testi (`test/rate-limit.test.ts`).

Limitler panelden: `ratelimit.enabled` · `windowSeconds` · `simulate` · `auth`.

### 9.3.8 Ölü kod: `pruneOldSessions` silindi

`device-signal.service.ts`teki metodun **çağıranı yoktu** ve mantığı da **yanlıştı**:
`created_at < now() - N gün` diyerek canlı oturumları da silerdi (dönmeli refresh her
yenilemede yeni satır açtığı için uzun süredir bağlı bir cihazın zinciri eskidir ama satırı
diridir). Doğrusunu Faz 8 temizlik görevi zaten yapıyor (`ops-jobs.ts`, `revoked_at`/
`expires_at`). Yerinde neden silindiğini anlatan bir yorum bırakıldı.

---

## 10. Web istemci

**Stack:** React 19 + Vite + TypeScript · **Tailwind v4** (onay) + Radix primitives (erişilebilir,
stilsiz) · **TanStack Query** (sunucu durumu, WS olayları cache'i patch'ler) · **Zustand** (küçük yerel
durum) · React Hook Form + zod · React Router · PWA (service worker → web push + offline kabuk).
Tasarım sistemi **`packages/design-tokens`** tek kaynağından gelir (gece/gündüz + antik palet,
§13.13); Tailwind v4 `@theme` bloğu bu token'ları CSS değişkeni olarak alır, Flutter aynı dosyadan
üretilen `tokens.dart`'ı kullanır. Bileşenler `packages/ui` altında küçük ve yeniden kullanılabilir.

**Navigasyon — alt bar (5 sekme), web + mobil aynı:**

> ⚠️ **Ekran adları orijinalle hizalandı (2026-07-26, `g.java` menü tablosundan — bkz.
> `MOBIWAR_MIMARI_RAPOR.md` §2b).** İki sapma düzeltildi: (1) orijinalde **"Tapınak" diye bir ekran
> YOK** — tapınağın işlevi `Kahramanlar` ekranından kullanılıyor; (2) **"Komuta Merkezi"** diye bir
> ekran VAR ve bizde yoktu (ordu görev/oluştur/gelen ordu onun evi). Alt bar 5 sekme bizim modern
> uyarlamamız; sekme **içerikleri** artık orijinalin adlarını kullanıyor.

| Sekme | İçerik (orijinal ekran adlarıyla) |
|---|---|
| **Şehir** | Şehir seçici + iç sekmeler: **Yapılar · Baraka · Savunma · Akademi · Mağara** |
| **Komuta Merkezi** | Ordu Oluştur · Ordu Görev · Ordular · **Gelen Ordu** · Görev İptal · geri sayımlar |
| **Dünya** | Harita/koordinat gezinme, hedef seç → Saldırı/Nakliye/Destek/Casusluk/Şehir Kur/Teleport · Dünyada Bul |
| **Mesajlar** | Raporlar + mesajlar (filtre: Sadece Mesajlar / Sadece Raporlar / Hepsini Göster), rozet sayacı |
| **Daha Fazla** | **Kahramanlar** (Dirilt · Seviye Arttır · Özellikler) · İttifak · **Sıralamalar** (Oyuncuya/İttifağa/**Kahramana** göre) · Genel Durum · **Simülatör** · Arama · Üyelik · Ayarlar · Yardım |

⭐ **Uygulanan alt bar (2026-08-01):** `Ordular · Şehir · Dünya · Mesaj · Komuta` **+ «Daha»**.
«Komuta» eklendi çünkü mobilde Komuta Merkezi'ne **doğrudan hiçbir bağlantı yoktu** — oysa
sıralamalar, ittifak ve arama orada oturuyor. «Daha» artık bir rota değil **yukarı açılan
liste**: `Simülatör · Seçenekler · Yardım · Çıkış Yap` (çıkış onaydan geçer). Eskiden doğrudan
Seçenekler'i açıyordu ve **Yardım mobilde hiç erişilemiyordu**; Simülatör de listeye konmasaydı
telefonda ekrana giden hiçbir yol kalmazdı.

- Üstte **kalıcı kaynak çubuğu**: aktif şehir seçici, altın/yemek + saatlik hız, alan kullanımı,
  bekleyen görev/mesaj rozetleri, **tema düğmesi** (gündüz/gece/sistem — §13.13).

  ⭐ **Çubuk 3 bölgeli grid** (kullanıcı, 2026-08-01 — *"altın yemek bilgilerinin olduğu yeri
  sabit yapalım"*). Eski `flex + justify-center` düzeninde 6.000.000 kaynaklı şehirden 500
  kaynaklı şehre geçince sayının genişliği değişiyor, ortalama yeniden hesaplanıyor ve **tüm
  içerik zıplıyordu**. Yeni düzen:

  | Kırılım | Sütunlar | Neden |
  | :-- | :-- | :-- |
  | `sm` ve üstü | `minmax(0,1fr) auto minmax(0,1fr)` | Kenarlar EŞİT ağırlıkta → orta hücre kenar içeriğinden bağımsız **tam ortada** (ölçüldü: 1280px'te sapma 0 px) |
  | Mobil (< 640px) | `auto 1fr auto` | 375px'te sol bölge 9 haneli iki sayı için ~192px istiyor, eşit paylaşım 138px veriyordu ve **rakamlar şehir adının üstüne biniyordu**. Dar ekranda dead-center'dan vazgeçilir, çakışmadan vazgeçilmez |

  ⚠️ Sabit genişlik sınırı **sayının kendi kutusuna** yazılır (`Res`in `numClass` alanı), dış
  kutuya değil: dıştaki `min-w` ikonu da kapsadığı için sayı yine taşıyordu. `tnum`
  (`tabular-nums`) sayesinde `ch` birimi burada gerçekten sabit genişlik demek.
  **Ölçülen sonuç:** 9.000.000 ↔ 500 geçişinde orta bölgenin kayması hem 375px'te hem
  1280px'te **0 piksel**.
- "Daha Fazla" sekmesi = az kullanılan sayfaların evi; mobilde tam ekran liste, geniş ekranda sol panel.
- Geri sayımlar tek bir `useServerCountdown` hook'undan (sunucu saati offset'i ile) beslenir.
- **Sohbet rotası YOK**: her ekranın üstünde duran yüzen sohbet düğmesi (okunmamış rozetiyle)
  bottom sheet açar; sheet üç sekmelidir (Genel · İttifak · Özel) ve arkadaki oyun ekranı görünür
  kalır (§13.12.5). Derin bağlantı gerekirse yalnız `?chat=alliance` sorgu parametresiyle.

---

## 11. Konfigürasyon & dosya sistemi

- **Katalog/denge verisi kodda** (`packages/catalog/*.json`), sürümlü ve **hash'li**. Canlıda elle
  değiştirilmez; değişiklik = yeni sürüm + migration notu. Aktif hash `worlds` tablosunda tutulur.
- Oyun **ayarları** (hız çarpanı, saldırı limiti, bakım mesajı) DB'de `world_config` (JSONB) — yeniden
  deploy gerektirmeden değişir, her değişiklik audit_log'a düşer.
- **Statik varlıklar** (ikon/görsel) CDN veya `apps/web/public`, içerik-hash'li dosya adı.
- **Yüklenen içerik yok** (avatar vb. şimdilik) → dosya depolama gereksinimi minimal; ileride S3 uyumlu.
- Savaş raporları **DB'de** (JSONB), dosyada değil.

---

## 12. Yol haritası (fazlar + çıkış kriterleri)

**Faz 0 — İskelet (1 adım)**
Monorepo (pnpm + turbo), `packages/engine` **v0.6 senkronu** (seed'li RNG + mevcut 25+ senaryo testi
+ **savunma tabanı §13.11.10**), `packages/catalog` JSON (**İngilizce `id`'ler, §13.14**),
`packages/contracts` iskeleti, **`packages/design-tokens` (gece/gündüz palet + üreteç, §13.13)**,
CI (lint+test+**kontrast testi**), docker-compose (pg+redis).
*Çıkış: `pnpm test` yeşil, motor TS'te JS ile birebir, `tokens.css` + `tokens.dart` üretiliyor.*

**Faz 1 — Zaman ve görev omurgası (en kritik faz)**
`worlds` + oyun saati, `missions` tablosu, scheduler döngüsü, handler kaydı, outbox + dispatcher,
bakım modu (pause/resume), audit_log, metrikler. Sahte bir görev tipiyle (`echo`) uçtan uca test:
*Çıkış kriteri: worker'ı savaşın ortasında öldür → tekrar başlat → görev kaybolmadan, çift çalışmadan,
doğru sırayla tamamlanıyor. Bakıma al → 1 saat bekle → aç → geri sayımlar 1 saat ötelenmiş.*

**Faz 2 — Dikey dilim (MVP)**
Auth → **başlangıç kesesiyle** ilk şehir (§13.11.1a) → şehir durumu (lazy kaynak) → bina/teknik/birim
kuyruğu → ordu gönder (saldırı) → **savaş çözümü** → rapor + bildirim → ganimet dönüşü. Web'de bu
akışın ekranları (alt bar 5 sekme, minimum), **gece/gündüz teması uygulanmış** (§13.13) ve
**Genel Sohbet** (§13.12) — beta geri bildirimi ilk günden buradan akmalı.
Ayrıca **çoklu hesap sinyal TOPLAMA katmanı** (§9.1.2): `device_id` sözleşmesi, `player_devices`,
`player_ips`, genişletilmiş `sessions`. *Analiz Faz 4'te — ama veri bugünden birikmeye başlamalı,
çünkü geçmiş sonradan toplanamaz.*
*Çıkış: iki gerçek hesap, gerçek saldırı, doğru rapor, offline oyuncuya push, çalışan Genel Sohbet,
**dünya yalıtımı regresyon testi yeşil** (§13.12.1b).*

**Faz 3 — Oyun yüzeyi tamamlama**
Dünya/harita + mesafe-süre formülü, nakliye/destek/casusluk/şehir kurma/teleport, mağara, kahraman
ekranları, dahili simülatör sayfası, sıralama/genel durum, rapor kutusu + **özel mesaj (DM) kanalı**.

**Faz 4 — İttifak & sosyal** — ittifak kurma (**Kale ≥ 5**, §13.15) / üyelik / yetkiler +
**ittifak sohbeti** (§13.12) + **çoklu hesap ANALİZÖRÜ** (`abuse_scan` görevi + rapor e-postası,
§9.1.3 — toplama Faz 2'de kuruldu, eşikler gerçek veriyle burada ayarlanır) ·
**Faz 5 — Flutter** (aynı token'lar + aynı sohbet sözleşmesi) · **Faz 6 — Denge, premium, sezon/etkinlik**

---

## 13. Kontrol listesi (savaş motoru tarafı, plana dahil edilenler)

- [x] **Kahraman modeli yeniden kalibre edildi (2026-07-26):** yetenek etkisi lineer→**üssel**
      (×1,18/puan), yetenek→stat eşlemesi binary'den çözüldü, **3 puan/seviye** kuralı eklendi,
      katkıya %50 tavan kondu. Ayrıntı §13.11.4c. **Kalan:** yüksek puanlı ölçüm (Y1-Y5) sonrası
      tavanın gevşetilmesi · iki-taraflı kahraman senaryosu.
- [ ] Kuşatma bonusu (Mancınık/Ogre → sur/yapı) — Faz 3.
- [ ] Mağara + cüce yıkma mekaniği (kullanıcı verisi gelince) — Faz 3.
- [ ] Gece savaşı ~%15 over-kill artığı — Faz 3.
- [ ] Seed'li PRNG'ye geçiş — **Faz 0 (zorunlu)**.
- [ ] **Savunma tabanı (her tipten min 4) + net-kayıp enkaz zinciri** (§13.11.10) — **Faz 0 (zorunlu)**.
- [x] ~~Ganimet öncelik sırası: enkaz → kalan kapasiteyle yağma~~ → **HAVUZ modeliyle değişti**
      (§13.10.4, 2026-07-30): kasa+enkaz tek havuz, kaynak başına oran, kapasite kırpması. Sıra kavramı kalktı.
- [ ] Harita mesafe/hız/Haritacılık formülü — Faz 3 başında ayrı tasarım oturumu.

---

## 13.5 ⭐ HARİTA & SEFER SÜRESİ MODELİ (2026-07-25 — çözüldü)

Referans uygulama: `harita.html` (interaktif cetvel, sabitler oynatılabilir). Sunucuda
`packages/engine/travel.ts` olarak yaşayacak; istemci aynı fonksiyonu **yalnız önizleme** için kullanır,
otorite `arrival_at` yazan sunucudur.

### 13.5.1 Mesafe — kademeli/toplamalı
```
D = Δşehir + U·Δdiyar + W·Δkıta          U = 20, W = 4000
```
- **Toplamalı (Manhattan), Öklid değil:** her koordinat basamağındaki fark süreye mutlaka yansır;
  "1 kıta + 200 diyar" ile "1 kıta" aynı sonuca inmez. Haritada rota bu yüzden L biçiminde çizilir.
- **Hiyerarşi sabitlerden çıkar:** 1 kıta = 200 diyar. Aynı kıtadaki rastgele iki şehrin ortalama
  farkı ~167 diyar olduğundan **kıtalar arası sefer tipik olarak en uzun**, aynı diyar içi en kısadır —
  dokümandaki sıralama sağlanır.
- **Numaralandırma = uzaklık:** Δ arttıkça süre daima artar; oyuncu koordinata bakıp mesafeyi tahmin
  edebilir. (Travian tarzı 2B ızgara bu özelliği bozduğu için elendi.)
- ⚠️ Eski `harita.html` modelinde `W=300`, diyar aralığı `10` idi → kıta atlaması yalnız 30 diyara
  bedeldi, yani kıtalar arası sefer çoğu zaman kıta-içi seferden KISA sürüyordu. Düzeltildi.

### 13.5.2 Süre
```
T = TABAN(görev) + K · D^p · (100 / v) / (1 + 0,05 · Haritacılık)
K = 600, p = 0,46, TABAN_ordu = 10 dk, TABAN_casus = 2 dk, TAVAN = 18 sa
v = ordudaki EN YAVAŞ birimin hızı (kahraman orduyu hızlandırmaz)
```
- **Haritacılık = hız çarpanı** `(1 + 0,05·L)` — dokümanın "hızını %5 arttırır" ifadesinin birebir
  karşılığı. Süre cinsinden azalan getiri: L=10 → −%33, L=20 → −%50. Üst sınır yok (maliyet 1,4^L
  doğal tavanı koyar). *(Alternatif `1/(1−0,05L)` modeli L=20'de sonsuza gittiği için elendi.)*
- **`p` sıkıştırma:** mesafe 100× artınca süre ~8× artar; olmasa uzak seferler günlerce sürerdi.
- **Dönüş aynı süre.** Görev tipi süreyi değiştirmez (saldırı = destek = nakliye).

### 13.5.3 ⭐ Taban süre: baskın–savunma dengesinin ayar vidası
**TABAN, Haritacılık'tan ETKİLENMEZ ve mesafeden bağımsızdır.** ("Orduyu toplayıp yola çıkarmak.")
Bu tek karar, kullanıcının sorduğu senaryoyu çözer:

| Cüce ile komşu şehir | Haritacılık 0 | Haritacılık 15 | kazanç |
|---|---|---|---|
| süre | **20 dk** | **15 dk 43 sn** | −%21 |

| Cüce ile 200 diyar / 1 kıta | Haritacılık 0 | Haritacılık 15 | kazanç |
|---|---|---|---|
| süre | **7 sa 43 dk** | **4 sa 29 dk** | −%42 |

→ **Haritacılık bir sefer tekniğidir, baskın tekniği değil.** Yatırım yapan oyuncu uzak mesafede iki kat
kazanır, komşusunu gafil avlamada neredeyse hiçbir avantaj elde etmez. Taban süre olmasaydı, yüksek
haritacılıklı oyuncunun komşuya saldırısı 5 dakikaya düşerdi ve savunma diye bir şey kalmazdı.

**Sürpriz ölmez, ama kör talih olmaktan çıkar.** Kullanıcının senaryosu (gece yarısı yan parsele şehir
kurup hemen saldırma) hâlâ mümkün ve meşrudur — oyunun ruhu budur. Onu adil kılan üç ek kural:
1. **Taban süre 20 dk** (bu bölümün konusu): Haritacılık'tan etkilenmeyen bu taban, savunmacıya
   her hâlükârda bir pencere verir. ⭐ 2026-07-31'de içerik gizliliği kalkınca dengenin ana
   vidası buraya taşındı — eskiden "birleşim gizli" de bir denge ayağıydı.
2. **Gelen ordu görünür** (orijinalde de vardı: `g.java` "Gelen Ordu") → varış saati, kaynak şehir
   **ve tam döküm** (§13.10.1). Bu bilgi savunmacıyı zayıflatmaz, kararını **bilinçli** kılar:
   "körlemesine mağaraya kaç" refleksi yerine "bu orduya karşı savunmam yeter mi" hesabı gelir.
   **Push bildirimi anında gider** ("Şehrine 3.000 Cüce geliyor · varış 03:42").
3. **Savunma çevrimdışı çalışır:** sur, kule, tuzak, muhafız zaten sen uyurken savaşır. Oyunun savunma
   yatırımı tam olarak bu senaryo için vardır.

### 13.5.4 Koruma kuralları (kullanıcı kararı, 2026-07-25)
- **Yeni hesap: 72 saat başlangıç koruması.** Oyuncu birine saldırırsa koruma ANINDA düşer.
- ~~Yeni kurulan şehre 12 saat saldırı yasağı~~ → **REDDEDİLDİ** (kullanıcı): stratejiyi bozuyor.
  Koloni kurup hemen saldırmak meşru bir hamledir; dengeyi taban süre + başlangıç koruması sağlar.
- Mevcut kurallar korunur: bir şehre 24 saatte en fazla 3 saldırı; tatil modu koşulları.

### 13.5.5 Örnek cetvel (Haritacılık 0)
| Rota | D | Cüce (100) | Süvari (140) | Kaos (80) | Casus Kuş |
|---|---|---|---|---|---|
| aynı diyar, komşu şehir | 1 | 20 dk | 17 dk | 22 dk | 2 dk 10 sn |
| aynı diyar, en uzak | 9 | 37 dk | 30 dk | 44 dk | 2 dk 27 sn |
| komşu diyar | 20 | 50 dk | 38 dk | 60 dk | 2 dk 40 sn |
| 10 diyar | 200 | 2 sa 04 dk | 1 sa 31 dk | 2 sa 33 dk | 3 dk 54 sn |
| 50 diyar | 1.000 | 4 sa 09 dk | 3 sa 01 dk | 5 sa 09 dk | 6 dk |
| komşu kıta / 200 diyar | 4.000 | 7 sa 43 dk | 5 sa 34 dk | 9 sa 37 dk | 9 dk 34 sn |
| 3 kıta ötesi | 13.400 | 13 sa 21 dk | 9 sa 35 dk | 16 sa 39 dk | 15 dk |
| zıt köşe | 45.989 | 18 sa (tavan) | 16 sa 47 dk | 18 sa (tavan) | 25 dk |

Casus kuş her yerde dakikalar mertebesinde ama asla anlık değil → keşif ucuz, sürekli, ama spam
edilebilir değil. Kaos en yavaş birim olduğu için Kaos'lu ordu daima geç varır (stratejik bedel).

### 13.5.6 Uygulama notları
- `worlds.speed_multiplier` süreyi böler (hızlı dünya seçeneği). Tüm sabitler `world_config`'te tunable.
- Süre **oyun saatinde** hesaplanır → bakım duraklatması varışları otomatik öteler (§2).
- Teleport: mesafe/süre yok (kendi şehirleri, bekleme süresi Teleport binası seviyesiyle kısalır).
- Şehir kurma görevinde hedef doluysa ordu geri döner (aynı süre) — doküman kuralı.
- Açık uç: yeni şehir kurma konum kısıtı (herkesin tek diyara yığılmasını engellemek için, ör. başkente
  en fazla N diyar) — denge oturunca karara bağlanacak.

---

## 13.6 ⭐ YERLEŞİM ALGORİTMASI (yeni oyuncu başkenti nereye kurulur?)

Kullanıcı isteği: 1. kıtanın erken diyarlarından başla · diyar başına en fazla 4-5 başkent · erken
safhada herkesi aynı diyara yığma ama birbirinden de koparma · dünya büyüdükçe geriye dönüp serpiştir.

### 13.6.1 Yapı
- Diyar başına **10 şehir yeri**. Bunların en fazla **`BAŞKENT_KOTA = 5`**'i *otomatik yerleştirme*
  ile yeni hesap başkentine verilir; kalan yerler serbesttir. **Koloniler için kota YOK** — oyuncu
  boş olan herhangi bir boş şehri seçebilir (§13.6.5). Kota yalnız otomatik yerleştirmeyi sınırlar,
  yani "yeni oyuncu akını tek diyara yığılmasın" amacına hizmet eder.
- Global diyar sırası: `g = (kıta−1)×500 + diyar` → 1..5000. Yerleşim g=1'den başlar, sağa büyür.

### 13.6.2 Yerleşim cephesi (açık bölge) — nefes payı sabit tutulur
```
açıkDiyar = clamp( ceil( oyuncuSayısı / (HEDEF_DOLULUK × BAŞKENT_KOTA) ), MIN_AÇIK, 5000 )
HEDEF_DOLULUK = 0.60      MIN_AÇIK = 8
```
Açık bölge oyuncu sayısıyla **orantılı** büyür ve doluluk hep ~%60'ta kalır: ne tıkış tıkış, ne hayalet.
Örnek: 3 oyuncu → 8 diyar · 100 oyuncu → 34 diyar · 1.000 → 334 · 5.000 → 1.667 diyar.
Açık bölge bir **önek** [1..açıkDiyar] olduğu için eski diyarlar **daima aday kalır** → "geriye dönüp
serpiştirme" ayrı bir mekanizma gerektirmez, doluluk ağırlığından kendiliğinden çıkar.

### 13.6.3 Aday skorlaması — üç çarpan
Açık bölgeden **rastgele 60 diyarlık örneklem** alınır (O(1) maliyet + kümelenmeyi kırar), her aday
için skor hesaplanır, sonra **ağırlıklı rastgele** seçim yapılır (deterministik "en iyi" değil — aksi
halde herkes aynı yere gider):

```
skor(d) = A(d) × B(d) × C(d)

A(d) = (1 − doluluk(d))^1.5                        // boş diyar tercihi
B(d) = exp( −(n(d) − 2)² / (2·1.2²) )              // KOMŞULUK: ideal 2 başkent
C(d) = 1 / (1 + (tehdit(d) / tehdit_ref)^1.5)      // GÜÇ UYUMU
```
- **B — Gauss komşuluk tercihi (bu tasarımın özü):** boş diyar (n=0) ağırlık 0,25; n=1 → 0,71;
  **n=2 → 1,00**; n=3 → 0,71; n=4 → 0,25. Yani yeni oyuncu **1-2 komşusu olan** diyara düşmeyi tercih
  eder. Sonuç: kimse ıssız çölde tek başına uyanmaz (hedef ve müttefik bulur), kimse 5 kişinin ortasına
  düşmez. Diyarlar doğal olarak 2-3 başkentte doyar, 5'e nadiren ulaşır.
- **C — güç uyumu (çoğu oyunda atlanan kısım):** `tehdit(d)` = d ve iki komşu diyarındaki oyuncuların
  **75. persentil puanı**; `tehdit_ref` = son 14 günde kayıt olmuş oyuncuların medyan puanı (taban
  değerle korunur). Böylece yeni oyuncu **kendi kuşağının yanına** düşer; 3 aylık bir devin bitişiğinde
  uyanmaz. Sert dışlama değil yumuşak ağırlık → dünya doyduğunda yine de yer bulunur.
- Sert filtreler (skorlamadan önce): boş başkent yeri var · dünya durumu uygun · diyar yasaklı değil.

### 13.6.4 Neden bu üçlü yeterli
| İstenen | Sağlayan |
|---|---|
| 1. kıtanın erken diyarlarından başla | açık bölge = [1..N] öneki |
| diyar başına max 4-5 başkent | `BAŞKENT_KOTA` sert sınır + A(d) yumuşak baskı |
| erken safhada tek diyara yığılmasın | `MIN_AÇIK = 8` + A(d) |
| birbirinden çok uzağa atmasın | B(d) Gauss (n*=2) — ıssız diyar cazip değil |
| kotayı erken doldurmasın | `HEDEF_DOLULUK = 0.60` (cephe oyuncu sayısıyla büyür) |
| büyüdükçe geriye serpiştirme | açık bölge önek olduğundan eski diyarlar hep aday; terk edilen şehir yerleri A(d)'yi yükseltir |
| adalet | tehdit uyumu C(d) |

### 13.6.5 Uygulama notları
- Seçim **tohumlu** (`hash(world_seed, player_id)`) → tekrar üretilebilir ve denetlenebilir.
- Yarış koşulu: şehir yeri `UNIQUE(world_id, k, d, s)` + `INSERT ... ON CONFLICT DO NOTHING`; çakışırsa
  bir sonraki aday denenir (en fazla 5 deneme, sonra örneklem yenilenir).
- **Koloni (sömürgecilik) şehri: KONUM KISITI YOK** (kullanıcı kararı, 2026-07-26). Oyuncu dünyadaki
  **herhangi bir kıtanın, herhangi bir diyarının, herhangi bir boş şehir yerinı** seçebilir.
  Tek koşullar: şehir yeri boş olmalı · Sömürgecilik/3 kadar şehir hakkı · en fazla 5 şehir.
  ~~başkente en fazla 60 diyar~~ ve ~~diyar başına koloni kotası~~ **KALDIRILDI**.
  > Dengeleyici zaten var: uzağa kurulan şehir **savunulamaz** — destek ve teleport dışında yardım
  > gitmez, sefer süresi saatlerce sürer (§13.5). Bu bir kural değil, oyuncunun bilinçli riski olmalı.
  > Yeni oyuncu yeri sıkışırsa yerleşim cephesi (§13.6.2) kendiliğinden yeni diyar açar; ek kural gerekmez.
- Tüm sabitler `world_config`'te (§13.7) → dünya bazında ayarlanabilir.

---

## 13.7 ⭐ DÜNYA SABİTLERİ (`world_config`)

Kullanıcı isteği: oyundaki **tüm** işlemler ayrı ayrı sabitlerle yönetilsin. Her dünya kendi
config'ini taşır (JSONB, sürümlü, her değişiklik `audit_log`'a düşer). Varsayılan = klasik x1.

### 13.7.0 ⭐ UYGULANAN HÂL — dört çarpan, hepsi 1 (kullanıcı, 2026-07-30)

JSONB config hâlâ gelecek işi; bugün fiilen çalışan model `worlds` tablosunda **dört tam sayı
çarpan**dır ve kullanıcı kararıyla **hepsi 1'e çekildi** (eski 3x/3x dünya dahil, migration 0018):

| Kolon | Neyi yönetir | Uygulandığı yer |
| :-- | :-- | :-- |
| `resource_multiplier` | Çiftlik/Maden üretimini çarpar | `city.service.materialize` |
| `speed_multiplier` | TÜM sefer sürelerini böler — casusluk ve **mağara-kaçış dönüşü dahil** | `travelSeconds` (march/attack) + `scheduleCaveEscape` |
| `training_multiplier` | Baraka + Savunma BİRİM üretim süreleri | `queue.service` (unit + defense adet şeridi) |
| `construction_multiplier` | Bina + Sur/Büyü Kalkanı seviyesi + Akademi teknikleri | `queue.service` (building/levelBased/tech) |

- **Çarpan DIŞI kalanlar** (kullanıcı): Sur onarımı, Mağara onarımı, mağara doldur/boşalt
  (şehir içi iş), teleport bekleme süresi.
- ⭐ Aynı turda kapanan hata: casus seferleri `spy: true` bayrağı geçirilmediği için ordu
  tabanıyla (600 sn) uçuyordu — kullanıcı onayıyla **kuş tabanına (120 sn)** çekildi; canlıda
  ölçüldü (~167 sn, eskiden ~647 olurdu). İstemci ETA önizlemesi de artık `speedMultiplier` +
  `spy` geçiriyor (3x dünyada 3 kat yanlış gösteriyordu).
- Bölme kesirli yapılır (yuvarlama YOK): birim-başına süreler `per_unit_seconds`'ta kesirli
  yaşar; çarpan 1'ken davranış bit-bit eskisiyle aynıdır (`queues.test.ts` kilitli).

> **Anahtarlar İngilizce** (§13.14 adlandırma kararı), açıklamalar Türkçe. Eski Türkçe anahtarların
> karşılıkları §13.14.3 eşleme tablosunda.

```jsonc
{
  "speed": {                          // çarpanlar: >1 hızlandırır
    "resourceProduction": 1.0,        // altın+yemek/saat
    "goldProduction": 1.0,            // yalnız altın (ince ayar)
    "foodProduction": 1.0,
    "buildingConstruction": 1.0,      // yapı süresi böleni
    "unitTraining": 1.0,              // baraka
    "defenseTraining": 1.0,           // mimar okulu kalemleri
    "techResearch": 1.0,              // akademi
    "marchSpeed": 1.0,                // yol süresi böleni (taban süre HARİÇ)
    "heroRevive": 1.0,
    "caveTransfer": 1.0,              // mağara doldur/boşalt
    "wallRepair": 1.0,
    "teleportCooldown": 1.0
  },
  "map": { // ⭐ boyutlar oyunun dokümanından: 10 kıta × 500 diyar × 10 şehir (§13.16.1)
           "continents": 10, "districtsPerContinent": 500, "citiesPerDistrict": 10,
           "oneIndexed": true,          // koordinatlar 1'den başlar (1:45:10)
           "districtWeight": 20, "continentWeight": 4000, "k": 600, "p": 0.46,
           "baseArmySeconds": 600, "baseSpySeconds": 120, "capHours": 18,
           "cartographyStep": 0.05 },
  "settlement": { "capitalQuota": 5, "targetDensity": 0.60, "minOpen": 8,
                  "sampleSize": 60, "idealNeighbors": 2, "neighborSigma": 1.2,
                  "threatExponent": 1.5 },
  // NOT: koloni konum kısıtı YOK (kullanıcı kararı). İleride istenirse buraya
  // "colonyMaxDistrict" eklenip CityFoundService tek yerden kısıtlanabilir.
  "rules": { "dailyAttackLimit": 3, "beginnerProtectionHours": 72,
             "vacationMinHours": 48, "maxCities": 5, "colonizationStep": 3,
             "marchLimitSource": "barracks", "resourcePerScore": 1000,
             "allianceFound": { "minCastleLevel": 5 } },      // §13.15 — liste büyüyecek
  "economy": { "foodBase": 6, "foodRate": 1.16, "goldBase": 5, "goldRate": 1.15,
               "buildingCostRate": 1.4, "unitCostRate": 1.8, "heroReviveRate": 1.5,
               "startingResources": { "gold": 4000, "food": 4000 },   // §13.11.1a — YALNIZ başkente
               "colonyStartingResources": { "gold": 0, "food": 0 },
               "trainingTimeModel": "balanced",                       // ✅ §13.11.3; "area"/"original" = emekli
               "bases": { /* §13.9 yapı+teknik taban maliyet tablosu */ } },
  "combat": { "engineVersion": "1.0.0", "catalogHash": "…",
              "wall": {"power":2500,"tough":12000,"exp":0.5},
              "magicShield": {"perLevel":0.05,"max":0.60,"shamanPerLevel":50},
              "trap": {"triggerMin":0.75,"triggerMax":0.99,"perGroundUnit":0.2,"gnomeDisarm":1.5},
              "gnomeSabotage": {"perStruct":4,"max":0.35},
              "repair": {"min":0.50,"max":0.70},
              "defenseFloor": {                        // §13.11.10 — her tipten en az N kalır
                "enabled": true, "minPerType": 4,
                "protectedTypes": ["archer_tower","oil_cauldron","mangonel","guard","ballista"],
                "debrisFromNetLosses": true            // sonsuz enkaz çiftliğini engeller
              } },
  // ⭐ Koddaki `DEFAULT_LOOT_CONFIG` ile BİREBİR (2026-07-31'de senkronlandı; blok üç yönden
  //    bayattı: floorThreshold/minRate eksikti, debrisRate yanlış yerdeydi — o `combat`
  //    altında yaşıyor — ve havuz modelinde karşılığı olmayan bir "order" alanı vardı).
  "loot": {                                            // §13.10.4
    "plunderRate": 0.40, "povertyThreshold": 100000,   // tavan oran ve üst eşik
    "floorThreshold": 5000, "minRate": 0.20,           // alt eşik ve TABAN oran (kullanıcı 2026-07-31)
    "jitterMin": 0.85, "jitterMax": 1.15,
    "condition": "attackerWon"                         // "attackerWon"|"undefendedBefore"|"never"
  },
  "cave": { "baseDwarves": 100, "levelRate": 1.5, "blacksmithingStep": 0.05,
            "repairHours": 24, "capacityRate": 2.0 },
  "abuse": {                                           // §9.1 çoklu hesap tespiti
    "scanIntervalHours": 168,                          // haftalık tarama (kullanıcı isteği)
    "retentionDays": 90,                               // sessions/ip kayıtları bu süre sonra budanır
    "reportScoreThreshold": 60,                        // bu skorun üstündeki çift rapora girer
    "weights": {                                       // ⚠️ gerçek veri görülünce ayarlanacak
      "sameDeviceId": 40, "sameIp24": 15, "sameAsn": 5,
      "oneWayResourceFlow": 25, "profitlessAttackFarm": 30,
      "sessionNonOverlap": 15, "registrationCohort": 10,
      "defenseInconsistency": 20, "silentAllies": 10
    },
    "autoAction": "none"                               // ASLA otomatik ceza — yalnız rapor (§9.1.1)
  },
  "chat": {                                            // §13.12
    "globalEnabled": true, "globalSlowModeSeconds": 5,
    "maxLength": 500, "historyPageSize": 50,
    "retentionDays": { "global": 30, "alliance": 180, "dm": 0 },   // 0 = süresiz
    "rateLimit": { "burst": 5, "perSeconds": 10 },
    "minPlayerAgeMinutesForGlobal": 60,
    "minPlayerAgeHoursForDm": 12,              // §13.12.4 — acemi DM kısıtı
    "dmAllowReplyWhileRestricted": true,       // kendisine yazılana cevap verebilir
    "ageSource": "player",                     // "player" (o dünyaya katılım) | "account"
    "dmPush": true, "alliancePush": false, "globalPush": false
  }
}
```
**Kural:** motorda/servislerde **hiçbir sihirli sayı kalmaz**; hepsi buradan okunur. Savaş motoru
sabitleri de (v0.6'da `global.__X` ile denediklerimiz) buraya taşınır → dünya bazında denge ayarı
mümkün olur, kod değişikliği gerekmez.

> **Tema burada DEĞİL.** Renk paleti oyun dengesi değil sunum katmanıdır → `world_config`'te değil,
> `packages/design-tokens`'ta yaşar (§13.13). Dünya bazında tema değiştirme ihtiyacı doğarsa
> `worlds.theme_id` tek alanla eklenir.

---

## 13.8 ⭐ OYUN VERİSİ: TABLOLAR DEĞİL, FORMÜLLER (2026-07-25 keşfi)

Kullanıcının ilettiği üç tablonun da **kapalı formu bulundu ve birebir doğrulandı** (`scratchpad/
formul_kesfi*.js`). Bu, veritabanında 40/80/720 satırlık tablo tutmayı gereksiz kılar — katalogda
formül + doğrulama testi yeterli:

| Veri | Formül | Doğrulama |
|---|---|---|
| Çiftlik (yemek/saat) | `floor(6 · L · 1,16^L)` | **40/40 birebir** |
| Maden (altın/saat) | `floor(5 · L · 1,15^L)` | **40/40 birebir** |
| Kahraman tecrübe | `XP(1)=500 · XP(L)=round(XP(L−1) × (1 + 1/√(L−1)))` | **80/80 birebir** |
| Mağara yıkma (cüce) | `round(100 · 1,5^(mağaraSv−1) / (1 + 0,05 · demircilik))` | **119/120** |

- Mağara formülü hem dokümandaki iki kuralı da doğruluyor: *"her seviye %50 dayanıklılık"* (1,5^L) ve
  *"demircilik arttıkça gereken cüce azalır"* (+%5/seviye güç — Haritacılık'ın hız modeliyle **aynı
  matematik**: `1/(1+0,05L)`).
- **Tek sapan hücre:** demircilik 4 / mağara 22 → formül 415.657, tabloya 415.667 yazılmış. Komşu
  hücrelerin hepsi tuttuğu için bu bir yazım sürçmesi (5↔6). ⇒ **`cuce-magara.md`'yi elle doldurmaya
  gerek yok**, tablo formülden üretilebilir (istenirse doğrulama için görüntüden 3-5 hücre örneklenir).
- Formüller 40/80 seviyesinin ötesine de uzanır (sv50 çiftlik 501.211/saat, sv60 2.653.272/saat) →
  seviye tavanı bir **tasarım kararı** olarak kalır, veri kısıtı değil.

---

## 13.9 ⭐ EKONOMİ FORMÜLLERİ — `k.java` ÇÖZÜLDÜ (2026-07-26)

`k.java:1373` maliyet/süre fonksiyonu tam olarak çözüldü. Önceki `MOBIWAR_MIMARI_RAPOR.md` §5'teki
kategori eşlemesi **YANLIŞTI**; `j.java:85-105` (ön-şart ekranı) kesin cevabı verdi:

| Kat. | Gerçek anlamı | Kanıt (`j.java` ön-şart metni) | Süre böleni |
| :-- | :-- | :-- | :-- |
| **B** | **Savaşçı üretimi** (baraka) | "Gerekli **Baraka**: " | `1.4^Baraka` |
| **Y** | **Yapı / bina** | "Gerekli **Kale**: " (Mağara/Teleport/Tapınak → "Gerekli **Mimar Okulu**:") | `1.4^MimarOkulu` |
| **S** | **Savunma ünitesi** | "Gerekli **Sur**:" | `1.4^MimarOkulu` |
| **T** | **TEKNİK** *(kahraman değil!)* | "Gerekli **Akademi**:" | `1.4^Akademi` |
| **K** | Kahraman (dirilt) | — | sunucudan gelir (istemci hesaplamaz) |

> "T" kategorisinin teknik olduğunun ikinci kanıtı: süre böleni `S66` = **Akademi** ve bölen,
> tekniğin ilerletildiği **o şehrin** akademisinden okunuyor (`a[187]="w"` alanı hangi şehir olduğunu
> tutuyor) — dokümandaki *"tekniğin süresi o şehrin akademi seviyesine bağlıdır"* kuralıyla birebir.
> `S61..S69` = bina tip kimlikleri (61 Baraka · 62 Çiftlik · 63 Kale · 64 Maden · 65 Mağara ·
> 66 Akademi · 67 Mimar Okulu · 68 Teleport · 69 Tapınak).

### Formüller (sabitler `k.java:10-15`: 0.8 · 1.2 · 1.4 · 1.5 · 1.45 · 1.8)
```
SAVAŞÇI   maliyet = taban (sabit, birim başına)
          süre    = ((altın+yemek)/10)^0.8 × 65 / 1.4^Baraka          ← ÜS 0.8, çarpım değil!
YAPI      maliyet = taban × 1.8^seviye
          ÇİFTLİK ve MADEN istisna: taban × seviye × 1.45^(seviye−1)   ← ekonomi binaları daha ucuz
          süre    = 10 × (altın+yemek) / 1.4^MimarOkulu
          Mimar Okulu'nun KENDİSİ: süre = (altın+yemek) / 1.2^seviye   (kendini hızlandıramaz)
SAVUNMA   maliyet = taban (sabit, adet başına)
          SUR ve BÜYÜ KALKANI istisna: taban × 1.8^seviye  ← ikisi SEVİYE tabanlı (v0.6 kararımızı doğrular)
          süre    = 10 × (altın+yemek) / 1.4^MimarOkulu
TEKNİK    maliyet = taban × 1.5^(seviye+1)
          süre    = 10 × (altın+yemek) / 1.4^Akademi(o şehir)
```
**Çapraz doğrulama:** Sur ve Büyü Kalkanı'nın burada da **seviye-tabanlı** işlenmesi, savaş motorunda
v0.6'da aldığımız "bunlar adet değil seviyedir" kararını bağımsız olarak doğruluyor.

**Örnek süreler** (Baraka 0 / Mimar Okulu 0, x1 dünya): Cüce **31 dk** → Baraka 5'te 5,8 dk →
Baraka 10'da 64 sn · Ejderha **20,2 saat** → Baraka 10'da 42 dk · Kaos 22,8 gün → Baraka 15'te 3,5 saat.

### Elimizde OLMAYAN: yapı ve teknik TABAN maliyetleri
Savaşçı/savunma tabanları binary'de var; yapı+teknik tabanları sunucudan geliyordu (ölü sunucu).
**Öneri (config-driven, `world_config.economy.bases`).** ⚠️ Kale · Baraka · Çiftlik · Maden
satırlarındaki sayı **1→2 yükseltmesinin** fiyatıdır (aşağıdaki "taban fiyatın anlamı" başlığı):

| Yapı | altın | yemek | | Teknik | altın | yemek |
| :-- | --: | --: | :-- | :-- | --: | --: |
| **Çiftlik** | **3** | **4** | | Demircilik/Okçuluk/Zırh | 100 | 100 |
| **Maden** | **4** | **3** | | Casusluk/Haritacılık | 120 | 80 |
| Baraka | 120 | 80 | | Kimya/Büyücülük | 200 | 160 |
| Kale | 200 | 150 | | Taş Ustalığı/Tılsım | 250 | 200 |
| Mimar Okulu | 180 | 120 | | İçgüdü/Gece Görüş | 300 | 250 |
| Akademi | 250 | 180 | | Sömürgecilik | 400 | 300 |
| Mağara | 150 | 100 | | | | |
| Tapınak | 400 | 300 | | | | |
| Teleport | 800 | 600 | | | | |

Bu tabanlarla: Çiftlik sv1 = 100 kaynak / 17 dk · sv10 = 28.300 kaynak / 79 saat (MO 0), MO 10'da 2,7 saat.
Demircilik sv1 = 300 kaynak / 50 dk · sv10 ≈ 17.300 kaynak / 1,7 saat (Akademi 10).

**✅ ONAYLANDI (kullanıcı, 2026-07-26):** bu tabanlarla başlanacak. **Teleport sv1 = 500.000/500.000**
(kullanıcı hatırası, §13.11.4). Tüm tabanlar `world_config.economy.bases`'da **tek yerde** durur →
deneme-yanılmayla ayarlanacak. Sonraki tur için not: *"binaların oyundaki önemine göre fiyatlandırma"*
ayrı bir denge analizi konusu (ör. Akademi/Tapınak/Teleport gibi kritik yapılar daha pahalı,
Çiftlik/Maden ucuz ve hızlı kalmalı).

#### ⭐ TABAN FİYATIN ANLAMI: **oyuncunun ÖDEDİĞİ İLK YÜKSELTME** (kullanıcı, 2026-07-28)

Kale · Baraka · Çiftlik · Maden oyuna **seviye 1** başlıyor → seviye 1'in fiyatı hiç ödenmez.
Bu yüzden tablodaki taban artık **1→2 yükseltmesinin** fiyatıdır; seviye 0'dan başlayan yapılarda
(Akademi, Mimar Okulu, Mağara, Tapınak, Teleport) seviye 1'in fiyatı olarak kalır.
Ölçekleme `buildingCost()` içinde **tek yerde**: `taban × eğri(sv) / eğri(ilkÖdenenSeviye)`.

> Bu düzeltme olmadan taban görünmeyen bir seviyenin fiyatıydı: kullanıcı *"Çiftlik 3 altın
> 4 yemek"* dediğinde ekranda **9/12** çıkıyordu.

#### ⭐ ÇİFTLİK/MADEN TABANLARI (kullanıcı, 2026-07-27)

**Maden 4 altın + 3 yemek · Çiftlik 3 altın + 4 yemek** — *ekonomi yapısı ürettiği kaynaktan ağır
yer*: Maden altın üretir, altın ağırlıklı maliyeti olur; Çiftlik tersi. Eski tabanlar (60/40,
70/30) **14 kat** pahalıydı; Çiftlik'in ilk yükseltmesi 290 kaynak / **48 dakika** sürüyordu,
şimdi 7 kaynak / **8 saniye**.

**Erken oyunun temposu artık keseyle değil KALE BÜTÇESİYLE belirleniyor** — daha iyi bir tasarım,
çünkü tempoyu bilinçli bir yapı kararı yönetiyor. Kale 1 bütçesi = 10 seviye; Çiftlik 5 + Maden 4 +
Baraka 1 = tam 10 ve toplam maliyeti kesenin **%6'sından az**. Kalanı Kale'ye gider → bütçe büyür.

#### ⭐ `economyCostRate` 1,45 → **1,33** (kullanıcı onayı, 2026-07-28)

`k.java`'daki sabit 1,45'ti ama o oran orijinalin **bilmediğimiz** tabanlarına ve muhtemelen başka
bir seviye tavanına aitti. Bizim tavanımız **40** ve maliyet `1,45^L`, üretim `1,16^L` büyüdüğü için
seviye 40 ekonomik olarak **ulaşılamaz** oluyordu.

| | sv20 maliyet | sv40 maliyet | sv40 geri ödeme (Maden) |
| :-- | --: | --: | --: |
| 1,45 | 56.198 | **189.719.565** | ~8.700 sa (≈ 1 yıl) |
| **1,33** | 11.869 | **7.120.171** | **870 sa (≈ 36 gün)** |

1,33 seçildi çünkü geri ödeme **düzgün** büyüyor ve hiçbir noktada kopmuyor:
sv10 **6,5 sa** → sv20 **42 sa** → sv30 **195 sa** → sv40 **870 sa**. Yani her seviye planlanabilir
bir yatırım, seviye 40 ise gerçek bir geç-oyun hedefi (iki yapıyı 40'a çıkarmanın kümülatif
maliyeti ≈ 53 milyon = o seviyedeki gelirin **15 günü**).

Ekonominin doyması **kasıtlı olarak korundu** (maliyet üretimden hızlı büyümeye devam ediyor →
oyuncu geç oyunda kaynağı yağmadan almaya yöneliyor); yalnız doyma noktası oynanabilir bir yere
çekildi. Sonraki tur: erken/orta/geç oyun senaryolarıyla kapsamlı denge testi.

### 🎯 Ön-şart sorusunun cevabı: **HAYIR, seviyeyle değişmiyor**
İstemci ön-şart eşiğini **tip başına TEK bir değerden** okuyor (`byte[45]` dizisi, `init.do`/tip-35 ile
sunucudan gelir; `j.java` yalnız `b[tipIndeksi]` yazdırır). **Seviyeye bağlı bir ön-şart dizisi veya
formülü istemcide YOK.** Yani "Haritacılık 3→4 için gereken Akademi seviyesi artar mı?" → **artmaz**;
eşik o teknik için sabittir (dokümandaki tek satırlık ön-şart listeleriyle de uyumlu).
Ölçekleme yalnız **maliyet ve süre** üzerinden gelir (`1.5^(seviye+1)`), ön-şart üzerinden değil.
**Karar:** rebuild'de ön-şartlar tip başına sabit eşik olarak modellenecek (`catalog/prereq.json`),
sunucu doğrulayacak. İleride seviye-bağımlı ön-şart istersek bu bizim tasarım tercihimiz olur,
orijinalin taklidi değil.

---

## 13.10 ⭐ ORDU HAREKETLERİ — görünürlük ve zaman kesinliği

### 13.10.1 Görünürlük matrisi

> ⭐ **KURAL DEĞİŞTİ (kullanıcı, 2026-07-31): İÇERİK GİZLİLİĞİ KALKTI.** Önceki "birleşim
> gizli, öğrenmek için casusluk gerekir" maddesi iptal — *"tüm orduların tam listesini
> casusluk tekniğine gerek kalmadan görebiliyoruz… bunun bir kısıtı olmasın."*
> Artık iki ayrı soru var: **hangi hareket kime görünür** (aşağıdaki matris, sorguda uygulanır)
> ve **görünen hareketin içeriği** (koşulsuz TAM: birim dökümü + kahraman ad/seviye).

| Görev | Sahibi | Hedef oyuncu |
| :-- | :-: | :-- |
| **Saldırı** (gidiş) | ✓ tam | ✅ varış saati + kaynak şehir + **TAM DÖKÜM** (birim + kahraman ad/sv) |
| **Saldırı** (dönüş) | ✓ tam + ganimet | ✗ **görmez** (mekanizma aşağıda) |
| **Nakliye** (gidiş, başkasına) | ✓ | ✓ tam döküm + yük |
| **Nakliye** (gidiş, kendi şehrine) | ✓ | — |
| **Nakliye** (dönüş) | ✓ | ✗ |
| **Destek** (kendi şehirleri arası) | ✓ | — |
| **Casusluk** (gidiş) | ✓ | ✅ **GÖRÜR** — kırmızı kuş + **kaç kuş geldiği** |
| **Casusluk** (dönüş) | ✓ | ✗ görmez |
| **Şehir kurma** (boş koordinata) / **Teleport** | ✓ | ✗ |
| **Şehir kurma** (koordinatı kapılmış) | ✓ | ✅ saldırı olarak **maskeli**, içerik AÇIK (§13.16.6) |

**Gizli kalan tek şey ganimettir:** saldırının GİDİŞ payload'ında kaynak yükü yoktur, dönüş
bacağını da savunan görmez → savaştan önce "ne kadar götürecek", savaştan sonra "ne götürdü"
bilgisi savunana geçmez.

⚠️ **Dönüş bacağının gizlenme mekanizması sanıldığı gibi değil:** dönüş görevinin
`origin_city_id`'si SAVUNANIN şehridir (`scheduleReturn`), yani satır savunanın sorgusuna
**girer** ve `origin_is_mine` true olur. Ekranda çıkmamasının tek sebebi
`mission.controller.ts`'teki **`OUT_ICON`'da `'return'` anahtarının olmamasıdır**. Orası artık
bir güvenlik sınırı: oraya `return` eklenirse savunan saldıranın ganimetini görmeye başlar.
`battle.test.ts` bu kapıyı bir testle kilitliyor.

⚠️ **Orijinalden bilinçli sapma:** J2ME istemcisinin gelen-ordu kaydında (`k.java:906-948`)
birim alanı hiç yoktu; ekran yalnız *"Saldırı yaklaşıyor (süre) / Kaynak: koordinat (oyuncu)"*
gösteriyordu. Tam döküm bir **rebuild kararıdır**, orijinalin taklidi değil.

**Casusluğun rolü daralmadı, netleşti:** casusluk *yoldaki orduyu* değil *hedef şehri*
(kaynak · ekonomi · garnizon · savunma · teknikler) keşfetmek içindir — oyunun kendi dokümanı
da casusluğu böyle tarif eder (§13.11.6).

### 13.10.2 ⭐ Zaman kesinliği — "dönen orduyu 1 saniye sonra yakalamak"
Bu oyunun en ince mekaniği ve mimarinin sınavı. Çözüm üç kuralda:

**1. `execute_at` mikrosaniye hassasiyetinde** (`timestamptz`, Postgres native). Milisaniye bile fazlasıyla yeterli.

**2. İşleme sırası KESİN: `ORDER BY execute_at, id`** + hedef şehir üzerinde `pg_advisory_xact_lock`.
Zamanlayıcı saniyede bir yoklama yapsa da bu **sonucu değiştirmez** — aynı turda toplanan iki görev
yine `execute_at` sırasıyla işlenir. Yani gecikme *ne zaman* işlendiğini etkiler, *hangi sırayla*
ve *sonucun ne olduğunu* etkilemez.

**3. 🔑 Handler'lar `now()` DEĞİL `mission.execute_at`'i "şimdi" kabul eder.**
Kaynak birikimi (`materializeCity(city, at = mission.execute_at)`), ganimet, savaş anı, dönüş
bacağının zamanı (`return.execute_at = attack.execute_at + yolSüresi`) — hepsi bu ana göre hesaplanır.
Bu kural olmadan 800 ms geç işlenen bir görev fazladan kaynak yazar ve zincir kayar.

**Senaryo doğrulaması:** ordu 12:00:00.000'da dönüyor, saldırı 12:00:01.000'da varıyor →
dönüş önce işlenir (birlikler şehre girer), saldırı onları **bulur ve vurur**. Tersi durumda
(saldırı 11:59:59) ordu henüz yoldadır, **yakalanmaz** — klasik "dodge" hamlesi çalışır.
Eşitlikte (aynı mikrosaniye) `id` küçük olan, yani önce oluşturulan görev kazanır.

### 13.10.4 ⭐ GANİMET MEKANİĞİ — HAVUZ + KAYNAK-BAZLI ORAN (kullanıcı tanımı, 2026-07-30)

> ⚠️ Model bu tarihte İKİNCİ kez değişti. Eski "önce enkaz %100, sonra kasadan %40" düzeni
> kalktı: artık her şey tek havuzda toplanır ve saldıran kapasitesi yetse bile havuzun
> ORANINDAN fazlasını alamaz.

**1) HAVUZ** — altın ve yemek **AYRI AYRI**:
```
havuz_altın = kasa_altın + enkaz_altın        (yemek aynı)
enkaz       = Σ(KALICI ölü birim × maliyet) × 0,30      // iki tarafın ölüleri, Ogre ×1,15^khrSv
```
⚠️ **KALICI ölü**: onarım (%50-70) ve savunma tabanı (§13.11.10) geri getirdiklerini enkaz
saymaz — yoksa dokunulmaz 4'lükler sonsuz enkaz çiftliği olurdu. Yıkılan savunma birimleri
de enkaz VERİR (2026-07-23'te orijinal simülatörle doğrulandı: T3 enkaz 1.119.168 ≈ 1.121.252).

**2) ORAN** — kaynak başına bağımsız eğri (girdi HAVUZ, kullanıcı kararı):
```
oran(x) = %40                              x ≥ 100.000
        = %20 + (x−5.000)/95.000 × %20     5.000 < x < 100.000   (doğrusal)
        = %20                              x ≤ 5.000
etkinOran = oran(havuz) × rastgele(0,85…1,15)       // jitter KALIR (kullanıcı: rastgelelik savaşın parçası)
```
| Havuz | Etkin oran (jittersiz) | Alınan | (eski, taban %5) |
| --: | --: | --: | --: |
| 500.000 | %40 | 200.000 | 200.000 |
| 100.000 | %40 | 40.000 | 40.000 |
| 60.000 | %31,6 | 18.947 | 15.160 |
| 52.500 | %30 | 15.750 | 11.813 |
| 10.000 | %21,05 | 2.105 | 684 |
| 5.000 | %20 | 1.000 | 250 |

Kullanıcı örneği: kasada 500k altın + 60k yemek varsa altın %40'la, yemek ~%32'yle soyulur —
**iki kaynak birbirinden bağımsız**. Fakirleşen şehrin oranı her saldırıda düşer.

⭐ **TABAN %5 → %20 (kullanıcı, 2026-07-31).** Tavan (%40) ve eşikler (100k/5k) DEĞİŞMEDİ →
orta/geç oyun dengesi aynı; değişen yalnız erken oyun ve yağmalanmış şehirler. Sömürünün dibi
hâlâ var ama çok daha yukarıda: fakir şehri vurmak artık "kârsız" değil "daha az kârlı".
Motor sürümü bu yüzden **1.1.0**'a çıktı — eski savaş kayıtları künyesinde 1.0.0 kalır.

**3) ALINAN** = `havuz × etkinOran`, taşıma kapasitesiyle orantılı kırpılır:
```
kapasite = Σ(hayatta kalan saldıran birim × taşıma) × geceÇarpanı
alınan   = min(istenen, kapasite)        // kırpma altın/yemek oranını korur
```
⭐ **Kapasite yetse bile havuzun oranından fazlası ASLA alınmaz** — rakip kalan ganimeti ancak
**yeniden saldırarak**, her seferinde aynı oran kuralıyla alabilir. Alınan, kasa/enkaz
bileşenlerine orantılı bölünür: kasa payı savunandan **savaş anında** düşülür, enkaz payı dönüş
yüküne biner, **alınmayan enkaz savunanın şehrine eklenir** (yok olmaz).

**Şart:** yağma **saldıran kazandığında** işler (`loot.condition = "attackerWon"`; alternatifler
`"undefendedBefore"`, `"never"`). Saldıran kaybederse hiçbir şey almaz, enkazın tamamı savunana.
Saldıranın tamamı ölürse dönüş görevi yok → ganimet de yok (§13.11.7).

**⭐ Sur yıkımı iadesiyle sıralama (2026-07-30):** sur tam yıkılınca iptal edilen savunma
üretiminin iadesi kasaya **ganimet düşüldükten SONRA** eklenir — bu savaşın havuzuna girmez,
bir SONRAKİ saldırının havuzunda bulunur. Arka arkaya iki saldırıda `lockCity` sırayı garanti
eder: ikinci ordu, ilkinin tüm sonuçları (iade + hasarlı sur) uygulandıktan sonra savaşır.

### 13.10.3 Dönüş bacağı
- Savaş çözülür çözülmez **aynı transaction'da** `type='return'` görevi yazılır:
  `execute_at = savaş anı + gidiş süresi` (aynı süre, doküman kuralı).
- **Hayatta kalan birlik yoksa dönüş görevi oluşturulmaz** (ordu yok olmuştur) — ⭐ **TEK
  İSTİSNA: kahraman.** Orduda kahraman varsa (ölü ya da sağ) dönüş görevi yine kurulur ve süresi
  `payload.heroTravelSeconds` olur. Ganimet yine yoktur, rapor yine "ordudan kimse dönmedi" der.
- Ganimet **§13.10.4'teki havuz modeliyle** hesaplanır (kasa+enkaz tek havuz → kaynak başına oran
  → kapasite kırpması) ve `payload.loot` içine yazılır. Kaynaklar savunandan **savaş anında**
  düşülür, saldırana **dönüş anında** eklenir (yolda giden mal kaybolabilir → savunan geri
  alamaz, saldıran dönüşte alır). ⭐ Dönüş satırını **yalnız sahibi görür**; ganimet
  `cargo` alanında ona açıktır (§13.10.1'deki `OUT_ICON` notu).
- ⭐ Ölen kahraman **daima döner** (2026-08-01): sağ kalan birlik varsa onu ölü olarak taşır,
  yoksa kahraman kendi hızıyla yalnız yürür. Şehre varınca `status='dead'` + `city_id` dolar ve
  Dirilt menüsü açılır (§13.11.4d). Eski "yok edilir → 1 saat sonra silinir" dalı kaldırıldı.
- Nakliye/destek dönüşleri aynı mantık; casusluk dönüşü yalnız casus kuşları getirir.

---

## 13.11 ⭐ ŞEHİR, YAPI VE ÜRETİM KURALLARI (kullanıcı düzeltmeleri, 2026-07-26)

### 13.11.1 Başlangıç durumu ve KALE BÜTÇESİ (düzeltildi 2026-07-26)
- Yeni şehir: **Kale 1 · Baraka 1 · Çiftlik 1 · Maden 1**, diğer yapılar 0.
- **Kale kuralı:** `Σ(BİNA seviyeleri) ≤ Kale × 10`. Kale'nin kendi seviyesi sayılmaz.
  Başlangıç: Kale 1 → 10 bütçe, Çiftlik+Maden+Baraka 3 kullanıyor, 7 kalıyor.
- ✅ **SUR ve BÜYÜ KALKANI bu bütçeye GİRMEZ** (kullanıcı düzeltmesi — dokümanla doğrulandı):
  1. Doküman ikisini **"SAVUNMA YAPILARI"** başlığı altında listeliyor, **"YAPILAR"** altında değil;
     Kale kuralı ise YAPILAR bölümünde *"diğer **yapıların**"* diyor.
  2. Doküman iki ifadeyi de kullanıyor ve **aynı kuralın iki anlatımı**: *"her Kale seviyesi için
     diğer yapıların toplam 10 seviye ilerletilebilir"* ≡ *"yapılan her yapı 1 birimlik alan kaplar,
     her Kale seviyesi 10 birimlik alan açar"* → yani **1 bina seviyesi = 1 alan**.
  3. Savunma üniteleri Savunma menüsünden üretiliyor ve Mimar Okulu'na bağlı; Yapılar menüsünün
     ekonomisinden tamamen ayrı.
  → Bütçeyi tüketen 9 bina: Çiftlik · Maden · Baraka · Akademi · Mimar Okulu · Mağara · Tapınak ·
  Teleport (+ ileride eklenecek binalar). **Kale, Sur, Büyü Kalkanı ve savunma üniteleri hariç.**

### 13.11.1a ⭐ BAŞLANGIÇ KAYNAĞI (kullanıcı isteği, 2026-07-26)
Kullanıcı isteği: *"ilk seviye yapı ve asker fiyatları göz önüne alınarak çok cömert olmayan, yavaş
yavaş gelişmeye açık"* bir başlangıç kesesi.

**Sorun:** seviye 1 üretim **saatte 6 yemek + 5 altın = 11 kaynak**. Çiftlik'i 2'ye çıkarmak 290
kaynak → sıfır keseyle **~26 saat** bekleme. Yani başlangıç kaynağı olmadan oyunun ilk günü ölü.

**✅ KARAR: `startingResources = 4.000 altın + 4.000 yemek`** (yalnız **başkent**, hesap açılışında).

Bu kese tam olarak şunu alır (§13.9 tabanları + motorun birim maliyet tablosuyla hesaplandı):
| Harcama | Altın | Yemek |
| :-- | --: | --: |
| Çiftlik 1→4 (290 + 631 + 1.220) | 1.285 | 856 |
| Maden 1→4 (aynı formül, altın ağırlıklı) | 1.499 | 642 |
| Baraka 1→2 | 216 | 144 |
| **5 Cüce** (200 altın + 450 yemek/adet) | 1.000 | 2.250 |
| **Toplam** | **4.000** | **3.892** |

Sonuç: yeni oyuncunun **ilk günü dolu geçer** (ekonomi 4, baraka 2, cepte küçük bir müfreze), kese
biter ve **2. günden itibaren üretimle yaşamaya başlar**. Üretim 11/saat → **77/saat** (7 kat), ama
tek bir Süvari bile (1.200 + 2.400) hâlâ ~1,5 gün demek → **ordu kurmak yavaş ve kıymetli** kalır.
72 saatlik acemi koruması tam olarak bu kurulum penceresine denk gelir.

| Alternatif | Ne olurdu |
| :-- | :-- |
| 2.000 / 2.000 | ancak ekonomi 3'e çıkar, hiç asker yok → ilk gün sıkıcı, terk oranı yüksek |
| **4.000 / 4.000 ✅** | ekonomi 4 + baraka 2 + 5 Cüce; kese biter, gelişim üretime bağlanır |
| 8.000 / 8.000 | ekonomi 6 + ~15 Cüce → 1. günde saldırıya çıkılır, acemi koruması anlamsızlaşır |

**Kurallar:**
- **Yalnız başkent** alır (`colonyStartingResources = 0/0`). Kurulan koloni **sıfır** kaynakla doğar;
  yanında ne götürdüysen o. Aksi hâlde *şehir kur → keseyi al → terk et* döngüsü kaynak basardı.
- Kese oyuncu yaratılırken `cities.gold/food` olarak yazılır ve `audit_log`'a `grant` olarak düşer.
- Dünya hızından **etkilenmez** (sabit sayı); hızlı test dünyasında config'ten büyütülür.
- Kaynak tavanı/ambar yok → kese doğrudan kasaya yazılır.
- İleride "geç katılana yetişme yardımı" istenirse aynı alanın dünya-yaşına bağlı bir çarpanı olur;
  şimdilik **yok** (ertelendi).

### 13.11.1b ✅ SAVUNMA KAPASİTESİ — Sur'a bağlı ayrı bütçe (ONAYLANDI 2026-07-26)
Kullanıcının *"savunma birimlerinin kendi arasında bir kuralı olabilir"* sezgisi doğru görünüyor.
Dokümanda üç ipucu var:
1. **Sur'un girdisi diğerlerinden farklı yazılmış:** her birimde `Alan : N` derken Sur'da
   **"Seviye 1 için Alan : 1000"** — yani Sur'un alanı *seviyeye göre değişiyor*. Bir şeyi TÜKETMİYOR,
   **SAĞLIYOR** olduğunun işareti.
2. *"Sur **üzerine yerleştirilen** diğer savunma birimleri ve elf okçuları şehir savunmasının temel
   direğini oluşturur."* → savunma birimleri surun ÜZERİNDE duruyor ⇒ surun büyüklüğü kaç birim
   sığacağını belirler.
3. Savunma birimlerinin "Alan" değerleri (Tuzak 3 · Okçu Kulesi 24 · Kazancı 150 · Muhafız 180 ·
   Mangonel 257 · Balista 900 · Büyü Kalkanı 1000) **bina bütçesi ölçeğinde anlamsız** (Kale 20 bile
   yalnız 200 verir) ama **1000'lik bir sur kapasitesi ölçeğinde tam oturuyor**.

**Kabul edildi + CÖMERTLEŞTİRİLDİ (kullanıcı, 2026-07-26):** ilk önerim (`1000 × 1,4^(Sur−1)`) çok
sıkıydı — birkaç Balista kapasiteyi doldururdu. Yeni değerler:
```
savunmaKapasitesi = 25.000 × 1,30^(Sur−1)          // world_config.areaRules.defenseCapacity
```
Her savunma birimi katalogdaki **Alan** değeri kadar tüketir. Sur 0 → savunma birimi yok
(zaten hepsinin ön-şartı Sur ≥ 1).

| Sur | Kapasite | Ne sığar (örnek) |
| --: | --: | :-- |
| 1 | 25.000 | **1.041 Okçu Kulesi** veya 8.333 Tuzak veya 27 Balista |
| 3 | 42.250 | referans savaşımızdaki karma savunmanın tamamı (42.006) ✓ |
| 5 | 71.400 | 79 Balista veya 396 Muhafız |
| 10 | 265.000 | 294 Balista veya 1.472 Muhafız |
| 15 | 985.000 | 1.094 Balista |
| 20 | **3,66 M** | 4.066 Balista + geniş karma savunma (maksimum kale) |

Kalibrasyon çıpası: `savas_testleri.txt` senaryosundaki savunma (129 Okçu + 300 Tuzak + 111 Kazancı +
60 Mangonel + 33 Muhafız = **42.006 alan**) **Sur 3** ile tam sığıyor — yani gerçekçi bir orta-oyun
şehri kendi sur seviyesiyle uyumlu. Üst uçta 3,66 M "sağlam ama astronomik değil".

Bu kural olmadan savunma birimi sayısı **sınırsız** olur (sonsuz kule = kırılamaz şehir). Kural
Sur'u dokümanın dediği gibi *"savunmanın temel direği"* yapıyor ve Sur'u yükseltmeye gerçek bir
sebep veriyor. Tüm sayılar `world_config`'te — **hardcoded değil**, denemeyle ayarlanacak.

### 13.11.1c Mimari: alan/bütçe kuralları VERİ ile tanımlanır (kolay değiştirilebilirlik)
Kullanıcı isteği: *"sonradan kolayca değiştirilebilir bir kod mimarisi"*. Bu kurallar koda gömülmez;
`world_config.areaRules` altında **veri** olarak durur, tek bir `CapacityService` genel olarak
uygular:
```jsonc
"areaRules": {
  "buildingBudget": {
    "sourceBuilding": "castle", "perLevel": 10,
    "consumers": ["farm","mine","barracks","academy","architect_school","cave","temple","teleport"],
    "unit": "level"                         // her seviye 1 birim
  },
  "defenseCapacity": {
    "sourceBuilding": "wall", "base": 25000, "rate": 1.30,
    "consumers": ["archer_tower","trap","oil_cauldron","mangonel","guard","ballista","magic_shield"],
    "unit": "area"                          // katalogdaki Alan × adet
  }
}
```
Sur'u bina bütçesine dahil etmek istersen: `"consumers"` dizisine `"wall"` eklemek yeterli — **kod
değişmez**. Kural motoru: `CapacityService.check(city, yapilacakIs) → {yeterli, kullanilan, toplam}`;
UI aynı servisten kalan bütçeyi gösterir, sunucu her yükseltme/üretim talebinde aynı servisi çağırır.

### 13.11.2 Seviye tavanları
| Kategori | Tavan | Gerekçe |
| :-- | :-- | :-- |
| Çiftlik, Maden | **40** | üretim tabloları 1-40 (doküman) |
| Diğer yapılar (Kale, Baraka, Akademi, Mimar Okulu, Mağara, Tapınak, Teleport) | **20** | mağara kapasite tablosu 1-20 + kullanıcı hatırası |
| Sur, Büyü Kalkanı | **20** | aynı |
| Teknikler | **sınırsız** | binary'de clamp yok; ekonomik maliyet doğal tavan |

**Mağara kapasitesi = `50 × 2^(seviye−1)`** — `magara-kapasite.md` tablosuyla 20/20 birebir
(doküman: *"her seviyede kapasite 2 katına çıkar"*). Kapasite **alan** cinsindendir → sv1 = 50 alan
= ~5 cüce; sv20 = 26.214.400 alan.

### 13.11.3 ✅ ÜRETİM SÜRESİ — **KURGULANAN MODEL (2026-07-27)**

> Bu bölüm iki kez değişti. Sıra: **Model A** (Alan = süre, 2026-07-26 onaylandı) → **Model B**
> (`k.java`'nın ham formülü, 2026-07-27 sabah) → **kurgulanan model** (2026-07-27, yürürlükte).
> Ara adımlar silinmedi; bir kararın nasıl değiştiğini bilmek kararın kendisi kadar önemli.

#### Yürürlükteki kural — dört kategori, tek eğri

```
süre(sn) = K × (değer / 1000)^0,8 / 1,2^(hızlandıran yapı seviyesi)
```

| Kategori | `K` | değer | hızlandıran |
| :-- | --: | :-- | :-- |
| **Savaşçı** | 190 | altın + yemek + **taşıma** | **Baraka** |
| **Savunma birimi** | 190 | altın + yemek | **Mimar Okulu** |
| **Yapı** · **Sur/Büyü Kalkanı** | 400 | o seviyenin altın + yemek maliyeti | **Mimar Okulu** |
| **Teknik** | 400 | o seviyenin altın + yemek maliyeti | **Akademi** (o şehrin) |

Kod: `packages/catalog/src/formulas.ts` → `timeCurve` (çekirdek) · `timeFromCost` (yapısal) ·
`trainingTimeSeconds` (birim). Dört kategori tek çekirdeği paylaşır; ayrı yazılsalardı biri
güncellenip diğerleri unutulurdu.

#### Neyin neden böyle olduğu

**Değer = maliyet.** Katalogdaki `area` motorda birimin **savaş gücü**dür (`birimPuan`). Savaşçılarda
`maliyet/güç` oranı **63 ile 100 arasında, ortalama 81** — yani orijinal tasarımcılar birimleri zaten
güçleriyle orantılı fiyatlamış. Maliyeti kullanmak gücü de kullanmaktır; ayrıca bir "güç terimi"
eklemek aynı bilgiyi iki kez saymak olurdu.

| Birim | maliyet | güç (Alan) | maliyet/güç |
| :-- | --: | --: | --: |
| Ogre | 42.000 | 666 | 63 |
| Süvari | 3.600 | 52 | 69 |
| Cüce | 650 | 9 | 72 |
| Mancınık | 18.000 | 240 | 75 |
| Ejderha | 65.000 | 750 | 87 |
| Pegasus | 7.200 | 80 | 90 |
| Elf | 1.100 | 12 | 92 |
| Kaos | 4.000.000 | 40.000 | 100 |
| *Gnom* | *3.200* | *25* | *128* |
| *Şaman* | *4.000* | *18* | *222* |
| *Yük Arabası* | *2.000* | *8* | *250* |
| *Casus Kuş* | *300* | *1* | *300* |

Alttaki dört birimde oran patlıyor çünkü onların değeri savaş gücünde değil — **maliyet bunu da
doğru yakalıyor**, `Alan` yakalayamazdı (Model A'nın çöktüğü nokta: Casus Kuş 1 saniyede çıkardı).

**Ek terim: taşıma.** Yük Arabası 2.000 kaynağa **5.000 taşıma** veriyor — kaynak başına Cüce'nin
163 katı. Taşımayı 1:1 kaynak saymazsak ganimet taşımak bedavaya gelir. Terimle değeri 2.000 → 7.000,
süresi **2,7 katına** çıkıyor. Diğer birimlerde etki ihmal edilebilir (Ejderha +%0,5) — kasıtlı
olarak **hedefli** bir düzeltme.

> ⚠️ **Taşıma kapasitesinin kaynağı binary DEĞİL, oyunun kendi dokümanıdır** (kullanıcı, 2026-07-28):
> simülatör savaşta *ortaya çıkan* ganimeti hesaplar, ne kadarının taşındığını bilmez. 12 birimin
> tamamı `teknik_ve_yapi_dokumantasyonu.md` ile karşılaştırıldı; yalnız **Yük Arabası yanlıştı**
> (3.000 → **5.000**). Ganimet altın/yemek **eşit oranda** taşınır.

**Üs 0,8 (orijinalden).** Süre maliyetin altında kalan bir hızla büyür: Ejderha, Cüce'nin 100 katı
maliyete karşı **39 katı** süre alır → saniye başına **2,1 kat** daha çok güç üretir. Bedeli yüksek
ön-şartlar (Baraka 10 + Büyücülük 12). Üs 1,0 olsaydı birim seçimi yalnız maliyet verimliliğine
inerdi; 0,7 olsaydı elit birim fazla baskın olurdu.

**Bölen 1,2 (orijinaldeki 1,4 DEĞİL).** 1,4 yirmi seviyede **836 kat** demek: Baraka tek başına
oyunun kaderini belirler ve seviye 1'deki oyuncu hiçbir şey üretemez (`k.java` ile Cüce Baraka 1'de
**21 dk 50 sn**). 1,2 ile yirmi seviye **32 kat** kazandırır — hissedilir ama tek eksenli değil.

**Katsayılar (190 / 400).** Aynı değerde bir yapı, bir birimin ~2 katı sürer. Yapı kalıcı ve tek
seferlik; birim ölür ve yeniden üretilir.

#### Ölçek — savaşçılar

| Birim | Baraka 1 | Baraka 5 | Baraka 10 | Baraka 15 | Baraka 20 | **ön-şartında** |
| :-- | --: | --: | --: | --: | --: | --: |
| Cüce | 1dk 54sn | 55sn | 22sn | 9sn | 4sn | B1 → 1dk 54sn |
| Elf | 2dk 51sn | 1dk 23sn | 33sn | 13sn | 5sn | B3 → 1dk 59sn |
| Casus Kuş | 1dk 00sn | 29sn | 12sn | 5sn | 2sn | B3 → 42sn |
| Yük Arabası | 9dk 34sn | 4dk 37sn | 1dk 51sn | 45sn | 18sn | B3 → 6dk 38sn |
| Süvari | 7dk 25sn | 3dk 35sn | 1dk 26sn | 35sn | 14sn | B4 → 4dk 18sn |
| Şaman | 8dk 00sn | 3dk 52sn | 1dk 33sn | 37sn | 15sn | B5 → 3dk 52sn |
| Gnom | 6dk 42sn | 3dk 14sn | 1dk 18sn | 31sn | 13sn | B6 → 2dk 42sn |
| Pegasus | 12dk 52sn | 6dk 12sn | 2dk 30sn | 1dk 00sn | 24sn | B7 → 4dk 18sn |
| Mancınık | 26dk 39sn | 12dk 51sn | 5dk 10sn | 2dk 05sn | 50sn | B8 → 7dk 26sn |
| Ogre | 52dk 59sn | 25dk 33sn | 10dk 16sn | 4dk 08sn | 1dk 40sn | B8 → 14dk 47sn |
| Ejderha | 1sa 14dk | 36dk 02sn | 14dk 29sn | 5dk 49sn | 2dk 20sn | B10 → 14dk 29sn |
| **Kaos** | 1g 9sa | 16sa 09dk | 6sa 29dk | 2sa 36dk | 1sa 02dk | B15 → 2sa 36dk |

Son sütun en önemlisi: bir birimi **ilk kez üretebildiğin an** ne kadar beklediğin. Hepsi 42 sn ile
15 dk arasında; yalnız Kaos (nihai birim) 2,6 saat.

#### Ölçek — savunma (hızlandıran: Mimar Okulu)

| Birim | MO 0 | MO 5 | MO 10 | MO 15 | MO 20 |
| :-- | --: | --: | --: | --: | --: |
| Tuzak | 1dk 31sn | 37sn | 15sn | 6sn | 2sn |
| Okçu Kulesi | 2dk 31sn | 1dk 01sn | 24sn | 10sn | 4sn |
| Muhafız | 10dk 22sn | 4dk 10sn | 1dk 40sn | 40sn | 16sn |
| Kazancı | 12dk 34sn | 5dk 03sn | 2dk 02sn | 49sn | 20sn |
| Mangonel | 18dk 22sn | 7dk 23sn | 2dk 58sn | 1dk 12sn | 29sn |
| Balista | 55dk 40sn | 22dk 22sn | 8dk 59sn | 3dk 37sn | 1dk 27sn |

#### Emekli modeller ve neden bırakıldılar

**⛔ Model A — `süre = Alan × 0,95^(Baraka−1)`** (2026-07-26 onaylanmıştı):
1. *Yapısal olarak yanlış.* Süre alanla orantılı olsaydı `süre/alan` sabit çıkardı; aynı ekranın
   beş biriminde bu oran **2,3 kat** değişiyor.
2. *0,95 hiçbir kaynaktan gelmiyordu* — "Baraka süreyi kısaltır" hatırasını sayıya çevirmek için
   seçilmiş bir tahmindi.
3. *"Alan" bir kapasite sayısıdır*; mağara ve savunma kapasitesi de onunla ölçülüyor. Aynı sayıya
   üçüncü bir iş yüklemek dayanaksızdı — ve Casus Kuş'u 1 saniyeye, Tuzak'ı 3 saniyeye düşürüyordu.

**⛔ Model B — `k.java`'nın ham formülü** (`(⌊(a+y)/10⌋)^0,8 × 65 / 1,4^sv`; savunmada
`10(a+y)/1,4^MO`). **Formülün kendisi doğru**, ölçeği kullanılabilir değil: Baraka 1'de Cüce
21 dk 50 sn, Mimar Okulu 0'da Muhafız 12 saat.
- 🔍 Formülü doğrulayan ölçüm: `images/mobil.png`'de Muhafız 2400/2000 ve **3:22** →
  `10×4400/1,4^16 = 202,02 sn`, Mimar Okulu **tam sayı 16**. Yarı maliyetle çözülünce 13,94 (tam
  sayı değil) çıkıyor → o ekrandaki maliyetler bizim binary tablomuzla aynı.
- ⚠️ **Ama o ekran görüntüsü SON SÜRÜMÜ temsil etmiyor** (kullanıcı, 2026-07-27): oyun 2015'ten
  önce kapandı ve resimdeki **Muhafız görseli eski sürüme ait**. Yani formülün varlığı kanıtlı,
  **ölçeği bağlayıcı değil**. Bu yüzden eğrinin şekli (üs 0,8, maliyet güdümlü) korundu,
  katsayı ve bölen oynanabilirliğe göre kurgulandı.

Her ikisi de `trainingTimeSeconds(id, sv, 'area' | 'original')` ile çağrılabilir —
karşılaştırma ve denge düğmesi olarak duruyorlar, varsayılan değiller.

#### ⚠️ Yapı sürelerinde çözülen çöküş

Eski kural `10 × (altın+yemek) / 1,4^MimarOkulu` **üstel maliyet eğrisiyle çarpışıyordu**: maliyet
`1,8^seviye` büyürken süre onunla lineer büyüyünce Kale 20 **2.869 gün** sürüyordu (Mimar Okulu 20
ile bile 3,4 gün). Yeni kural üssü 0,8'e indirdiği için aynı yükseltme Mimar Okulu 10'da **2,4 gün**.
İlk yükseltmeler de makul: Kale 2 = 4 dk 36 sn, Akademi 1 = 3 dk 24 sn.

**Mimar Okulu'nun özel dalı kaldırıldı.** Orijinalde kendi süresi `(a+y)/1,2^sv` idi (10× çarpansız);
o istisna 1,4'lük bölenin kaçışını frenlemek içindi. Bölen 1,2'ye inince frene gerek kalmadı ve
istisna sessiz bir tutarsızlık kaynağı olurdu.


### 13.11.4 Teleport
- **Seviye 1 maliyeti: 500.000 altın + 500.000 yemek** (kullanıcı hatırası) → §13.9 formülüyle
  sonraki seviyeler `500.000 × 1,8^(seviye−1)`.
- Bekleme (cooldown): doküman *"her seviye %2 kısaltır"*. Taban **20 saat** öneriyorum:
  `bekleme = 20sa × 0,98^(seviye−1)` → sv1 20 sa, sv10 16,7 sa, sv20 13,7 sa.
  Gerekçe: teleport **anında** ordu taşıyor (savunmada ezici avantaj); saldırılar 20 dk-8 saat
  sürerken bekleme 13-20 saat olmalı ki günde bir kez kullanılan acil-durum aracı olsun.
- Teleport ile **kaynak taşınmaz**; her iki şehirde de Teleport ≥ 1 olmalı.

### 13.11.4b Kahraman diriltme (tamamen sunucu tarafı — tasarlandı)
`k.java` incelendi: diriltme **"K" kategorisi** (`drKah.do?k=` uç noktası) ve istemci **hiçbir hesap
yapmıyor**, sunucunun gönderdiği süreyi ekrana basıyor (`var9 = var2.a[2]`). Yani formül orijinalde de
sunucudaydı → biz tasarlıyoruz. Elimizdeki tek çıpa: doküman notu **"0 seviye kahraman: 3.000 altın +
2.000 yemek"**.

```
diriltMaliyeti = (3.000 altın , 2.000 yemek) × 1,5^kahramanSeviyesi     // Tapınaktan ETKİLENMEZ
diriltSüresi   = 9 saat × 1,10^kahramanSeviyesi × 0,93^Tapınak          // 15 dk – 48 sa arası
```
| Kahraman sv | Maliyet (altın/yemek) | Süre @Tapınak 0 | @Tapınak 5 | @Tapınak 20 |
| --: | --: | --: | --: | --: |
| 0 | 3.000 / 2.000 | **9 sa 00 dk** | 6 sa 16 dk | 2 sa 06 dk |
| 5 | 22.781 / 15.188 | 14 sa 29 dk | 10 sa 05 dk | 3 sa 24 dk |
| 10 | 173.005 / 115.337 | 23 sa 20 dk | 16 sa 14 dk | 5 sa 28 dk |
| 13 | 583.859 / 389.239 | 31 sa 03 dk | 21 sa 37 dk | 7 sa 17 dk |

⭐ **İki eksen TERS yönde (kullanıcı, 2026-07-29):**
 • **Kahraman seviyesi** hem süreyi hem maliyeti **artırır** — yüksek seviye kahramanı kaybetmek
   ağır olmalı.
 • **Tapınak seviyesi** yalnız **süreyi kısaltır**, maliyete dokunmaz. Buradaki Tapınak
   kahramanın **o an bulunduğu şehrin** tapınağıdır — kahraman ÇIKMA ihtimalindeki "tüm
   şehirlerin toplamı" ile karıştırılmamalı.
 • Taban: tapınaksız bir şehirde ölen seviye 0 kahraman **9 saat** bekler.

> Bu yön bir kez ters kuruldu (süre seviyeyle kısalıyordu) ve kullanıcı düzeltti:
> *"Kahramanın seviyesi arttıkça dirilme süresi uzasın, mantıklı olan da."*

**Maliyet tabanı ÖLÇÜLDÜ:** oyunun tapınak ekranında seviye 0 ölü kahraman için
`3000 altın · 2000 yemek` yazıyor (`images/scr_itv03`); yalnız `1,5^seviye` çarpanı bizim.
**Süre kalibrasyonu:** aynı ekranda `2:04:27` (7467 sn) görünüyor, tapınak seviyesi yazmıyor.
Model Tapınak 20 / seviye 0 için 7589 sn veriyor — 2 dakika farkla oturuyor.
Hepsi `world_config.economy`'de.

### 13.11.4c ⭐ KAHRAMAN YETENEK PUANLARI — seviye başına 3 (kullanıcı, 2026-07-26)

> 🔍 **İSTEMCİ TEYİDİ (2026-07-26):** `g.java` menüsünde **`Seviye Arttır`** ve **`Özellikler`**
> aksiyonları, ekranda *"… seviye ilerletme hakkınız var"* metni var; `j.java:432` kalan puan
> sayısını **sunucudan gelen bir alandan** (`k.a[178]` = `"x"`) okuyup basıyor. Uçlar:
> `grKoz.do?k=` (özellikleri getir) · `dgKoz.do?k=` (puan harca).
> **Yani "her seviye N puan verir + kalan puan takip edilir" MEKANİZMASI doğrulandı; ama N = 3
> sayısı istemcide YOK** (sunucu tarafıydı, kahraman diriltme gibi). 3 değeri kullanıcı hatırasıdır;
> `heroSkillBudget` tasarımı mekanizmayla birebir örtüşüyor.

**✅ KURAL: her seviye atlayışı 3 geliştirme puanı verir.** Oyuncu bunları dört yeteneğe dağıtır →
seviye 8 kahramanın dört yeteneğinin **toplamı en fazla 24**. Dağıtılmamış puan saklanabilir.
Sunucu her dağıtım isteğinde ve her savaş girdisinde doğrular
(`assertHeroSkills`, `packages/engine/src/hero.ts`; zod tarafı `contracts/simulate.ts`).

#### Yeteneklerin gerçek karşılığı (binary'den ÇÖZÜLDÜ, 2026-07-26)
Simülatörün kahraman ızgarası (`FUN_00402800`, `Self+0x480`, satır = kahraman, sütun 1-5) doğrudan
şu setter'lara yazıyor — yani dört "yetenek" aslında **kahramana özel dört teknik alanı**:

| Sütun | Setter | Beslediği stat (bizim adlandırma) | Savaştaki işlevi |
| :-: | :-- | :-- | :-- |
| 1 fizSald | `sub_412924` (Instinct) | `hp` — fiziksel vuruş gücü | **OFANS**: saldırı havuzuna girer |
| 2 fizSav | `sub_412948` (Armor) | `pAtk` **ve** `pDef` | **SAVUNMA**: iki fiziksel mitigasyon birden |
| 3 büyüSald | `sub_4128dc` (Tech4) | `magicHp` — büyü vuruş gücü | büyü fazı |
| 4 büyüSav | `sub_412900` (Wizardry) | `mAtk` — büyü savunması | büyü mitigasyonu |
| 5 seviye | `sub_41296c` | — | aşağıdaki üstel terim |

Bu alanları `FUN_0040d884` şu formülle işliyor:
```
stat = (seviye+1) × taban × 1,07^seviye  +  taban × 1,06^yetenek
```
> ❌ **AŞAĞIDAKİ İKİ PARAGRAF ÇÜRÜDÜ (2026-07-29).** Kahramanın stat tablosundaki **satır 12**
> bulununca büyü tabanının fizikselle **aynı** olduğu (hp/magicHp = 1200) görüldü ve ölçüm doğruladı.
> D3/D4'ün H2 ile aynı çıkmasının sebebi taban değil, **testin yapısı**: o kurgularda büyü fazı havuzu
> zaten eksideydi, yani ölçüm büyüyü hiç sınamıyordu. Formül de çarpımsal değil **toplamsal**:
> `stat = (sv+1)×taban×1,07^sv + taban×(1+k×yetenek)`. Doğrusu §13.11.4d'de.

🎯 ~~**Formül ÇARPIMSAL olduğu için "büyü yetenekleri işe yaramıyor" bilmecesi çözüldü:** kahramanın
büyü TABAN statları **sıfır** → `0 × 1,06^n = 0`. `KAHRAMAN_TESTLERI.md` D3 (büyüSald 10) ve D4
(büyüSav 10) sonuçlarının H2 (yetenek 0) ile **birebir aynı** çıkmasının sebebi budur. Yani büyü
mekaniği bozuk değil; kahramanın büyü tabanı yok. (Kahramana büyü tabanı verirsek çalışır.)~~

#### Motor kalibrasyonu (Y turu ile TAMAMLANDI, 2026-07-26)

`KAHRAMAN_TESTLERI.md`'deki **17 orijinal ölçümden** (G/S/D/X + Y) kahramanın etkin katkısı sayısal
olarak geri çözüldü — motoru bilinen saldıran-kaybı hedefine oturtan ofans/savunma değeri arandı:

| Ölçüm | fizSald | Çözülen OFANS | Önceki ölçüme oran | **Puan başına** |
| :-- | --: | --: | --: | --: |
| lvl15 | 0 | 16.894 | — | — |
| lvl15 | 6 | 62.655 | 3,71× | ×1,244 |
| lvl15 | 12 | 100.710 | 1,61× | ×1,082 |
| lvl15 | 24 | 165.988 | 1,65× | ×1,043 |
| lvl15 | 45 | 345.993 | 2,08× | ×1,036 |
| lvl20 | 60 | 454.716 | 1,31× | ×1,018 |

> ⚠️ **ÖNEMLİ DÜZELTME.** Bir ara "yetenek etkisi **ÜSSEL**, puan başına ×1,18" demiştim —
> **yanlıştı.** O çıkarım yalnız **0-12 puanlık** pencereden ve dejenere bir iki-parametreli fitten
> geliyordu. Y turu 24/45/60 puanı ölçtü: puan başına kazanç **düzenli olarak yavaşlıyor**
> (×1,244 → ×1,018). Tüm aralığa bakıldığında doğru şekil **TOPLAMSAL ve puanda LİNEER**.
> Üssel modeli 45 puana uzatmak ×1.735 verecekti; gerçek çarpan ×20.

**KESİNLEŞEN MODEL** (`world_config.combat.hero`):
```
heroOff = 75 × seviye²          +  7.400 × fizSald   (× durum/100)  → saldırı havuzuna
heroDef = 3.000 + 140 × seviye  +    420 × fizSav    (× durum/100)  → P'ye
```
🎯 **Yüksek puanda seviye terimi gürültüye düşüyor:** lvl15/45 puan ile lvl20/60 puan aynı doğruya
oturuyor (7.400/puan). Oyunda puan zaten seviyeye bağlı olduğu için (3/seviye) iki eksen pratikte
tek eksen — model bunu doğal olarak yansıtıyor.

**Doğrulama (17 senaryo):** kazanan **17/17** · tur **16/17** · kahraman ölümü **17/17** ·
ortalama |sapma| saldıran kaybı **%5,9**, savunan kaybı **%5,6**.

#### ✅ TAVAN KALDIRILDI — ölçüm onu çürüttü
Y2/Y5 gösterdi ki **tam puanlı kahraman gerçekten ordu ölçeğinde**: lvl20 + 60 fizSald ile saldıran
**4.300 birimin yalnız 318'ini** kaybederek savunanı **4 turda** siliyor (5 değil). Yani "tek kahraman
orduyu ikame etmemeli" varsayımım oyunun gerçeğine aykırıydı. `hero.maxPoolShare` varsayılanı
**2,0** (ölçülen aralıkta devre dışı); alan yalnız **denge düğmesi** olarak duruyor — kısmak istersek
bu bir oyun tasarımı kararı olur, ölçüm değil.

#### Y turundan çıkan üç oynanış gerçeği
1. **Savunan kaybı DOYUYOR** (4.254 → 4.269 → 4.276 / 4.300 birim) — 24 puandan sonra öldürülecek
   ordu kalmıyor. Kahramanın büyüyen gücü artık **kendi kaybını** düşürmeye gidiyor (688 → 439 → 318).
2. **fizSald, fizSav'dan daha iyi korur:** 24 puan saldırı → kendi kaybı 688; 45 puan savunma → 908.
   Hızlı öldürmek, dayanmaktan daha etkili bir savunma (karşı-vuruş turu azalıyor).
3. ~~**Büyüye harcanan puan ZİYAN** (Y4)~~ — ❌ **ÇÜRÜDÜ (2026-07-29).** Y4 kurgusunda büyü fazı
   havuzu eksideydi, yani büyü puanının etkisini ölçemezdi. Büyü ağırlıklı ordularda büyü yetenekleri
   ÇALIŞIYOR; arayüzde caydırıcı uyarı **konmadı**.

#### Kalan sapmalar (dürüst kayıt)
- **Y5 (lvl20/60): saldıran kaybı 490 vs 318 (+%54).** Sebep yapısal değil eşik: model savaşı 4 turda,
  fit edilen değer 3 turda bitiriyor; bir fazlalık karşı-vuruş turu 172 birim fark yaratıyor
  (ordunun %4'ü). Tur sınırındaki bu hassasiyet için ayrı bir ölçüm gerekir.
- **Orta fizSald'da savunan kaybı %14-24 yüksek** (D1, S2, X2) — G/S/D turundan beri duran açık.

### 13.11.4d ⭐ KAHRAMAN YAŞAM DÖNGÜSÜ ve TECRÜBE PAYLAŞIMI (kullanıcı, 2026-07-29)

**Savaş modeli (binary, satır 12).** Kahramanın stat tablosu bulundu:
`hp/magicHp 1200 · pAtk/pDef 240 · mAtk 300 · mDef 4000`, `Alan = mDef × 0,005`.
```
stat = (sv+1) × taban × 1,07^sv  +  taban × (1 + k × yetenek)      // toplamsal, çarpımsal DEĞİL
```
Havuza katkı: **faz 2 → hp**, **faz 3 → magicHp**, faz 1'de yok. Yaşayan kahraman orduyu ayakta
tutar (tek başına tur çevirir); ölen kahraman ünite kaybı sayılır. Seviye 0 kahraman da savaşır.

**Ölüm koşulu:** kahraman **YALNIZ durumu %0,0'a inince** ölür — olasılık yok. Ölünce silinmez;
seviyesi ve yetenekleri korunur, ücretli diriltmeyi bekler.

**Ölümden sonra TEK yol — kahraman her hâlükârda eve döner** (kullanıcı kararı, 2026-08-01):

| Sağ kalan birlik | Dönüş süresi |
| :-- | :-- |
| **var** | Birlikler kahramanı **ölü olarak taşır** → ordunun süresi (`payload.travelSeconds`) |
| **yok** | Kahraman **yalnız başına** yürür → kendi hızı (`HERO_SPEED = 200`, `payload.heroTravelSeconds`) |

İki durumda da şehre varınca `dead` + `city_id` dolar ve Dirilt menüsü açılır. Savunanın kendi
şehrinde ölen kahraman zaten evdedir → **anında** diriltilebilir.

> ⛔ **YOK OLMA KALDIRILDI** (`0033_hero_no_destroy.sql`). Eskiden ordunun tamamı ölürse kahraman
> `destroyed` yazılıyor, tapınakta 1 saat "Yok Edildi" görünüyor ve sonra **kaydı siliniyordu** —
> oyuncunun kalıcı olarak bir varlığı kaybettiği tek yer burasıydı. `destroyed` durumu ve
> `destroyed_at` kolonu emekli oldu; migration mevcut satırları `dead`e çevirdi.
>
> ⚠️ Bu sadeleşme bir **hatayı da kapattı**: kahraman SAĞ kalıp bütün savaşçılar ölürse eski kod
> hiç dönüş görevi kurmuyordu ve kahraman `city_id = NULL` + yetim `mission_heroes` satırıyla
> kalıyordu; `mission_heroes_hero` tekil indeksi yüzünden bir daha HİÇ sefere çıkamıyordu.

⭐ **Süre KALKIŞTA hesaplanır.** `heroTravelSeconds` yola çıkarken `travelSeconds`in yanına
yazılır; dönüşte yeniden hesaplansaydı mesafe, Haritacılık ve dünya çarpanı o arada değişmiş
olabilir ve oyuncuya gösterilen süre ile gerçekleşen süre sessizce ayrışırdı. Alan **yalnız
kahraman taşıyan** görevlerde yazılır; yolda olan eski görevler `travelSeconds`e düşer.

**Etiket TEK: «Yok Edildi»** (kullanıcı kararı). Savaşta ölen her kahraman — ordusu sağ kalsın
kalmasın — raporda ve tapınakta böyle görünür; yolda olanın yanında varış geri sayımı da vardır.
İki ayrı etiket ("öldü" / "yok edildi") ancak biri diriltilemezken anlamlıydı.

Adı her durumda değiştirilebilir (şehirde · görevde · ölü · diriltilirken). Eski tek istisna —
yok edilmiş kahraman — artık yok. Adlar savaş raporlarında geçer.

**Tecrübe paylaşımı — İKİ TARAF DA ALIR.** Savaş tek bir XP havuzu üretir
(`(atkKayıp+defKayıp) × (kazananKaybı/kaybedenKaybı) × 0,001` — dengeli savaşta yüksek, ezici
savaşta ~0). Havuz taraflara bölünür:

```
kazanan tarafın payı = XP × 2/3
kaybeden tarafın payı = XP × 1/3
```

Sonra **her taraf kendi payını kendi kahramanları arasında** böler:
- yalnız **sağ çıkan** kahramanlar pay alır — ölen kahraman kazanan tarafta bile alamaz
- taraf içi ağırlık **seviyeyle TERS**: `1/(seviye+1)` → seviye 0 kahraman, seviye 15'ten **16 kat**
  fazla pay alır (yeni kahraman hızlı yetişsin)
- tek kahraman varsa payın **tamamını** alır
- payını kullanamayan tarafın (kahramanı yok ya da hepsi öldü) payı **ziyan olur**, karşıya geçmez

> ⚠️ Bu kural 2026-07-29'da değişti. Öncesinde XP **yalnız kazanana** veriliyordu.

**Seviye KENDİLİĞİNDEN atlar.** Eşikler birikimlidir (XP harcanmaz), bu yüzden tek savaştan
birkaç seviye birden çıkabilir. XP savaş anında yazılır ve seviye **aynı anda** güncellenir:
ordu daha dönüş yolundayken oyuncu tapınakta yeni seviyeyi görür. **`Seviye Arttır` düğmesi
YOKTUR** (kullanıcı kararı 2026-07-29) — oyuncuya kalan tek iş, seviye başına gelen 3 puanı
`Özellikler`den dağıtmak. Örnek: seviye 3'teki kahraman tek savaşta 5. seviyenin eşiğini
aşarsa anında **seviye 5** görünür ve **6 puan** dağıtılmayı bekler.

**Ölü ve diriltilmekte olan kahraman hiçbir sefere katılamaz** — saldırı, destek, nakliye.
Tek kapı `reserveHeroes` (`status = 'alive'` şartı), o yüzden kural her görev tipinde aynı.

**Çıkma ihtimali:** `(ToplamTapınak×10 − Kahraman×155) × min(1, XP×0,000025)`, XP > 499 kapısı,
en fazla 5 kahraman — 28/28 ölçüm. ⚠️ `ToplamTapınak` oyuncunun **TÜM şehirlerinin** tapınak
seviyeleri toplamıdır; diriltme süresi ise **o şehrin kendi** tapınağına bakar.


### 13.11.5 Çok şehir kuralları
- **Kaynaklar şehir bazlı:** her şehrin kendi altın/yemek kasası var, harcama o kasadan yapılır.
- **Teknikler oyuncu-genel** (`techs(player_id, type, level)`), ama **araştırma şehir bazlı**:
  `queues(city_id, category='tech')`. Bir şehrin akademisinde araştırma varken **o şehrin**
  Akademi'si yükseltilemez; diğer şehirler etkilenmez. Farklı şehirlerde **farklı teknikler**
  aynı anda ilerletilebilir. Süre o şehrin Akademi seviyesine göre (§13.9).
- **Aynı teknik iki şehirde aynı anda araştırılamaz** (seviye oyuncu-genel olduğu için çakışırdı) —
  sunucu doğrular.
- **Birim bulundurma ≠ üretebilme:** Baraka'sı yetmeyen bir şehre destekle Ejderha gönderilebilir ve
  orada durur/savunur; ama o şehirde Ejderha **üretilemez**. Ön-şartlar yalnız **üretimi** kapılar.
- **Ordu hareket limiti:** şehir başına eşzamanlı görev sayısı ≤ Baraka seviyesi (doküman).
- **Şehir terk etme:** başkent terk edilemez · o şehirde gelen/giden ordu, üretim, ilerletme olmamalı ·
  barakada savaşçı kalmamalı · terk edilince binalar silinir, kaynaklar yok olur, o şehirden gelen puan düşer.
- **Şehir kurma:** Sömürgecilik/3 kadar ek şehir (en fazla 5) · hedef koordinat boş olmalı ·
  **konum serbest — dünyanın herhangi bir kıtası/boş şehri** (mesafe kısıtı YOK) ·
  **yalnız Casus Kuş ile kurulamaz** (en az 1 casus-dışı savaşçı şart) · yanında kaynak götürülebilir ·
  varışta yer doluysa ordu **geri döner** (aynı süre) · yeni şehir §13.11.1 başlangıç seviyeleriyle doğar.

### 13.11.6 ⭐ CASUSLUK — KESİŞİM MODELİ (kullanıcı tasarımı, 2026-07-30)

**Bilgi kademesi doküman-birebir** (değişmedi):
```
etkinFark = (benimCasusluk + log2(GÖNDERİLEN kuş)) − rakipCasusluk
```
fark <0 → yalnız kaynak · 0 → +Maden/Çiftlik · 1 → +toplamlar · 2 → +tipler · 3 → +savaşçı
adetleri · ≥4 → +teknikler, Kale/Sur/Kalkan. 256 da 300 de `2^8` bandı — kademe aynı; fark
kesişimde çıkar (aşağıda). Bonus **gönderilen** kuştan (kullanıcı kararı — doküman-birebir).

**Kesişim** (`spyInterception`, catalog — eski "savunmaPuanı/kayıpOranı" formülü KALKTI):
```
espK    = 2^clamp(rakipEsp − benimEsp, −6, +6)
K_vur   = (kule×1,0 + elf×0,2) × espK        // yalnız Kule + Elf VURUR (doküman)
K_engel = rakipKuş × 1,0 × espK              // rakip kuşlar VURMAZ, ENGELLER (jam)
ölen    = min(gönderilen, round(K_vur))       // kule/elf yoksa kayıp yok
bilgi   = max(0, gönderilen − ölen − round(K_engel))
```
- **bilgi ≥ 1** → kademe kadar istihbarat gelir; 0 → hiçbir şey sızmaz.
- **Engellenen kuş ölmez, eve döner** — eşit seviyede kuşa kuş: rakipte gönderdiğin kadar kuş
  varsa "kimse kimseden casusluk bilgisi alamaz" (kullanıcının açmazı) ama kimse ölmez.
- **Deterministik** (jitter yok): kullanıcının örneği birebir — savunma K_vur=280 ise 256 kuşun
  TAMAMI vurulur, 300 kuştan 280'i vurulur ve kalan 20'si bilgiyi getirir.
- `2^fark` tabanı bilinçli: **+1 casusluk seviyesi ≙ kuşları ikiye katlamak** — kademe
  tarafındaki `log2(kuş)` ile aynı cetvel. En büyük çarpan seviye farkı (kullanıcı şartı);
  kule/elf/kuş ancak ÇOK üstün sayılarda net engel kurar.
- **Okçuluk tekniği bilerek denklem dışı** (kullanıcı: "çok fazla değişken olur").
- ⭐ **Savunan kuş sayısını VARIŞTAN ÖNCE bilir** (2026-07-31, §13.10.1): gelen casusluk
  satırında "Casus Kuş 64" yazar. Bu yeni bilgi açmıyor — Casusluk Önleme Raporu zaten kuş
  sayısını söylüyordu; yalnız **zamanlaması öne çekildi**, savunan varıştan önce karşı kuş
  üretip üretmeyeceğine karar verebiliyor. Kesişim formülü ve sweep tablosu etkilenmedi.
- **Casusluğun işi HEDEF ŞEHRİ keşfetmek**, yoldaki orduyu değil: oyunun kendi dokümanı da
  casusluğu böyle tarif ediyor (kaynak · bina/teknik seviyeleri · garnizon · savunma).

**Maliyet dengesi** (sweep: `packages/catalog/scripts/spy-balance.mjs`, kilit:
`packages/catalog/test/spy.test.ts`): engelleme başına maliyet **kuş 300 < kule 750 < elf
5.500** kaynak — adanmış sayaç daima kuş, kule çift görevli, elf'in anti-havası yan görev.
Sweep özeti (eşit seviyede 1 bilgi kuşu sızdırma eşiği):
| Savunan | Eşik | Maliyet |
| :-- | --: | --: |
| 10 kule + 100 elf (erken) | 31 kuş | 9,3k |
| 150 kule + 2k elf + 50 kuş (orta) | 601 kuş | 180k |
| 1k kule + 20k elf + 1k kuş (geç) | 6.001 kuş | 1,8M |

Her satırda ±1 casusluk seviyesi eşiği tam **ikiye katlar/yarılar** — erken/orta/geç oyunda
ölçek bozulmaz. Not: kesişimi aşan uçuşlar `log2` bonusuyla neredeyse hep TAM rapor alır;
kademeli bilgi küçük uçuşlarda (savunmasız hedefler) yaşar — bu, "gönderilen kuştan bonus"
kararının bilinen sonucudur.

**Raporlama (kullanıcı, 2026-07-30):** iki rapor da casusluğun **çözüldüğü anda** yazılır,
kuşların dönüşü beklenmez. Savunan **HER casuslukta** "Casusluk Önleme Raporu" alır: kaç kuş
geldi, kaçı vuruldu/engellendi ve **hangi bilgi sızdı** (`leakedLevel`). Sessiz casusluk yok.
Gönderenin raporunda `birdsLost`/`birdsBlocked`/`level`/`intel`.

**TAM KAYIP:** tüm kuşlar vurulursa dönüş görevi oluşmaz (§13.11.7'nin ikizi). Savunma tabanı
(§13.11.10, min 4 kule) sayesinde kule üretmiş şehrin vurma şansı hiçbir zaman sıfırlanmaz.

### 13.11.7 Tam kayıp = dönüş yok (tüm görev tipleri)
Veritabanı ve handler bunu destekler: savaş/casusluk sonrası hayatta kalan birim **yoksa**
`type='return'` görevi **oluşturulmaz**; ganimet de yoktur. Rapor "ordudan kimse dönmedi" der.
⭐ **TEK İSTİSNA KAHRAMAN** (2026-08-01): orduda kahraman varsa dönüş görevi yine kurulur ve
süresi **kahramanın kendi hızıyla** hesaplanır (`payload.heroTravelSeconds`). Ganimet yine yok,
rapor yine "ordudan kimse dönmedi" der — dönen yalnız kahramandır (§13.11.4d).

### 13.11.8 Destek görevi (tek yönlü)
- Destek **gider ve kalır**: birlikler hedef şehrin garnizonuna, kahramanlar o şehrin Tapınak'ına yazılır.
- Yanında götürülen kaynak **hedef şehrin kasasına** eklenir.
- Otomatik dönüş **yoktur**; geri almak için o şehirden yeni bir destek görevi başlatılır.
- Kullanıcı kararı: destek **yalnız kendi şehirleri arasında** → tek taraflı görünürlük.

### 13.11.9 İkonlar — dosya adı ve klasör sözleşmesi
**Kullanıcıda tüm ikonların yüksek çözünürlüklü hâlleri var (teknikler dahil)** → jar'dan çıkarma
mantığıyla uğraşılmayacak. Jar'dan çıkarılan 31 ikon (`assets/ikonlar/`) yalnız **yer tutucu/
karşılaştırma** olarak duruyor, üretimde kullanıcının görselleriyle değiştirilecek.

**Kural: dosya adı = katalogdaki `id` alanı.** Kod ikon yolunu `assets/<klasör>/<id>.png` diye
üretir; ayrı bir eşleme tablosu YOK, isim yanlışsa yer tutucu görünür.
**Ad biçimi:** küçük harf · **İngilizce** (§13.14) · Türkçe karakter YOK · boşluk yerine `_` ·
uzantı `.png` (şeffaf) veya `.webp`. Türkçe adlar katalogda `name.tr` alanında yaşar, dosya adında değil.

```
apps/web/public/assets/
├─ units/       dwarf · elf · cavalry · pegasus · dragon · mangonel · ogre · shaman
│               spy_bird · cargo_wagon · gnome · chaos · hero                        (13)
├─ defenses/    archer_tower · trap · oil_cauldron · mangonel_tower · guard · ballista
│               wall · magic_shield                                                  (8)
├─ buildings/   farm · mine · barracks · academy · castle · architect_school
│               cave · temple · teleport                                             (9)
├─ techs/       archery · blacksmithing · cartography · sorcery · espionage · armor
│               chemistry · masonry · colonization · night_vision · instinct · talisman (12)
├─ missions/    attack_out · attack_back · transport_out · transport_back
│               support · spy_out · spy_back · found_city · teleport
│               incoming_attack                                                      (10)
└─ ui/          gold · food · area · time · score · message · report · confirm · cancel
                hero_badge · premium · chat · chat_alliance · chat_global · chat_dm
                theme_day · theme_night · placeholder                                (17)
```
> **Not:** birim "Mancınık" (saldırı birimi) ile savunma "Mangonel"i ayırmak için savunma
> klasöründe `mangonel_tower` kullanılıyor — aynı klasörde çakışma olmasın diye değil, katalog
> `id`'leri **global tekil** olduğu için.
- **Boyut:** kaynak dosyalar **256×256** (veya en az 128×128) kare, şeffaf arka plan. Ölçekleme
  derleme sırasında yapılır (`@1x/@2x` veya CSS) — sen tek boyut koy, gerisini ben hallederim.
- **`missions/`** ikonları görev listelerinde kullanılacak: `tip + yön` kombinasyonu
  (senin hatırladığın "nakliyede gönderen yeşil, alıcı sarı tekerlek" ayrımı buradan gelir).
  Aynı görselin renk varyantıysa tek dosya + CSS filtresi de yeter — nasıl vereceğini sen söyle.
- Katalog kaydı örneği: `{ "id": "dragon", "name": { "tr": "Ejderha" }, "category": "unit", … }` →
  ikon otomatik `assets/units/dragon.png`.
- Eksik ikon → `assets/ui/placeholder.png` (konsola uyarı, çökme yok).
- ⚠️ İkonları **bu adlarla** teslim etmen yeterli; Türkçe adlı bir set gönderirsen tek seferlik bir
  yeniden adlandırma betiği (`scripts/rename-assets.ts`) eşlemeyi yapar.

### 13.11.10 ⭐ SAVUNMA TABANI — "her birimden en az 4 kalır" (kullanıcı kuralı, 2026-07-26)

**Kural (kullanıcı):** bir şehirde bir savunma birimi tipinden **4'ten fazla** varsa, o şehre yapılan
saldırı ne kadar ezici olursa olsun **o tipten en az 4 tanesi ayakta kalır**. Böylece her şehir çok
küçük ordulara karşı minimal de olsa bir savunma şansını **kalıcı** korur.

```
korunan(t)       = min(4, savasOncesiAdet(t))          // her TİP için ayrı; 3 varsa 3 korunur
savasSonrasi(t)  = max(korunan(t), onarimSonrasi(t))
netKayip(t)      = savasOncesiAdet(t) − savasSonrasi(t)
```

**İşlem sırası (motor içinde, sıralama önemlidir):**
| # | Adım | Neden bu sırada |
| :-: | :-- | :-- |
| 1 | Savaş çözülür (tur döngüsü) → **ham kayıplar** | taban savaşın matematiğine karışmaz; 4'lükler normal savaşır |
| 2 | **Kazanan ham kayıplarla** belirlenir (`defLossMag > atkLossMag`) | taban sonradan uygulansaydı 5 balistalı şehir, ordusu silinmişken "kazanan" ilan edilirdi |
| 3 | Yapı onarımı %50-70 (mevcut kural) | taban onarımın **üstüne** bir zemin koyar, yerine geçmez |
| 4 | **Taban clamp'i** (yukarıdaki formül) | |
| 5 | **Enkaz ve XP `netKayip`'tan** hesaplanır | ⚠️ kritik: yoksa saldıran aynı dokunulmaz 4'lükleri her seferinde "öldürüp" sonsuz enkaz üretirdi |

**Kapsam:** `combat.defenseFloor.protectedTypes` = `archer_tower · oil_cauldron · mangonel_tower ·
guard · ballista` (kalıcı, adetle sayılan 5 savunma birimi).
- **Tuzak HARİÇ** — tek kullanımlık mühimmat, tetiklenince tüketilir (*"tetiklenen tuzak onarılmaz"*),
  dolayısıyla "yıkıldı" değil "kullanıldı" sayılır. **Bu benim yorumum**; dâhil etmek istersen
  config dizisine `"trap"` eklemek yeterli, kod değişmez.
- **Sur / Büyü Kalkanı kapsam dışı** — bunlar adet değil **seviye + bütünlük** ile modelleniyor
  (§13.11.1b), kendi onarım mekanizmaları var.
- Savunma birimi hiç üretmemiş şehir korunmaz (0 → 0). Kural birimi **yaratmaz**, yalnız **korur**.

**Denge etkisi (hesaplandı):** 4'er adetlik taban garnizon (4 balista + 4 mangonel + 4 muhafız +
4 kazancı + 4 okçu kulesi) toplam ~6.000 birim-gücü demek — 50 cücelik bir yağma ordusunu (~450)
rahat eler, ama gerçek bir ordunun (10⁵ mertebesi) karşısında gürültü seviyesinde kalır. Kullanıcının
istediği denge tam olarak budur: *"minimal de olsa her şehir için çok küçük ordulara karşı bir
savunma şansı"*.

**Yan etkileri (bilinçli):**
- Savunan için **bedava**: geri gelen birimler yeniden üretilmez, kaynak harcamaz. Rapor bunu ayrıca
  gösterir: *"Savunma tabanı devreye girdi: okçu kulesi 4, balista 4 … korundu."*
- Bir şehri **savunmasız bırakmak imkânsız** hale gelir → §13.10.4'teki eski "yalnız savunmasız şehir
  yağmalanır" şartı ölü kural olurdu; bu yüzden yağma şartı `attackerWon` yapıldı (aynı oturumda).
- Casusluk: 4 okçu kulesi kalıcı → casus vurma şansı hiç sıfırlanmaz (§13.11.6 tablosu).
- Sur kapasitesi (§13.11.1b) **ihlal edilmez**: taban savaş öncesi adedi aşamaz.
- Simülatörde de aynı kural işler (aynı motor) → oyuncu "4'lük kalıntıyı" hesaba katarak planlar.

**Test (Faz 0'da yazılacak):** ① 100 balistalı şehre ezici saldırı → 4 balista kalır ② 3 balistalı
şehir → 3 kalır (min(4,3)) ③ aynı şehre arka arkaya 5 saldırı → enkaz 2.'den itibaren 0'a yaklaşır
(sonsuz çiftlik yok) ④ taban açık/kapalı kazanan aynı çıkar (adım 2 doğrulaması).

---

## 13.12 ⭐ SOHBET SİSTEMİ — üç kanal, tek altyapı (kullanıcı isteği, 2026-07-26)

Kullanıcı isteği: *ittifak sohbeti (yalnız üyeler, WS ile gerçek zamanlı)* + *oyuncudan oyuncuya özel
mesaj (eski oyundakinin interaktif hâli)* + *Genel Sohbet (beta/geliştirme geri bildirimi)*.
Üçü de **aynı çekirdek** üzerinde çalışır; fark yalnız **kimin hangi kanala erişebildiği**.

### 13.12.1 Kanal türleri
| Kanal | `kind` | Kim görür | Ne zaman | Not |
| :-- | :-- | :-- | :-- | :-- |
| **Genel Sohbet** | `global` | dünyadaki herkes | **Faz 2** (beta'nın ilk günü) | dünya başına 1 kanal; `chat.globalEnabled` ile kapatılabilir (canlı sürümde kapatma seçeneği kalsın diye) |
| **İttifak** | `alliance` | yalnız o ittifakın üyeleri | **Faz 4** (ittifak sistemiyle) | ittifak başına 1 kanal; üyelikten çıkan **geçmişi de göremez** |
| **Özel mesaj (DM)** | `dm` | iki oyuncu | **Faz 3** | eski oyunun ilkel mesaj kutusunun yerini alır |

- **Kanal oluşumu:** `global` dünya kurulurken, `alliance` ittifak kurulurken, `dm` **ilk mesajda
  tembel** (lazy) yaratılır.
- Sistem duyuruları `global` kanala `sender_id IS NULL` + `is_pinned` ile düşer (beta duyurusu, bakım
  uyarısı) — ayrı bir mekanizma kurulmaz.

### 13.12.1b ⭐ DÜNYA YALITIMI — pazarlıksız (kullanıcı kararı, 2026-07-26)
**Sohbetin üç türü de dünya başına ayrıdır.** Dünya 1'deki Genel Sohbet Dünya 2'de görünmez; aynı
hesabın iki dünyadaki oyuncuları **birbirine DM atamaz**; ittifak zaten dünyaya bağlı.

| Katman | Kapsam | Nerede |
| :-- | :-- | :-- |
| E-posta, parola, oturum, **tema/dil tercihi**, push aboneliği | **hesap** (dünyalar üstü) | `accounts`, `sessions`, `push_subscriptions` |
| Kullanıcı adı, puan, şehirler, teknikler, ittifak, **tüm sohbet ve mesajlar** | **dünya** | `players` ve `world_id` taşıyan her tablo |

**Uygulama garantileri** (üçü birden, tek birine güvenilmez):
1. **Şema:** `chat_channels(world_id)` + `UNIQUE(world_id, dm_key)` / `UNIQUE(world_id) WHERE
   kind='global'` → aynı `dm_key` farklı dünyalarda **ayrı kanal**, çakışma imkânsız.
2. **Sorgu:** her sohbet sorgusu `world_id = :ctx.worldId` ile çalışır; `ChatAccessService` katılımcı
   ile kanalın `world_id`'sini karşılaştırır, eşleşmezse **403** (`dm_key` üretimi `player.id`
   üzerinden yapılır, `account.id` üzerinden **asla**).
3. **Soket:** oda adı `w{worldId}:chat:{channelId}` — dünya kimliği oda adının parçası; bağlantı
   handshake'inde JWT içindeki `worldId` sabitlenir, olay yükünden okunmaz.
- **Push bildirimi hesaba gider ama içerik dünya etiketlidir** ("Dünya 2 · Ayla sana mesaj yazdı") —
  hesap tek olduğu için kaçınılmaz; sızan bilgi yalnız "başka dünyada mesajın var".
- Oyuncu arama, engelleme listesi, şikâyet kayıtları da dünya-kapsamlıdır.
- **Test (Faz 2):** aynı hesabın iki dünyadaki oyuncusu arasında DM kanalı **açılamaz**; Dünya 1
  Genel Sohbet mesajı Dünya 2 soketine **düşmez**; `world_id` filtresi kaldırılınca test **kırmızıya
  döner** (yalıtım regresyon testi).

### 13.12.2 Veri modeli
```sql
chat_channels(id, world_id, kind, alliance_id, dm_key, slow_mode_s, created_at)
  -- dm_key = least(a,b)||':'||greatest(a,b)  →  UNIQUE(world_id, dm_key) çift kanalı imkânsız kılar
  -- UNIQUE(world_id, alliance_id) WHERE kind='alliance' · UNIQUE(world_id) WHERE kind='global'
chat_participants(channel_id, player_id, last_read_message_id, muted_until, notify, joined_at)
  -- PK(channel_id, player_id) · 'global' için satır YOK (üyelik örtük), okunmamış sayacı ayrı tutulur
chat_messages(id bigserial, channel_id, world_id, sender_id, body text, created_at,
              deleted_at, deleted_by)                 -- düzenleme YOK, yalnız silme (basitlik)
chat_bans(id, world_id, player_id, scope, until, reason, created_by)   -- scope: 'global'|'all'
```
- **Okunmamış sayacı** `last_read_message_id`'den türetilir: `COUNT(*) WHERE id > last_read`.
  `chat_messages(channel_id, id DESC)` indeksiyle bu sorgu sabit maliyetli.
- **Sayfalama** id imleciyle: `WHERE channel_id=$1 AND id < $cursor ORDER BY id DESC LIMIT 50`
  (offset yok → derin geçmişte de hızlı).
- **Saklama:** `chat.retentionDays` (global 30 · ittifak 180 · **DM süresiz**). Gece işi eski
  satırları siler; `chat_messages` aylık partition (`messages`/`audit_log` politikası, §1.3).
- **⭐ SİLME MODELİ (kullanıcı kararı 2026-07-31): tek mesaj SİLİNEMEZ, sohbet TEK TARAFLI
  temizlenir.** `chat_participants.cleared_before_message_id` bir çizgidir: o oyuncunun geçmiş
  sorgusu `id > cleared_before_message_id` ile filtreler.
  - Karşı tarafta sohbet **aynen durur**; `chat_messages` satırlarına hiç dokunulmaz.
  - Silen kişi yeni mesaj alınca sohbeti **yeniden görür — yalnız yeni mesajlarla**; eskiler
    bir daha görünmez. Bu davranış tek kolondan bedava çıkıyor (`deleted_at` olsaydı her yeni
    mesaj yolunda onu NULL'a çekmeyi hatırlamak gerekirdi — unutulacak bir adım).
  - **İki taraf da silse veri SUNUCUDA KALIR**, yalnız iki tarafla bağı kopar: *"ileride bir
    anlaşmazlıkta veya hukuki olarak yöneticinin işine yarayabilir"* (kullanıcı).
  - ⚠️ Silme `last_read_message_id`'yi de aynı değere zıplatır; yoksa okunmamış bir sohbeti
    silince **hayalet rozet** asılı kalırdı.
- **Şikayet kaydı** `chat_reports` (migration 0020): mesaj ya da oyuncu bazlı, `body_snapshot`
  ile gövde kopyası saklanır (retention silse de kanıt kalır). FK'lerde CASCADE **yok** —
  kayıt şikayet ettiği mesajdan ve kanaldan uzun yaşamalı. Moderasyon paneli sonraki tur.

### 13.12.3 Taşıma ve olay sözleşmesi (socket.io)
Oda adı: `w{worldId}:chat:{channelId}`. Bağlanınca istemci **yalnız yetkili olduğu** odalara katılır;
yetki `ChatAccessService.canRead/canWrite(player, channel)` ile **her olayda** yeniden doğrulanır
(ittifaktan atılan oyuncunun açık soketi anında düşer — `alliance:member_removed` olayında `leave`).

| Yön | Olay | Yük |
| :-- | :-- | :-- |
| ← sunucu | `chat:message` | `{channelId, id, senderId, senderName, body, createdAt}` |
| ← sunucu | `chat:deleted` | `{channelId, id}` |
| ← sunucu | `chat:presence` | `{channelId, online: playerId[]}` (yalnız `alliance`) |
| ← sunucu | `chat:typing` | `{channelId, playerId}` (yayılır, saklanmaz) |
| → istemci | `chat:send` | `{channelId, body, clientMsgId}` → **ack** ile `{id, createdAt}` döner |
| → istemci | `chat:typing` | `{channelId}` — istemcide 3 sn'de bir kısılır |
| → istemci | `chat:read` | `{channelId, lastReadMessageId}` — 1 sn debounce |

- `clientMsgId` (uuid) **idempotency**: yeniden bağlanmada çift gönderim engellenir; istemci mesajı
  iyimser (optimistic) gösterir, ack gelince gerçek `id` ile değiştirir.
  ⚠️ **Yeniden deneme kontrolü limitlerden ÖNCE** gelir: aynı `client_msg_id` zaten yazılmışsa
  var olan satır döner. Sonra bakılsaydı, ağı kopan istemcinin tekrarı "mükerrer mesaj" reddi
  alır ve mesaj gönderilmiş olmasına rağmen kaybolmuş görünürdü (test bunu yakaladı).

> ### ⭐ TAŞIMA KARARI DEĞİŞTİ (2026-07-31) — gönderim REST, alım WS
>
> Yukarıdaki `chat:send` + ack tasarımı DM turunda **uygulanmadı**. Fiilî sözleşme:
> * **REST:** konuşma açma · mesaj gönderme · geçmiş · okundu · sohbeti silme · engelle · şikayet
> * **WS (istemci→sunucu):** yalnız `chat:open` / `chat:close` / `chat:typing`
> * **WS (sunucu→istemci):** `chat:message` (yalnız KİMLİK: `{channelId, messageId}`) · `chat:typing`
>
> İki gerekçe: **(1)** soketin JWT'si el sıkışmada donuyor ve token yenilenince soket komple
> yeniden kuruluyor — o pencerede gönderim başarısız olurdu; REST istemcisi 401'de şeffaf
> yenileyip isteği tekrarlıyor. **(2)** Gateway'in en güçlü değişmezi ("oyun durumu WS
> üzerinden DEĞİŞTİRİLEMEZ") böylece hiç delinmiyor: kabul edilen üç olayın hiçbiri kalıcı
> durum yazmıyor.
>
> ⚠️ **Mesaj gövdesi kanal odasından GEÇMEZ.** Olay iki tarafın KİŞİSEL odasına gider
> (`w{w}:p{id}`) — pencere kapalıyken de rozetin düşmesi gerekiyor. Kanal odasının
> (`w{w}:chat:{id}`) tek işi "yazıyor…".

- Geçmiş yükleme **REST** ile: `GET /api/v1/chat/conversations`,
  `GET /api/v1/chat/conversations/:id/messages?before=` (keyset, sayfa 30).
- **Ölçek:** Redis varsa socket.io Redis adapter, yoksa (küçük sunucu profili, tek süreç) bellek-içi
  adapter — kod aynı (§4.0'daki `ROLE=all` profili bozulmuyor).
- Yeniden bağlanma: istemci `lastSeenMessageId` gönderir → sunucu aradaki mesajları REST'ten
  çektirir; WS'te "kaçan mesaj" telafisi yapılmaz (tek doğruluk kaynağı DB).

### 13.12.4 Kötüye kullanım, moderasyon, gizlilik
- **Rate limit** (kova, oyuncu başına): `chat.rateLimit` = 10 sn'de 5 mesaj; aşınca ack `{error:"rate"}`
  ve istemcide geri sayım. Ayrı kova: oyun REST kovasından bağımsız.
- **Slow mode** `global` kanalda varsayılan 5 sn (`slow_mode_s`); ittifak/DM'de 0.
- **Genel Sohbet'e yazma eşiği:** doğrulanmış e-posta + oyuncu yaşı ≥ 60 dk
  (`chat.minPlayerAgeMinutesForGlobal`) → sıfırıncı dakika spam botu engellenir. Okuma serbest.
- **⭐ DM acemi kısıtı (kullanıcı kararı):** oyuncu o dünyada **12 saatini doldurmadan yeni bir özel
  konuşma BAŞLATAMAZ** (`chat.minPlayerAgeHoursForDm: 12`). Amaç: kayıt→spam/dolandırıcılık botu ve
  çok-hesap tacizi.
  - **Yaş ölçütü `players.created_at`** (o dünyaya katılım), `accounts.created_at` değil — sohbet
    dünya-kapsamlı olduğu için (§13.12.1b) yeni dünyaya giren eski hesap da o dünyada yenidir.
    *Bu benim yorumum; hesap yaşı istersen `ageSource: "account"` tek satırla değişir.*
  - **Cevap hakkı saklı:** kısıtlı oyuncu, **kendisine yazılmış** bir konuşmaya cevap verebilir
    (`chat.dmAllowReplyWhileRestricted: true`). Aksi hâlde yeni oyuncu, ona yardım etmek isteyen
    ittifak liderine cevap veremezdi.
  - İttifak sohbeti bu kısıttan **muaf** (üye kabul edilmiş olması zaten bir güven filtresi).
  - Arayüz: "Mesaj gönder" düğmesi pasif + kalan süre ("Özel mesaj gönderebilmen için 7 sa 12 dk").
- **Uzunluk** ≤ 500 karakter, **düz metin** (HTML/markdown yok); istemci kaçış yaparak basar,
  bağlantılar istemcide `rel="noopener nofollow"` ile linklenir. XSS yüzeyi sıfır.
- **Susturma/yasak:** `chat_bans` (yönetici) + kanal bazlı bildirim susturma (`muted_until`,
  `notify=false`). Her moderasyon işlemi `audit_log`'a düşer.
- ⭐ **MÜKERRER MESAJ KORUMASI (2026-07-31'de eklendi):** aynı metin aynı sohbete **15 sn**
  içinde tekrar gönderilemez (`duplicate_message`). Planda yoktu; `mesajlar.txt`'teki rakip
  yapımın beta dökümü bunun gerçek bir ihtiyaç olduğunu gösteriyor (aynı satırın arka arkaya
  5 kez gönderildiği örnekler var, o yapım da 15 sn koymuş).
- ⭐ **OYUNCU ENGELLEME — TEK YÖNLÜ + AÇIK UYARI (kullanıcı kararı 2026-07-31).**
  Orijinal `g.java` metni tek yönlüydü (*"bundan sonra gelecek tüm mesajları engelliyorsunuz"*);
  eski planımız karşılıklı yapmıştı. Kullanıcı ikisinin ortasını seçti:
  - **Engellenen → engelleyene yazamaz** ve sebebini ÖĞRENMEZ: `blocked` kodu, ekranda
    **"Mesajınız iletilemedi!"**. Engelin varlığı doğrulanmaz (kullanıcı: *"doğrudan bu oyuncu
    seni engelledi yazmasın ama anlasın yani bir şeylerin ters gittiğini"*).
  - **Engelleyenin kendi kutusu da kapanır** ama ona sebep AÇIKÇA söylenir (`blocked_by_me`:
    *"Bu oyuncuyu engelledin. Mesaj göndermek için engeli kaldır."*) — kendi verdiği kararı
    zaten biliyor, ona yalan söylemeye gerek yok. Bu, tek yönlü modelin "engelleyen taciz
    etmeye devam eder" açığını da kapatıyor.
  - **Başka hiçbir kısıt doğurmaz** (kullanıcı: *"sadece mesaj gönderemez"*): dünya listesi,
    savaş, casusluk, ittifak etkilenmez. Tablo `player_blocks`, dünya-kapsamlı.
- **Şikayet iki düzeyde:** mesaj şikâyeti (`chat_reports`) **ve** oyuncu şikâyeti — orijinalde
  ayrı bir uç (`skMsj.do`, menü *"Şikayet Et"*). İkisi de yalnız kayıt üretir, otomatik ceza YOK.
- **Şikâyet:** mesajın yanındaki bayrak → `chat_reports` (Faz 4'te panel; Faz 2'de sadece kayıt).
- **Gizlilik:** DM'ler yöneticiye **otomatik açılmaz**; yalnız şikâyet edilen mesaj ve ±5 komşusu
  görünür (denetim kaydıyla). Bu kural koda gömülür, ayrıcalıklı sorgu yolu bırakılmaz.
- Sohbet **oyun durumunu değiştiremez**: `ChatModule` yalnız `chat_*` tablolarına yazar, `missions`/
  `cities` servislerine bağımlılığı yoktur (§7 istisnası bu izolasyonla güvenli).

### 13.12.5 Arayüz — bottom sheet (kullanıcı isteği: kendi rotası yok)
> ⚠️ **BU BÖLÜM YENİDEN YAZILDI (2026-07-31).** Eski tasarım — üç sekmeli sheet, snap noktaları,
> Zustand, `?chat=` parametresi, `ChatTabs`/`ChatPresenceDots` — **geçersiz**. Kullanıcı DM için
> tek kişilik bir pencere istedi; genel/ittifak kanalları geldiğinde sekme ihtiyacı yeniden
> değerlendirilecek.

**Masaüstü: sağ alt köşe penceresi** (kullanıcı: *"tıpkı Facebook'ta olduğu gibi"*), 320×448,
`right-3 bottom-3`. **Mobil: bottom sheet**, ekranın %80'i (`h-[80dvh]`, `inset-x-0 bottom-0`,
üstten yuvarlak köşeli). `xl`'de sağ panelin soluna kayar (`xl:right-[16.5rem]`).

- **Aynı anda YALNIZ tek kişiyle sohbet** (kullanıcı kuralı) — sunucu da zorlar: `chat:open`
  önce eski kanaldan çıkar.
- **Modeless:** `Modal` bileşeni KULLANILMAZ (o `body.overflow`u kilitliyor ve dışarı tıklamada
  kapanıyor). Oyuncu sohbet açıkken oyununu oynar, geri sayımlar akar. **z-30**: mobil alt bar
  (20) üstünde, modallar (40) altında → onay diyaloğu sohbetin önüne çıkar.
- **Rota yok, `<Routes>` DIŞINDA:** `ChatProvider` Shell'i sarar, sayfa değişince pencere kapanmaz.
- **Ters sonsuz kaydırma:** sayfa 30 mesaj; yukarı kaydırınca eskiler yüklenir ve
  `useLayoutEffect` + `scrollHeight` deltasıyla **kaydırma konumu korunur** (canlı ölçüm:
  30→60 balon, `scrollTop` 0→1655, sıçrama yok).
- **Composer:** Enter gönderir / Shift+Enter satır atlar, ≤500 karakter, "yazıyor…" istemcide
  2,5 sn'de bir kısılır. ⚠️ **Gönderirken onay SORULMAZ** (kullanıcı; orijinaldeki *"Mesaj
  gönderilecek. Emin misiniz!"* bilerek kaldırıldı).
- **Pencere menüsü (⋮):** Oyuncuyu engelle / Engeli kaldır · Şikayet Et · Sohbeti sil —
  üçü de `useConfirm` ile, orijinal *"… Emin misiniz!"* kalıbıyla.
- **Giriş noktaları:** Dünya modalında **Mesaj** düğmesi (orijinalde de oradaydı, `g.java:1440`
  case 12) → hedef modalı kapanır, pencere açılır · Mesajlar sekmesindeki sohbet satırı ·
  Sıralamalar tablosundaki mesaj ikonu. Hepsi tek kapıdan: `useOpenChat()(playerId, ad)`.
- Bileşenler: `ChatProvider` (`lib/chat-context.tsx`) · `ChatWindow` (`components/`).

### 13.12.6 Bildirim ve okunmamış
- **Rapor kutusundan bağımsız:** sohbet mesajı `messages` tablosuna **yazılmaz**.
  ⭐ Ama **Mesajlar sekmesinde görünür** (kullanıcı 2026-07-31): iki sorgu istemcide **tarihe
  göre tek listede** birleşir; sohbet satırında karşı tarafın son mesajının satıra sığdığı
  kadarı önizlenir. Sol menü rozeti iki sayacın toplamıdır.
- **⭐ OKUNMAMIŞ İSTEMCİ GÜDÜMLÜ:** mesaj daima okunmamış yazılır; **pencere o kanal için
  açıksa VE sekme görünürse** istemci `POST /read` ile imleci ilerletir. Sunucu "odada mı"
  diye BAKMAZ — arka plandaki sekme de odadadır ama oyuncu mesajı görmemiştir; okundu saymak
  mesajı sessizce kaybettirirdi. Pencere kapalıyken mesaj okunmamışa düşer (canlı doğrulandı).
- Push: DM **açık** (`chat.dmPush`), ittifak/genel kapalı. Zemin hazır: `chat:dm` outbox
  satırı `recipientId` + `preview` taşıyor; `worker.ts`'te "alıcı çevrimdışıysa push" dalı
  no-op olarak bekliyor. ⚠️ İkinci bir dispatcher sink'i EKLENMEMELİ — dispatcher tek `'*'`
  sink çağırıyor, ikincisi birincisini susturur.

### 13.12.7 Test
`apps/api/test/chat.test.ts` (25 test): kanal tekilliği (iki yönde tek satır) · **dünya
yalıtımı** · engelleme (iki yön iki farklı kod) · rate limit · mükerrer · `clientMsgId`
idempotency · **tek taraflı silme + yeniden görünme + hayalet rozet yok** · okunmamış sayacı ·
acemi kısıtı (cevap hakkı saklı) · şikayet + snapshot · keyset sayfalama.
`realtime.test.ts`: `chat:dm` eşlemesi + olayın **gövde taşımadığı**.

---

## 13.13 ⭐ TEMA: GECE/GÜNDÜZ + ANTİK PALET (kullanıcı isteği, 2026-07-26)

Kullanıcı isteği: *hem Flutter hem web için gece-gündüz modu, antik bir oyuna yakışan renkler,
**tek yerden yönetilebilir***.

> ⚠️ **Ad karışıklığı uyarısı:** buradaki "gece" **arayüz temasıdır**. Oyunun savaş mekaniğindeki
> gece (`nightBattle`, Gece Görüşü tekniği) apayrı bir şeydir. Kodda tema için **`theme`**, mekanik
> için **`nightBattle`** kullanılır; asla `night` tek başına.

### 13.13.1 Tek kaynak: `packages/design-tokens`
```
packages/design-tokens/
├─ tokens.json          # ⭐ TEK KAYNAK — ham palet + semantik eşleme (light/dark)
├─ build.ts             # üreteç (elle dosya düzenlenmez)
└─ dist/
   ├─ tokens.css        # :root{--mw-*} + :root[data-theme="dark"]{…}
   ├─ tokens.tw.css     # Tailwind v4 @theme bloğu
   ├─ tokens.ts         # TS sabitleri + tip (web/kod içinden erişim)
   └─ tokens.dart       # Flutter: MobiwarColors + ColorScheme + ThemeData
```
- Renk **hiçbir bileşende sabit yazılmaz**; lint kuralı (`no-hex-colors`) ham hex'i CI'da reddeder.
- `pnpm tokens:build` çıktısı depoya işlenir; `pnpm tokens:check` fark bulursa **CI kırılır**
  (üretilen dosyalarla kaynak arasında sürüklenme olamaz).
- Palet değiştirmek = `tokens.json`'da bir satır → web + Flutter aynı anda döner.

### 13.13.2 Ham palet (antik: parşömen · bronz · meşale · obsidyen)
| Rampa | Kullanım | Değerler |
| :-- | :-- | :-- |
| `parchment` | gündüz zeminleri | 50 `#FFFBF0` · 100 `#FAF3E3` · 200 `#F3E9D6` · 300 `#D6C3A1` · 400 `#B99F76` |
| `obsidian` | gece zeminleri | 900 `#15110C` · 800 `#1E1810` · 700 `#2A2218` · 600 `#3B3124` · 500 `#574733` |
| `bronze` | ana vurgu (gündüz) | 700 `#6F4720` · 600 `#8A5A2B` · 500 `#A97540` |
| `torch` | ana vurgu (gece), altın | 400 `#E8B75F` · 500 `#D6A24A` · 600 `#B8862F` |
| `olive` | yemek / olumlu | 600 `#4F6B33` · 400 `#8FB05E` |
| `terracotta` | tehlike / saldırı | 600 `#9E3324` · 400 `#D4674F` |
| `lapis` | bilgi / bağlantı | 600 `#2F5D8C` · 400 `#7FA9D4` |
| `ink` | metin | 900 `#2B2116` · 600 `#6A5942` · 100 `#EFE3CC` · 300 `#B0A188` |

### 13.13.3 Semantik token'lar (bileşenler **yalnız bunları** kullanır)
| Token | Gündüz | Gece | Not |
| :-- | :-- | :-- | :-- |
| `bg` | `#F3E9D6` | `#15110C` | sayfa zemini |
| `surface` | `#FAF3E3` | `#1E1810` | kart/panel |
| `surfaceRaised` | `#FFFBF0` | `#2A2218` | modal, bottom sheet, açılır menü |
| `border` | `#D6C3A1` | `#3B3124` | |
| `borderStrong` | `#B99F76` | `#574733` | |
| `textPrimary` | `#2B2116` | `#EFE3CC` | kontrast ≥ 12:1 |
| `textMuted` | `#6A5942` | `#B0A188` | kontrast ≥ 5:1 |
| `accent` | `#8A5A2B` | `#D6A24A` | birincil düğme, seçili sekme |
| `accentHover` | `#6F4720` | `#E8B75F` | |
| `onAccent` | `#FFFBF0` | `#1A130A` | vurgu üstündeki metin |
| `gold` | `#9A7413` | `#E3B84C` | **altın kaynağı** |
| `food` | `#4F6B33` | `#8FB05E` | **yemek kaynağı** |
| `danger` | `#9E3324` | `#D4674F` | saldırı, kayıp, yıkım |
| `warning` | `#B3701A` | `#E08A3C` | gelen saldırı uyarısı |
| `success` | `#4F6B33` | `#8FB05E` | tamamlanan üretim |
| `info` | `#2F5D8C` | `#7FA9D4` | tarafsız bildirim |
| `focusRing` | `#8A5A2B` | `#E8B75F` | klavye odağı (her zaman görünür) |
| `overlay` | `rgba(43,33,22,.45)` | `rgba(0,0,0,.65)` | sheet arka planı |

Ek token grupları: `radius` (2/6/10/16) · `space` (4'ün katları) · `shadow` (gündüz yumuşak sıcak
gölge, gecede neredeyse yok — bunun yerine `borderStrong`) · `font`.

**Tipografi:** başlıklar antik hisli **serif** (Cinzel / EB Garamond adayları), gövde okunur
**sans** (Inter / Source Sans). ⚠️ Seçim öncesi **Türkçe glif denetimi zorunlu** (ğ Ğ ş Ş ı İ ö ü ç);
fontlar kendi sunucumuzda barındırılır (CDN yok), `latin-ext` alt kümesi + `font-display: swap`.

### 13.13.4 Tema seçimi ve kalıcılık
- Değerler: `system` (varsayılan) · `light` · `dark`. Web'de `<html data-theme>`, Flutter'da `ThemeMode`.
- **Kalıcılık iki katmanlı:** anında `localStorage['mw.theme']` / `SharedPreferences`, ayrıca
  sunucuda `accounts.ui_theme` → cihazlar arası taşınır (Flutter ve web aynı tercihi görür).
- **FOUC yok:** `index.html`'de boyamadan önce çalışan küçük satır-içi betik `data-theme`'i yazar.
- `system` seçiliyse `prefers-color-scheme` **canlı** izlenir (işletim sistemi gece moduna geçince
  oyun da geçer).
- Tema düğmesi kalıcı kaynak çubuğunda (§10); üç durumlu (sistem/gündüz/gece) tek düğme.

### 13.13.5 Kalite kapıları
- **Kontrast testi CI'da:** her `text*/bg*` çifti WCAG AA (normal 4.5:1, iri metin & UI 3:1) —
  `tokens.contrast.test.ts`; token değiştirip kontrastı bozmak **derlemeyi kırar**.
- **Renk tek başına anlam taşımaz:** kayıp/kazanç, kaynak türü vb. daima ikon + metinle birlikte
  (renk körlüğü).
- `prefers-reduced-motion` desteklenir (sheet animasyonu kısalır).
- Arayüz ikonları (`assets/ui/`) **SVG + `currentColor`** → tema ile birlikte döner. Birim/yapı
  illüstrasyonları PNG ve tema-bağımsızdır (§13.11.9).
- Görsel regresyon (Faz 2+): kritik ekranların iki temada anlık görüntü testi.

---

## 13.14 ⭐ ADLANDIRMA SÖZLEŞMESİ (kullanıcı kararı, 2026-07-26)

**Kural: makinenin okuduğu her şey İngilizce, insanın okuduğu her şey Türkçe.**

### 13.14.1 İngilizce (istisnasız)
| Alan | Biçim | Örnek |
| :-- | :-- | :-- |
| Dosya/klasör | `kebab-case` (TS modül), `PascalCase` (React bileşeni), `snake_case.dart` | `chat.service.ts` · `ChatSheet.tsx` · `chat_sheet.dart` |
| URL / REST yolu | `kebab-case`, çoğul kaynak | `/api/v1/chat/channels/:id/messages` |
| WS olayı | `namespace:event` | `chat:message` · `battle:report` |
| DB tablo/kolon | `snake_case` | `chat_messages.sender_id` |
| TS değişken/fonksiyon | `camelCase` | `calculateLoot()` |
| Tip/sınıf/bileşen | `PascalCase` | `DefenseFloorRule` |
| Sabit | `SCREAMING_SNAKE` | `MIN_DEFENSE_PER_TYPE` |
| `world_config` anahtarı | `camelCase` İngilizce | `defenseCapacity` |
| Katalog `id` | `snake_case` İngilizce (= ikon dosya adı) | `archer_tower` |
| Git dalı | `kebab-case` İngilizce | `feat/chat-bottom-sheet` |

### 13.14.2 Türkçe
- **Kod yorumları** — açıklama gerekiyorsa Türkçe yazılır (*"neden"i anlat, "ne"yi değil*).
- **Dokümanlar** (`*.md`), commit mesajı gövdesi, PR açıklaması, `audit_log` insan-okur alanları.
- **Kullanıcıya görünen metin asla koda gömülmez** → `apps/web/src/i18n/tr.json`
  (anahtar İngilizce, değer Türkçe): `"chat.tabs.alliance": "İttifak"`. `en.json` iskelet olarak
  açılır (şimdilik boş; ileride ikinci dil bedava gelir). Flutter aynı anahtar setini kullanır.
- Katalogda görünen ad ayrı alandır: `{ "id": "archer_tower", "name": { "tr": "Okçu Kulesi" } }`.

### 13.14.3 Türkçe → İngilizce eşleme (planın önceki bölümlerinde geçenler)
`hiz→speed` · `harita→map` · `yerlesim→settlement` · `kurallar→rules` · `ekonomi→economy` ·
`savas→combat` · `magara→cave` · `alanKurallari→areaRules` · `binaButcesi→buildingBudget` ·
`savunmaKapasitesi→defenseCapacity` · `tuketen→consumers` · `kaynakYapi→sourceBuilding` ·
`taban→base` · `oran→rate` · `sur→wall` · `buyuKalkani→magicShield` · `tuzak→trap` ·
`gnomSabotaj→gnomeSabotage` · `onarim→repair` · `ganimet→loot` · `enkaz→debris` · `yagma→plunder`.
Katalog `id`'lerinin tam listesi §13.11.9'daki ikon ağacıdır.

> **Geri dönüş kolay:** bu karar Faz 0 başlamadan alındığı için hiçbir kod etkilenmiyor. Katalog
> `id`'lerini Türkçe tutmak istersen tek yapman gereken §13.11.9 ağacını Türkçe bırakmak — kod
> `id`'leri opak string olarak taşır.

---

## 13.15b ⭐ İTTİFAK SİSTEMİ (uygulandı, 2026-07-30)

**Giriş:** Komuta Merkezi → İttifak sekmesi (`/command/alliance`) — orijinal hiyerarşiyle birebir
(`g.java:1415`, ekran 17). Sol menüde ittifak maddesi YOK (orijinalde de yoktu).

**Roller** (orijinal `q` alanı): **1 Asker · 2 Konsey Üyesi · 3 Lider**. Askerî unvanlar
(Subay/Komutan/Başkomutan/Mareşal — savaş başarısıyla kazanılıyordu) bu turda YOK; ileride
yalnız gösterim rozeti olarak gelecek.

**Yetki matrisi (kullanıcı kararları):**
| İşlem | Asker | Konsey | Lider |
| :-- | :-: | :-: | :-: |
| Davet gönder · davet/başvuru kabul-red | — | ✓ | ✓ |
| İttifaktan At | — | ✓ yalnız Asker'i | ✓ herkesi |
| Metin düzenle · İttifağa Mesaj (toplu posta) | — | ✓ | ✓ |
| Konseye Al/Çıkar · Liderlik Devri · Ad Değiştir · Dağıt | — | — | ✓ |
| Ayrıl | ✓ | ✓ | yalnız TEK üyeyse (→ dağıtır); değilse önce devir |

> ⚠️ **Bilinçli sapma:** orijinal istemci "İttifaktan Çıkar"ı yalnız lidere gösteriyordu
> (`g.java:1856`, q==3) ama oyunun dokümanı VE kullanıcı konseye de atma yetkisi verdi —
> kullanıcıya uyuldu. Liderlik devrinde eski lider Konsey'e düşer (istemci q=2 davranışı).

**Kurma:** Kale ≥ 5 (§13.15) · ad 3-10, dünya içinde büyük/küçük duyarsız benzersiz · üye
sınırsız · maliyet yok. **Katılım iki yol:** Dünya ekranı şehir modalından **davet** (yalnız
Konsey+Lider görür, hedef ittifaksızsa) · İttifak sekmesindeki arama/listeden **başvuru**.
Davet/başvuru **mesaj kutusunda** Kabul/Red butonlarıyla görünür (orijinal t=8/9); durum
makinesi `alliance_invites` tablosunda (pending/accepted/rejected/canceled, kısmî unique).
Kabulde oyuncunun diğer bekleyen istekleri iptal olur; yarış koruması tek koşullu UPDATE.

**Ekran** (`scr_web06` düzeni): başlık "«ad» İttifağı Ana Sayfası · Puan · Sıra" → İttifak
Metni (≤500, herkes görür, Konsey+Lider düzenler) → aksiyonlar → üyeler tablosu
(# · Oyuncu · Puan · Dünya Sırası · Rütbe · Durum 🟢/🔴 · İşlem), sayfa başına 20. Sağ sütun
paneli üye listesi + Online/Offline. Onay metinleri orijinal kalıpla: "… Emin misiniz!".

**Çevrimiçilik:** YALNIZ ittifak üyeleri arasında görünür (kullanıcı kuralı). Kaynak: gateway
`isOnline` (süreç içi sayaç) + `presence:update` (yalnız ittifak odasına). Üyelik değişince
`setMembership` açık soketleri eski odadan anında düşürür. Tek süreç varsayımı (§4.0).

**Sıralama:** ittifak puanı = üyelerin puan TOPLAMI (yasaklılar hariç); günde 3 snapshot'ta
`rankings kind='alliance'` (prev_rank kayması aynı desen). Sıralamalar → İttifak sekmesi:
Sıra · İttifak · Puan · Değişim · Üye. Genel Durum ve Dünya ekranı ittifak alanları dolduruldu.

**WS:** `alliance:changed` outbox'ı → ittifak odası + etkilenen oyuncular; istemci
`alliance/alliances/overview/world/rankings` anahtarlarını tazeler; `presence:update` özel
handler'la ittifak görünümünü tazeler. İttifak SOHBETİ ayrı iş (§13.12, chat_channels hazır).

**Şema:** `alliances` (name uniq lower, leader_id, text) · `alliance_invites` ·
`players.alliance_id` FK (SET NULL) + `alliance_role` + `(world_id, alliance_id)` indeksi.
Ayrılma cooldown'u (`cooldownHoursAfterLeave: 0`) düğme olarak hazır, kapalı.

## 13.16 ⭐ DÜNYA EKRANI — dolaşma ve şehir menüsü (2026-07-26, oyunun dokümanından)

Kullanıcı sordu: *diyarlar/kıtalar nasıl değiştirilecek, dolu şehre tıklanınca ne açılacak?*
Cevap oyunun kendi dokümanında (`teknik_ve_yapi_dokumantasyonu.md` → DÜNYA) ve **yapı bunu
kendiliğinden belirliyor**.

### 13.16.1 ⭐ DÜNYA BOYUTLARI (doküman, BİREBİR)
> *"Bir dünyada **10 kıta**, bir kıtada **500 diyar** ve bir diyarda da **10 şehir** bulunmaktadır."*
> *"Koordinatlarda soldan ilk sayı kıtayı, ortadaki diyarı, en sağdaki şehri ifade eder.
> Ör: **1:45:10** = 1. kıtadaki, 45. diyarın, 10. şehri."*

```
dünya = 10 kıta × 500 diyar × 10 şehir = 50.000 boş şehir yeri
koordinatlar 1-İNDEKSLİ (0 yok): kıta 1-10 · diyar 1-500 · şehir 1-10
```
> ⚠️ **Bu bizim kodda yanlıştı** (2026-07-26 düzeltildi): `findFreeSlot` "100 şehir/diyar,
> 100 diyar/kıta" varsayıyordu ve 0-indeksliydi. `WORLD_SHAPE` sabiti eklendi; Faz 3'te
> `world_config.map`'e taşınacak ve yerleşim algoritması (§13.6) da bunu kullanacak.

### 13.16.2 Ekran ne gösterir — **harita değil, DİYAR LİSTESİ**
🎯 Bir diyarda **tam 10 şehir** var → bir diyar **tek ekrana sığar**. Oyun 2B harita değil,
**koordinat listesi** gösteriyor. Bu J2ME kökeninin bir sonucu ama modern istemcide de doğru
tercih: mobilde 10 satır tek bakışta okunur, kaydırma/yakınlaştırma derdi yok.

Her satırda (doküman: *"oyuncuların oyuncu adını, şehrinin adını, ittifak adını ve kaçıncı sırada
olduğunu görebilirsiniz"*):

| Sütun | İçerik | Boş şehirde |
| :-- | :-- | :-- |
| Koordinat | `k:d:s` (ör. `1:45:10`) | aynı |
| Şehir adı | şehrin adı | **`-`** (doküman: *"boş alanlar `-` ile gösterilir"*) |
| Oyuncu | kullanıcı adı | — |
| İttifak | ittifak adı | — |
| Sıra | oyuncunun sıralamadaki yeri | — |

### 13.16.3 Dolaşma (diyar/kıta değiştirme)
- **Üstte koordinat çubuğu:** `[kıta ▾] : [diyar ◀ 45 ▶] ` + **"Git"** alanı (elle koordinat girme).
- **Diyar:** `◀ ▶` ile ±1, uzun basış/tekrar ile hızlı; alan doğrudan yazılabilir (1-500).
- **Kıta:** açılır liste (1-10) — 10 eleman olduğu için liste yeterli, kaydırıcıya gerek yok.
- **Kısayollar:** "Başkentime dön" · "Son bakılan" · **"Dünyada Bul"** (menüde var: oyuncu adından
  koordinata gitme) · ittifak üyelerinin diyarları.
- URL/derin bağlantı: `/world/1/45` (kıta/diyar) — paylaşılabilir, geri tuşu çalışır.
- Veri: tek istek diyarın 10 satırını döner (`GET /api/v1/world/:k/:d`). Küçük yük → hızlı gezinme;
  önbellek TanStack Query'de, komşu diyarlar önden çekilebilir (prefetch).

### 13.16.4 ⭐ Dolu şehre tıklanınca açılan menü
> Doküman: *"tüm görev seçenekleri (saldırı, nakliye, casusluk, destek, şehir kurma ve teleport)
> **yalnızca dünya menüsünden** yapılabilir."*

**Bottom sheet** olarak açılır (sohbetle aynı desen, §13.12.5 — kendi rotası yok):

| Bölüm | İçerik |
| :-- | :-- |
| Başlık | şehir adı · `k:d:s` · oyuncu · ittifak · sıra · **mesafe ve tahmini sefer süresi** (§13.5) |
| **Görevler** | **Saldırı** · **Casusluk** · **Nakliye** · **Destek**¹ · **Teleport**² |
| Sosyal | **Mesaj Gönder** (DM, §13.12) · İttifağa Davet³ · **Şikayet Et** · **Oyuncuyu Blokla** |
| Bilgi | Genel Durum'a git · Sıralamada gör |

¹ Destek **yalnız kendi şehirleri arasında** (§13.11.8) → başkasının şehrinde bu seçenek **görünmez**.
² Teleport yalnız iki tarafta da Teleport varsa; kaynak taşınamaz (doküman).
³ Yalnız ittifak yetkisi olan oyuncuda (lider/konsey — §13.15).

**Boş şehre (`-`) tıklanınca** yalnız **"Şehir Kur"** çıkar (doküman: *"bu boş alanlara şehir kurmak
için dünya ekranındaki Şehir Kur seçeneğini kullanabilirsiniz"*) + koordinat/mesafe bilgisi.

**Kendi şehrine tıklanınca**: "Şehre git" · Destek gönder · Teleport · (görev seçenekleri yok).

### 13.16.5 Görünürlük ve gizlilik
- Dünya ekranı **kimin nerede olduğunu** gösterir ama **ordusunu/kaynağını GÖSTERMEZ** — onun için
  casusluk gerekir (§13.11.6). Satırda asker/kaynak bilgisi **asla** olmaz.
- **Arama (Komuta Merkezi) yalnız BAŞKENT koordinatını verir** (doküman: *"Diğer şehirlerinin
  değil"*) → koloni avlamak için dünya ekranını taramak gerekir. Bu kasıtlı bir tasarım; koruyoruz.
- Gelen saldırılar bu ekranda değil **Komuta Merkezi → Gelen Ordu**'da görünür (§13.10.1).
- Dünya açılışı **aktif şehrin diyarından** başlar (kullanıcı 2026-07-30); "Kendi diyarıma dön"
  artık seçimi sıfırlar (görünüm aktif şehri izler). "10 şehir" başlık yazısı kaldırıldı.

### 13.16.6 ⭐ ŞEHİR KURMA YARIŞI — "gelen saldırı" görünürlüğü (kullanıcı, 2026-07-30)

Doküman kuralı zaten uygulanıyordu: koordinat varışta doluysa ordu **savaşmadan** geri döner
(`slot_taken` raporu). Eklenen ince ayrıntı — **koordinatı ÖNCE kapan oyuncu** yoldaki kuruluş
seferini görür:

- Görevin `target_city_id`'si yoktur; liste sorgusu bu satırları **koordinattan** yakalar
  (kısmî indeks `missions_found_city_coords`, migration 0019).
- Yeni sahibe satır **GELEN SALDIRI olarak maskelenir**: `type: 'attack'`, kırmızı kılıç;
  kaynak koordinat + oyuncu adı ve varış saati açık. Bunun bir kuruluş seferi olduğu belli olmaz.
- ⭐ **MASKE kalır, İÇERİK açılır** (kullanıcı 2026-07-31): birim dökümü ve kahramanlar
  görünür (§13.10.1). "20 cüceyle saldırı" şüphe uyandırır ama görev tipini ele vermez —
  yorum oyuncuya kalır, oyunun kendi zekâ oyunu budur.
- Ordu varınca satır ANINDA düşer: `mission:completed` (ve iptalde `mission:canceled`) hedef
  sahibini found_city'de koordinattan çözer; şehir KURULDUĞU anda görünürlük için
  `cities:changed` istemcide `missions`'ı da tazeler.
- **"Dönüşünü yakalama" TAM ÇALIŞIR** (2026-07-31'de tamamlandı): erken kuran, emrin hangi
  koordinattan/oyuncudan geldiğini VE ordunun birleşimini bilir → en yavaş birimin hızından
  dönüş anını hesaplayıp orduyu evinde karşılayabilir. Casusluğa gerek kalmadan.

---

## 13.15 ⭐ İTTİFAK KURMA ŞARTI (kullanıcı kararı, 2026-07-26)

**✅ Şu anki tek şart: kurucunun bir şehrinde `Kale ≥ 5`.** Kullanıcı notu: *"bu şartı daha sonra
farklı şeylere de bağlarız"* → şart listesi **veri** olarak tutulur, kod değişmeden büyür.

```jsonc
"rules": {
  "allianceFound": {
    "minCastleLevel": 5          // tek şart (şimdilik) — herhangi bir şehirde
    // ileride eklenebilecekler (kod hazır, değer yok):
    // "minScore": 0, "minPlayerAgeHours": 0, "cost": {"gold":0,"food":0},
    // "premiumOnly": false, "minMembersToKeep": 1, "cooldownHoursAfterLeave": 0
  }
}
```
- **Neden Kale 5 iyi bir eşik:** Kale 1→5 kümülatif ~7.500 kaynak ve bina bütçesini 10→50'ye çıkarır;
  yani oyuncu ekonomisini kurmuş, birkaç gün oynamış demektir. Sıfırıncı saatte açılan sahte
  ittifaklar, isim kapatma ve çok-hesap kümeleri kendiliğinden engellenir.
- **Şart yalnız KURMAYA** uygulanır; **katılmak** için şart yok (yeni oyuncu ilk günden bir ittifaka
  girebilir — zaten oyunun sosyal çekirdeği bu).
- ✅ **KARAR (kullanıcı, 2026-07-26): şimdilik YALNIZ `Kale ≥ 5`.** Orijinalde ek bir şart vardı —
  doküman *"İttifak kurabilmeniz için **ekstra paket aboneliğiniz** olmalıdır"* diyor, yani ittifak
  kurmak premium işiydi. **Bu şart şimdilik UYGULANMIYOR**; ittifak kurmayı paraya bağlamak Faz 6'da
  (premium kapsamı) yeniden değerlendirilecek. `allianceFound.premiumOnly` alanı `false` olarak
  hazır duruyor → gerektiğinde tek satır.
- Doküman'dan diğer ittifak kuralları: **ad 3-10 karakter** · üye sayısı sınırsız ·
  katılım iki yolla (Arama'dan **başvuru** / yönetimden **davet**) · rol hiyerarşisi
  **lider → konsey → üye** (§2b menü envanteri).
- Kale seviyesi sonradan düşemeyeceği için "kurduktan sonra şartı kaybetme" durumu yok
  (yapı yıkma yok; şehir terk etme başkenti kapsamıyor).
- Tek `AllianceFoundService.check(player) → {ok, failedRules[]}`; arayüz aynı servisten "İttifak
  kurmak için Kale 5 gerekli (şu an 3)" mesajını üretir. Sunucu her `POST /alliances`'ta doğrular.
- **Faz 4** işidir; şart bugünden config'e ve doğrulama testine yazılır (§12).

---

## 13.17 ⭐ PUANLAMA ve SIRALAMA (oyunun kendi dokümanından, 2026-07-28)

**Kaynak — tartışmasız:** `teknik_ve_yapi_dokumantasyonu.md`, GENEL DURUM başlığı:
*"Puanlama, harcadığınız kaynak miktarına göre yapılır. Harcanmış her 1000 birim kaynağa karşılık
1 puan alırsınız. Ordularınızın savaştaki kayıpları ise aynı oranda puan kaybetmenize neden olur."*

### 13.17.1 Puan bir TÜREVDİR, kayıt değil

| Karar | Gerekçe |
| :-- | :-- |
| Saklanan asıl büyüklük **`players.score_base`** = net harcanan kaynak (`numeric(24,6)`); `score = floor(base/1000)` | Doğrudan puan yazsak her harcamanın **binlik artığı çöpe giderdi**: 900 + 900 birim harcayan oyuncu 1 puan yerine 0 alırdı. Kaynak birikimindeki `numeric` kararının (§3) aynısı |
| Puan **harcama anında** işlenir (`QueueService.spend`) | Harcamanın tek geçtiği yer orası; başka noktaya koysak yeni bir kalem türü eklendiğinde puan sessizce yazılmadan kalırdı |
| **İptal iadesi puanı geri alır** | Yoksa *sipariş ver → iptal et* döngüsü kasa hiç azalmadan puan basardı |
| Savaş kaybı **tür tür** düşülür (öncesi − sonrası, katalog bedeliyle) | Motorun `lost` alanı toplam ADETtir; onu kullanmak Ejderha ile Cüce'yi aynı bedele eşitlerdi |
| Sur / Büyü Kalkanı puan **götürmez** | Savaşta adet kaybetmezler (seviye taşırlar, §13.11.1b) |
| Yağmalanan kaynak puan düşürmez | Doküman yalnız *ordu kayıplarını* sayar; yağmalanan kaynak zaten harcanmamıştı, hiç puan da vermemişti |
| Savunma tabanının geri getirdiği birimler kaybedilmiş sayılmaz | §13.11.10'un puan tarafındaki doğal karşılığı |

⚠️ **Geriye dönük doldurma ayrı bir şeydir.** `recomputeScoreBaseFromHoldings` oyuncunun ŞU AN
sahip olduklarının bedelini toplar — "harcanan" ile aynı şey değil (savaşta kaybedilen ordu
harcanmıştı ama artık yok). Yalnız **tek seferlik bakım** aracıdır
(`apps/api/scripts/backfill-scores.mjs`), normal akışın parçası değildir.

### 13.17.2 Sıra CANLI DEĞİL — günde 3 kez donar

Anlık görüntü saatleri **00:00 · 08:00 · 16:00** (oyun saati, gece savaşı penceresiyle aynı eksen).

- `rankings(world_id, kind, subject_id, rank, prev_rank, score, taken_at)` — `kind`: `player` ·
  `alliance` · `hero`. `subject_id` FK **değildir**: işaret ettiği tablo `kind`'a göre değişir.
- ⚠️ **Değişim (▲2) TÜRETİLEMEZ.** Önceki sıra kaydedilmezse geriye dönük hesaplanamaz; anlık
  görüntü kaçırılırsa o dönemin değişimi sonsuza dek kaybolur. Bu yüzden `prev_rank` şemada
  **veri**, sorguda hesap değil.
- Sıra ve önceki sıranın kaydırılması **tek `INSERT … ON CONFLICT DO UPDATE SET prev_rank =
  rankings.rank`** ile yapılır → okuma ile yazma arasında aralık kalmaz.
- Zincir `ranking_snapshot` **görevidir**, cron değil: `ctx.at` görevin vadesi olduğu için worker
  40 dk kapalı kalsa bile damga yine **08:00** olur; gerçek saate bağlı bir cron ise bakımda
  tetiklenip yanlış ana damga atardı.
- **Dünya ekranındaki sıra da buradan okunur** (§13.16). Eskiden orada canlı `RANK()` vardı: doğru
  sayı ama yanlış sayı — Dünya ile Sıralamalar birbirini tutmuyordu.
- Kahraman sıralaması **seviye, sonra tecrübe** (`seviye × 1e9 + xp` tek sütuna katlanır).
- **İttifak sıralaması boş** — `alliances` şeması İttifak turunda gelecek; ekran uydurma veri
  yerine sebebini yazar.

---

## 13.21 ⭐ SUR ve BÜYÜ KALKANI (2026-07-29 binary analizi)

### 13.21.1 BÜYÜ KALKANININ SIRRI — çözüldü

**Soru:** simülatörde Büyü Kalkanı'nın yanındaki yüzde neye göre düşüyor?

**Cevap (kanıt zinciri):**
1. `FUN_00402800` (Savaştır düğmesi) sonuçları forma yazarken *"heroes/graded units use
   `sub_412a78` (remaining, float)"* diyor — yani ekranda yüzde gösterilen her şey **kalan
   bütünlüğü float tutan bir BİRİMdir**.
2. `FUN_0040dcb4` (koordinatör) savunanın listelerini kuruyor: `+0x58` = savunma **yapıları**
   grubu (grup C).
3. `FUN_0040e0c4` (hasar çekirdeği) grup C'ye **diğer herkesle aynı formülü** uyguluyor:
   ```
   pay = savunmaGücü(birim) × saldırıGücü / toplamSavunma
   net = pay − mitigasyon(birim, faz)
   net > 0 ise: bütünlük -= net / dayanıklılık
   ```
4. Sur ve Büyü Kalkanı **aynı grupta** ve **aynı formülden** geçiyor. Simülatörde ikisinin de
   yüzde göstermesinin sebebi bu; diğer savunma birimleri adet taşıdığı için tam sayı görünüyor.

**Sayısal sebep — kalkan neden NADİREN düşüyor:** katalog statları `birimPuanı(Alan) = 400`,
`mitigasyon(mAtk) = 320`, `dayanıklılık(mDef) = 2000`. 400 > 320 olduğu için kalkan ancak
`havuz/P > 0,8` olduğunda net hasar alır; onun altında **hiç yıpranmaz**. Ezici bir büyü
saldırısında eşik aşılır ve gözle görülür biçimde erir.

⚠️ **Motorda kalkan pasif bir çarpandı ve hiç yıpranmıyordu** — hem bizim TS motorumuzda hem
referans `mobiwar-engine.js`'te. Artık `ShieldState` var ve `shieldIntegrity` raporlanıyor.

**Kalibrasyon durumu — dürüst tablo.** Kullanıcının ekran görüntüsündeki senaryo motorumuzda:

| | Simülatör | Motor |
| :-- | --: | --: |
| Kazanan / tur | saldıran / 5 | saldıran / 5 ✅ |
| Savunan kaybı | 587 | 565 |
| Enkaz (altın) | 1.268.119 | 1.370.070 |
| **Sur %** | **0,00** | **0,00** ✅ |
| **Kalkan %** | **61,23** | **80,2** ⚠️ |

**Mekanizma doğru, büyüklük değil.** Kalkanın payı şu an `P`'ye **eklenmiyor** ve `lossMag`'a
**yazılmıyor** — bilinçli kısıt: motorun 64 kalibrasyon testi binary'nin çıktılarına göre
ayarlandı, kalkanı güç havuzuna sokmak hepsini kaydırırdı. Büyüklüğü tutturmak için
**birden çok simülatör örneği** gerekiyor (farklı kalkan seviyeleri × farklı büyü ordusu);
tek veri noktasına formül uydurmak kalibrasyonu bozar.

### 13.21.2 SUR ONARIMI
Doküman: *"Savaşlarda yıkılan sur savaş sonrasında belirli bir süre içinde yeniden onarılır."*
Süreyi söylemiyor; kullanıcı kurguladı (2026-07-29):

`süre = 12 saat × hasarOranı × 0,92^(sv−1)`

- **Hasarla orantılı** — %20'ye düşen sur, %70'te kalandan uzun sürer (kullanıcının örneği).
  Tavan hep o seviyedeki **tam yıkım** süresidir; kısmi hasar onun oranıdır.
- **Seviye kısaltır** — dokümanda yok, bilerek eklendi: Sur'u yükseltmek dayanıklılık kadar
  **toparlanma hızı** da kazandırmalı (mağara onarımıyla aynı gerekçe). Sv 1 → 12 sa, sv 20 → 2,5 sa.
  (Kullanıcı 14 saat önerdi ve makul bir değere çekilmesini istedi.)

**Üç alan birlikte:** `wall_integrity` (onarım BAŞLARKENki oran) + `wall_repair_from` +
`wall_repair_until`.

⭐ **Onarımda geçen süre boşa gitmez (kullanıcı, 2026-07-29).** Onarım sürerken gelen saldırıyı
sur **o ana kadar onarılmış yüzdeyle** karşılar: bütünlük `from`→`until` arasında `integrity`'den
1'e doğrusal yürür (`wallCurrentIntegrity`). Eskiden yalnız bitiş anı tutuluyordu ve sur savaşa
hep savaş-sonrası değeriyle giriyordu — yani onarımda geçen saatlerin hiçbir karşılığı yoktu.
Bu savaşta yeniden hasar alırsa süre **o anki yeni hasara göre baştan** hesaplanır; tam yıkılırsa
tam yıkım süresinin tamamını yeniden bekler. Onarım bitince ayrı bir görev gerekmez — süre
geçmişse bütünlük 1 sayılır (tembel birikim deseni).

#### ⭐ TAM YIKIM = SAVUNMA ÜRETİMİ DURUR (kullanıcı, 2026-07-29 · iade 2026-07-30)
Sur **%0'a** inerse (seviyesi ve üstündeki savunma birimleri kalır, ama sur çökmüştür):
- süren ve kuyrukta bekleyen **savunma birimi** emirleri **anında iptal edilir**. O ana kadar
  üretilmiş olanlar şehirde KALIR — iptalden önce `materialize` koşar.
- ⭐ **İADE VAR (2026-07-30, önceki "iade yok" kararı değişti):** her emirden üretilmemiş
  birimlerin bedeli, normal iptal kuralıyla — **"1 ünite eksik"** — savunana geri döner.
  İade kasaya **ganimet düşüldükten SONRA** eklenir: bu savaşın havuzuna girmez, bir SONRAKİ
  saldırının havuzunda yağmalanabilir (§13.10.4). Skorda `debitRefund` normal iptalle aynı.
- ⭐ **İptal + iade bilgisi savaş raporunda YALNIZ SAVUNANA görünür** (`wallProduction`):
  rakibin ne ürettiği casusluk gerektiren bilgidir. Ayrı `defense_band_canceled` mesajı kalktı.
- **onarım tamamen bitene kadar** yeni savunma birimi üretilemez (`wall_destroyed` hatası).
- ⭐ **Onarımdaki Sur YÜKSELTİLEMEZ (2026-07-30, önceki karar değişti):** tamirat — kısmi hasar
  dahil — bitmeden seviye artırılamaz (`wall_repairing`). Büyü Kalkanı etkilenmez; onarım
  zaten iptal edilemez.
- **Ekran:** Savunma sekmesindeki Sur satırında onarım boyunca "Sur onarılıyor" bandı — geri
  sayım + o anki bütünlük yüzdesi progress bar'ı (`wallCurrentIntegrity`, doğrusal). Çubuk tam
  da savaş-değerini gösterir: saldırı gelirse sur o yüzdeyle savaşır.

### 13.21.3 SAVUNMADA İKİ ŞERİT
Kullanıcı isteği: Baraka'daki tek bant Savunma'ya da geldi.

| Şerit | Kapsam | Davranış |
| :-- | :-- | :-- |
| **Birim bandı** | Okçu Kulesi, Tuzak, Kazancı, Mangonel, Muhafız, Balista | Baraka'nın birebir aynısı: teker teker, sırayla, ↑↓ ile sıralanır, iptal edilebilir. Aynı anda **Sur seviyesi** kadar emir |
| **Yapı şeridi** | Sur, Büyü Kalkanı | Kendi satırında ilerler, **birim üretiminden bağımsız/paralel**, aynı anda tek yükseltme. İade süreye göre |

⚠️ Emir sayısını Sur'a bağlamak bizim kararımız: savunma birimleri surda yaşar ve çoğunun
ön-şartı zaten Sur seviyesidir — Baraka'nın savaşçılar için oynadığı rolü savunmada Sur oynuyor.

### 13.21.4 🐞 SUR ÖN-ŞARTI HİÇ OKUNMUYORDU
Savunma bandı yazılırken çıktı: Sur ve Büyü Kalkanı `defenses` tablosunda yaşıyor ama ön-şart
tablosunda `buildings: { wall: N }` diye yazılı. `checkRequirement`'a yalnız `st.buildings`
verildiği için **Sur seviyesi daima 0** okunuyordu → *Okçu Kulesi, Balista, Muhafız, Kazancı,
Mangonel ve Büyü Kalkanı hiçbir zaman üretilemiyordu* ("Okçu Kulesi için gereken: Sur 1 (şu an 0)").
Savunma ekranı fiilen ölüydü ve kimse fark etmemişti. Çözüm ön-şart tablosunu değiştirmek değil
(orada Sur gerçekten bir yapıdır), **okuma anında iki kaynağı birleştirmek** (`structureLevels`);
aynı hata istemcide de vardı, o da düzeltildi.

---

## 13.20 ⭐ MAĞARA (2026-07-28 — orijinalde vardı, bizde hiç yoktu)

Doküman (MAĞARA): *"Mağara şehrin içinde yer alan ve gizli bir geçitle ulaşılabilen oldukça
güvenli bir yapıdır. Surlarınız yıkılıp kaleniz düşse bile mağaradaki askerlerinize hiçbir şey
olmaz… mağaradaki askerler savaşa katılmazlar. Ayrıca düşmanlarınızın casus kuşları mağaradaki
askerleri göremezler."*

### 13.20.1 Ölçülmüş veri — dokunulmaz

| Büyüklük | Formül | Doğrulama |
| :-- | :-- | :-- |
| **Kapasite (ALAN)** | `50 × 2^(sv−1)` | kapasite tablosu **20/20** |
| **Yıkmak için cüce** | `round(100 × 1,5^(sv−1) / (1 + 0,05·Demircilik))` | `cuce-magara.png` **119/120** |

⭐ **Demircilik etkisi TOPLAMSAL paydadır, üssel değil.** Ayrım büyük: Demircilik 30'da üssel
model 0,95³⁰ = 0,21 verirken gerçek tablo 1/2,5 = **0,40** diyor. Bu, tablonun 120 hücresi
denenmeden bulunamazdı.

⚠️ **İki tutarsızlık, ikisi de kayıt altında:**
1. Tablonun tek uyuşmayan hücresi (Demircilik 4 · Mağara 22 → 415.667) **kendi içinde de**
   tutarsız: komşularıyla ×1,5 zinciri kurulmuyor (277.105 × 1,5 = 415.658). Basım hatası.
2. **Dokümanın metni tabloyla çelişiyor:** *"1. seviye mağarayı yıkmak için en az 150 cüce
   gerekir… 2. seviye mağarayı 225 cüce yıkabilir"*. Tablo ise sv1 = **100**, sv2 = 150,
   sv3 = 225 diyor — yani metin **bir seviye kaymış** (ya da eski dengeden kalma). **Tabloyu
   esas aldık** (ölçülmüş veri > düzyazı) ve taban `CAVE_CONSTANTS.breakBase` olarak tunable
   duruyor; kullanıcı 150 derse tek sayı değişir. 🔵 **Kullanıcı onayı bekliyor.**

### 13.20.2 Kurgulanan iki süre — denge düğmesi

**Doldurma / boşaltma:** `süre = 25 × √alan / 1,1^(sv−1)`

Doküman iki şart koyuyor (*"toplam kapladığı alana göre değişir"*, *"her seviye %10 azalır"*),
kullanıcı bir üçüncüsünü: **tek seferde büyük alanı sokmak parça parça sokmaktan avantajlı olsun.**
Karekök tam olarak bu şarttır — alan başına süre `K/√alan` ile düşer.

> **Üs neden 0,8 değil** (üretim süresiyle aynı olsun diye)? Kapasite seviye başına **2 katına**
> çıkarken süre yalnız %10 azalıyor. 0,8 üssüyle dolu bir sv20 mağarayı doldurmak **233 saat**
> sürüyordu. Karekök bu iki üssel arasındaki tek makul denge: sv20 dolu mağara **5 sa 48 dk**.

**Onarım:** `20 saat × 0,9^(sv−1)` — doküman *"24 saat, bu süre kısalmaz"* diyordu; **kullanıcı
bilerek değiştirdi**: mağarayı yükseltmek yalnız kapasite değil dayanıklılık da almalı.
(Taban bir ara 26 saatti, 2026-07-28'de "daha insaflı olsun" diye 20'ye indi.)

| sv | Kapasite (alan) | ~Cüce | Dolu mağarayı doldurma | Onarım |
|---:|---:|---:|---:|---:|
| 1 | 50 | 5 | 2 dk 57 sn | 20 sa 00 dk |
| 5 | 800 | 88 | 8 dk 03 sn | 13 sa 07 dk |
| 10 | 25.600 | 2.844 | 28 dk 16 sn | 7 sa 45 dk |
| 15 | 819.200 | 91.022 | 1 sa 39 dk | 4 sa 35 dk |
| 20 | 26.214.400 | 2.912.711 | 5 sa 48 dk | 2 sa 42 dk |

### 13.20.2b ⭐ EMİR TAŞIMAZ, SAYAÇ KURAR (model değişikliği, 2026-07-28 ikinci tur)

İlk tasarımda askerler **emir anında** barakadan düşüyordu ve işlem iptal edilemiyordu.
Kullanıcı modeli tersine çevirdi ve sonuç hem daha basit hem daha sağlam:

| | Eski model | **Yeni model** |
| :-- | :-- | :-- |
| Emir anı | Askerler barakadan düşer | **Hiçbir şey taşınmaz**, yalnız sayaç kurulur |
| Süre boyunca | Askerler "yolda", savaşa katılmaz | Askerler **yerinde**: şehirdekiler savaşa **katılır** |
| Süre sonu | Askerler mağaraya varır | Askerler **anlık** mağaraya girer |
| İptal | ⛔ yasak (istismar korkusu) | ✅ **serbest, anlık, yan etkisiz** |

⭐ **İstismar kapısı kendiliğinden kapandı.** Eski modelde iptali yasaklamamızın sebebi
"saldırıyı gör → sakla → saldırı bitince iptal et" döngüsüydü. Yeni modelde saklanmak zaten
süre dolmadan **başlamıyor**, dolayısıyla iptal edilecek bir koruma yok.

**Bundan doğan tek zor kural:** askerler süre boyunca şehirde olduğu için **ölebilirler**.
Bu yüzden mağaraya giriş anında adet yeniden ölçülür: `giren = min(emredilen, barakadaki)`.
Bu clamp olmadan ölmüş askerler mağarada **yeniden doğardı** — sessiz ve fark edilmesi çok zor.

Ayrıca savaştan hemen sonra bekleyen emir **uzlaştırılır** (`reconcileCaveStore`):
- bir kısmı öldü → emir küçülür, **süre aynen devam eder** (sayaç saldırıdan önce başlamıştı);
- **hepsi öldü** → emir iptal edilir ve oyuncuya savaş raporundan **AYRI** bir mesaj gider —
  rapor "savaşta ne oldu"yu, mesaj "planın ne oldu"yu anlatır.

⚠️ Doldurma/boşaltma emirleri **Ordular ekranında görünmez**: ortada hareket eden ordu yok,
şehrin içinde işleyen bir sayaç var. Görünen tek mağara olayı yıkılan mağaradan kaçıştır.

### 13.20.3 Yıkılma kuralları

- Ölçüt **hayatta kalan cüce sayısıdır**, sefere çıkan değil. Doküman kazanma şartından söz
  etmiyor; eşikler zaten büyük olduğu için "kaybeden saldırı mağarayı yıkamaz" kuralı
  **kendiliğinden** sağlanıyor — ayrıca yazmaya gerek yok.
- **Seviye 0 yıkılmaz** · **onarımdaki yeniden yıkılmaz ve süresi baştan başlamaz** ·
  **boş mağara da yıkılır** (kullanıcı kuralları).
- Yıkılınca ordu şehre **kaçar**, ama anında değil: `caveTransferSeconds(alan, sv)` kadar sonra.
  Doküman: *"ordunuzun şehre dönmesi mağara boşaltma süresi kadar olur"*.
- **Süren iş yıkılırsa** (kullanıcı kararı, 2026-07-28 ikinci tur) — yeni modelde bu tek hesaba
  indi, kalan/geçen süre hesabı YOK:
  - **doldurma** → emir iptal, başka hiçbir şey yapılmaz (askerler zaten şehirdeydi, savaştılar);
  - **boşaltma** → emir iptal; o askerler hâlâ mağaranın içindedir, dolayısıyla aşağıdaki
    kaçışa **doğal olarak dahil** olurlar ve **sıfırdan** boşaltma süresiyle şehre gelirler.
- Rapor **iki tarafa da** mağara notu yazar ama **aynı cümleyi değil**: savunan "mağaran
  yıkıldı, ordu kaçıyor" görür; saldıran yalnız sonucu ve **kaç cüce gerektiğini** görür
  (bir sonraki saldırıyı planlanabilir kılan tek bilgi). **Kaç asker kaçtığı hiçbir koşulda
  saldırana gitmez** — casusluğun bile veremediği bilgiyi bedava vermek olurdu.

### 13.20.4 Şema kararı: `cave_units` AYRI tablo
`units` içinde bir bayrakla ayırsaydık savaş, casusluk, sefer ve ekran sorgularının **hepsine**
"ve mağarada değil" koşulu eklemek gerekirdi; biri unutulduğunda hata **sessiz** olurdu —
saklanan ordu savaşa girerdi. Ayrı tablo bu unutmayı imkânsız kılıyor.

### 13.20.5 Arayüz ve istismar kapıları
- Giriş **Yapılar → Mağara adına tıklama** (doküman: *"Yapılar menüsünde … mağaraya asker
  doldurma"*). Geri sayım ve onarım da aynı satırda.
- **Emir asker taşımaz** (§13.20.2b): askerler süre dolana kadar yerinde durur, doldurmayı
  bekleyenler savaşa katılır. **İptal serbest, anlık ve yan etkisizdir.**
- **Casus Kuş mağaraya konulabilir** (kullanıcı, 2026-07-28): katalogda `kind: 'warrior'`,
  alanı 1. Modal listesi **katalog sırasıyla** dizilir (`WARRIOR_ORDER`), alfabetik değil —
  id'ler İngilizce olduğu için alfabetik sıra ekranda anlamsız bir dizilim üretiyordu (§13.14).
- **Mağara meşgul veya onarımdayken seviye ilerletilemez**: seviye değişimi kapasiteyi ve
  süreyi oynatır; yolda olan bir işin ortasında bu "kapasitesi aşılmış mağara" üretirdi.
- Ordular ekranında **tek satır, sarı kalkan**: `cave_*` görevlerinde kaynak = hedef olduğu için
  `OUT_ICON`'da karşılıkları bilerek yok. Rozet doğal olarak sarı düşüyor; yeşil (kendi seferim)
  onu zaten eziyor.
- Baraka kartında **"Mağarada: N"** (orijinal `scr_web01` ile aynı), yalnız 0'dan büyükse.

---

## 13.19 ⭐ YOKLAMA BİR EMNİYET AĞIDIR, VERİ YOLU DEĞİL (2026-07-28)

Kullanıcı sordu: *"5 saniyede bir `/cities/:id` isteği atılıyor, bunun amacı ne? WS zaten haber
vermiyor mu?"* — İnceleme **haklı çıkardı** ve iki gerçek kusur ortaya çıkardı.

### 13.19.1 Yoklama gerçek bir WS boşluğunu örtüyordu
`eventForOutbox` eşleme tablosunda **üç konu karşılıksızdı** → `null` dönüyor, olay WS'e hiç
çıkmıyordu. Ekran yine de güncel görünüyordu, çünkü istemci şehri 5 saniyede bir yokluyordu:

| Eksik konu | Ne kaçıyordu |
| :-- | :-- |
| `city:changed` | Nakliye/destek **varışı** — kaynak geldi, ekran haberi almadı |
| `city:founded` | Yeni şehir — şehir şeridi eski kalıyordu |
| `message:written` | **Her posta satırı** (dönüş · casusluk · nakliye raporu) — okunmamış rozeti geç güncelleniyordu |

⭐ Kural: **mesaj yazımı ve haberi aynı yerde** (`writeMessage` içinde). Bildirimi çağıranlara
bıraksaydık yeni bir rapor türü eklendiğinde biri unutulur ve kimse fark etmezdi.

### 13.19.2 Sayaç zaten yoklamayla akmıyor
Bilgi çubuğundaki altın/yemek `production` hızıyla **istemcide ekstrapole** ediliyor (`useTick`,
saniyede bir). Yoklama sayacı akıtmıyor, yalnız çıpayı tazeliyordu — dakikada bir tazelemek de
aynı işi görüyor. Yani "kaynak canlı görünsün" gerekçesi baştan yanlıştı.

### 13.19.3 Sonuç
Bütün aralıklar tek sabitten besleniyor (`SAFETY_NET_MS = 60_000`). **Aralığı düşürme isteği,
WS eşlemesinde bir konunun eksik olduğunun habercisidir** — çözüm yoklamayı sıklaştırmak değil,
olayı eklemektir. Ölçüm: boşta 60 saniyede **19 istek → 4 istek** (`/cities/:id` 12 → 1).

### 13.19.5 ⭐ SAYAÇLAR SUNUCUYU BEKLEMEZ: türet, sonra kısılmış tazele (2026-07-28)

Kullanıcı bildirdi: *"bir askerin üretimi bitiyor ama ekran bir sonraki fetch'e kadar bekliyor."*
Bu, yoklamayı 60 saniyeye çıkarmanın **ikinci** yan etkisiydi — kusur zaten vardı, aralık onu
bir anlık takılmadan bir dakikalık donmaya çevirdi.

**Neden WS ile çözülmedi:** üretim **tembeldir** (§3, tick YOK). Sunucu bir askerin üretildiğini
ancak şehir okunduğunda fark eder; asker başına olay yayınlaması için her aktif kuyruğa bir
zamanlayıcı koymak, yani mimarinin temel kararını geri almak gerekirdi.

**Neden asker başına fetch de değil:** 9 sn'lik Cüce siparişinde dakikada ~7 istek; yüksek
Baraka'da 1 sn'lik birimde **dakikada 60 istek**.

**Çözüm — sıfır maliyet.** Bant tamamen deterministik: `startedAt` ve `perUnitSeconds` biliniyorsa
k'ıncı asker `startedAt + k × perUnit` anında biter. İstemci sunucunun kullandığı **formülün
aynısını** çalıştırıyor. `q.done`/`q.remaining` kasıtlı olarak **kullanılmıyor** — onlar son okuma
anının fotoğrafı, tanımı gereği bayat; çıpa `startedAt`, o hiç bayatlamaz.

⭐ **Genel kural (kaynak sayacındaki kararın aynısı):** sunucuda **deterministik** olarak ilerleyen
her şey istemcide **türetilir**; sunucu yalnız çıpayı tazeler. Yoklama aralığı bu sayede bir
gösterim kararı olmaktan çıkıp gerçekten emniyet ağı olur.

Barakadaki **toplam** adet yine de sunucudan gelir (ordu göndermek gibi kararların dayandığı sayı
tahmine çevrilmemeli); onun için asker sınırı geçildiğinde **kısılmış** tek bir tazeleme
tetiklenir (`MIN_SYNC_MS = 5000`) — üst sınır eski kör yoklamayla aynı ama yalnız gerçekten
üretim varken ve yalnız bant ekrandayken.

### 13.19.4 🐞 Modalın odak çalması — asıl kusur yoklamada değildi
Kullanıcı *"modal açıkken inputa yazarken odak kayboluyor"* dedi. Sebep `Modal`'ın etkisiydi:
bağımlılığı `[onClose]`, gövdesinde `boxRef.current.focus()`. Çağıranlar `onClose`'u satır içi
ok işleviyle veriyor → **her render'da yeni kimlik** → etki yeniden koşuyor → odak kutuya
geri alınıyor. Yoklama yalnız TETİKLEYİCİYDİ; her yeniden çizim (WS olayı, sayaç tik'i) aynı
şeyi yapardı. Doğrusu: odak **yalnız açılışta** (`[]`), `onClose` bir ref üzerinden.

---

## 13.18 ⭐ ORİJİNAL İSTEMCİNİN MENÜ HİYERARŞİSİ (`DecompiledSrc/src`, 2026-07-28 tam analiz)

`g.java`'daki menü etiketi dizisi (`a[]`, 92 madde) ile ekran kurucu `switch`i birlikte okununca
orijinalin gezinti ağacı **birebir** çıkıyor. Aşağıdaki tablo o ağaçtır; `case` numarası
`g.java`'daki ekran kimliğidir.

| Ekran | İçerdiği maddeler |
| :-- | :-- |
| **Ana menü** (case 11) | Ordular · Baraka · Yapılar · Savunma · Akademi · Dünya · **Komuta Merkezi** · Seçenekler · Çıkış |
| **Komuta Merkezi** (case 10) | **Mesajlar · Genel Durum · İttifak · Arama · Sıralamalar** |
| **Sıralamalar** (case 101) | Oyuncuya Göre · İttifağa Göre · Kahramana Göre |
| **Arama** (case 107) | Oyuncu Ara · İttifak Ara |
| **İttifak** (case 17) | *(üye değilse)* İttifak Yarat — *(üyeyse)* İttifak Durum · Üyeler · İttifağa Mesaj · İttifaktan Ayrıl — *(liderse)* + İttifağı Dağıt · İttifak Metni · İttifak Adı Değiştir |
| **Seçenekler** (case 63) | Arkadaşına Tavsiye Et · Şehir Terk Et · Şehir Adı Değiştir *(veya Tatil Modundan Çık)* · Üyelik İşlemleri · **Yardım** |
| **Oyuncu satırı menüsü** (case 106) | **Mesaj · Dünyada Bul** · *(yetkiliyse)* İttifağa Davet |
| **Mesajlar** (case 32) | Sadece Mesajlar · Sadece Raporlar · Hepsini Göster |

**Bizim aldığımız kararlar (birebir kopya DEĞİL, harmanlama):**
- **Komuta Merkezi bir hub'dır** → Genel Durum ve Sıralamalar sekme olarak açıldı; İttifak ve
  Arama aynı hub'a girecek (kendi turlarını bekliyor).
- **Mesajlar sol menüde ayrı duruyor** (orijinalde Komuta Merkezi altındaydı): okunmamış rozeti
  sürekli görünmeli — kullanıcı kararı.
- **Yardım ve Tapınak sol menüde**: orijinalin J2ME sürümünde Yardım Seçenekler altında,
  Tapınak ise ayrı ekran olarak yoktu; **web sürümü** (`images/scr_web05` sol sütun) ikisini de
  ana menüye almış ve biz onu izliyoruz.
- **Sıralama satırının menüsü** (Mesaj · Dünyada Bul · İttifağa Davet) tabloya taşındı: satır
  sonundaki mesaj ve **Dünyada Bul** düğmeleri bunun karşılığı (2026-07-31).

### 13.18.0 ⭐ ARAMA — Oyuncu Ara · İttifak Ara · Dünyada Bul (2026-07-31) ✅ YAPILDI

Komuta Merkezi'nin **dördüncü sekmesi** (`/command/search`). Orijinalde Arama menüsü iki
maddeydi (`g.java:2048-2054`, ekran 107): *Oyuncu Ara* · *İttifak Ara* — ikisi de girdi.

**Oyuncu araması İKİ KİPLİ** (orijinalin `m.java:413-416` davranışı): **ada göre** (`arOyn.do?o=`)
ya da **koordinata göre** (`arOyn.do?u=kıta:diyar:üs`). Koordinat kipinde üs boş bırakılırsa o
diyarın dolu yerlerinin hepsi gelir.

⭐ **Sonuç satırı Dünya ekranının `city` nesnesiyle AYNI şekilde dönüyor** ve tıklanınca var olan
`TargetModal` açılıyor. Orijinalde de arama sonucunun menüsü, dünya haritası satırının menüsünün
aynısıydı (`i.java:542`) — böylece Saldırı/Casusluk/Nakliye/Destek/Mesaj/Davet aksiyonları
ikinci kez yazılmadan geldi.

⚠️ **GİZLİLİK: ada göre arama yalnız BAŞKENT verir** (§13.16.5). Koordinat kipinde bu kısıt YOK —
koordinatı zaten bilen biri o yeri Dünya ekranından da görebilir.

⚠️ **Eşleşme ÖNEK** (`q%`), infix değil. Mevcut `players_world_username` indeksi büyük/küçük
harfe duyarlı olduğu için `lower(username) LIKE` sorgusunda hiç kullanılamıyordu; 0023 migration'ı
`lower(username) text_pattern_ops` indeksini ekledi. İnfix (`%q%`) `pg_trgm` + GIN ister — beta
için gereksiz.
⚠️ **Desen JS'te kurulur** (`prefixPattern()`), SQL'de `|| '%'` ile DEĞİL: desen plan zamanında
sabit olmazsa Postgres öneki indeksten okuyamıyor ve `lower(username)`'ı yalnız filtreye
düşürüyor — indeks var ama boşuna. EXPLAIN testi bunu yakaladı ve regresyon olarak duruyor.
Aynı fonksiyon `%`/`_` jokerlerini de kaçırıyor (kullanıcı `%` yazınca her şey eşleşirdi).

**Dünyada Bul** (`grDny.do?o=`) orijinaldeki yerinde: **sıralama satırında** (`g.java:2040`,
ekran 106), arama sonucunda DEĞİL — arama koordinatı zaten getiriyor. Ayrı uç açılmadı; aynı
arama ucunun `?byId=` kipi başkent koordinatını veriyor (gizlilik kuralı tek yerde kalsın).
Hedef: yeni **`/world/:k/:d`** derin bağlantısı — paylaşılabilir adres + çalışan geri tuşu.
Oyuncu seçiciyi elle oynatınca yerel seçim adresi geçersiz kılar.

**Debounce 300 ms + en az 2 karakter** (`useDebounced`). Eski ittifak aramasında ikisi de yoktu
ve hızlı yazan oyuncu her tuşta bir HTTP isteği atıyordu; `staleTime` bunu çözmez (her anahtar
ayrı sorgu), gecikme girdi tarafında olmak zorunda.

Kesme uyarısı orijinal metniyle: **"İlk 20 kayıt gösteriliyor !"**. Boş sonuç metni orijinalde
YOKTU (`o.java:166-172` yalnız kahraman/ittifak için tanımlı) → uyduruldu: *"Aramanla eşleşen
oyuncu bulunamadı."*

### 13.18.1 Ekran metinleri orijinalin ağzından
`k.java` + `g.java` string tablolarından alınan, **uydurmak yerine kullanılacak** kalıplar:

| Yer | Orijinal metin |
| :-- | :-- |
| Boş sıralama | `Bu dünyada hiç ittifak yok!` · `Bu dünyada hiç kahraman yok!` · `Bu şehirde hiç kahraman yok!` |
| Boş posta | `Hiç Mesajınız Yok` · `Hiç Mesaj Yok` |
| Arama sonucu | `İlk 10 kayıt gösteriliyor !` |
| Sayfalama | `Sayfa:` · `Önceki` · `Sonraki` |
| Genel Durum alanları | `Puan:` · `Sıra Değişimi:` · `İttifak: ` · `Üye Sayısı:` · `Başkent:` · `Pozisyon:` |
| Onay kalıbı | *"… Emin misiniz!"* — **soru işareti değil ünlem**; oyunun tüm onaylarında aynı |
| Görev doğrulaması | `Saldırılarda casus kuş kullanılamaz!` · `Casusluk için sadece casus kuş seçilebilir!` · `Önce üretmek istediğin ünite sayılarını girmelisin !` |
| Hata | `Sistemde oluşan bir hata nedeniyle işleminiz gerçekleştirilemiyor, lütfen daha sonra tekrar deneyiniz!` |
| Kahraman durumu | `Görevde` · `Şehirde` · `Mağarada` · `Diriltiliyor` · `Yok Edildi` (ölü — yolda ya da şehirde) |
| Savaş sonucu | `Kazandınız !` · `Kaybettiniz !` |

Panel başlığı **"Hükümdarlık"** (web ekranı `scr_web05`) — sayfa adı "Genel Durum", panel adı
"Hükümdarlık"; ikisi orijinalde de farklı ve bizde de öyle.

### 13.18.2 🔴 BİZDE OLMAYAN SİSTEM: **MAĞARA**
Analizde çıkan en büyük eksik. Orijinalde tam bir alt sistem var ve bizim hiçbir belgemizde geçmiyor:

- Bina olarak **Mağara** (`k.java` bina listesinde `Kale`/`Mimar Okulu` ile aynı sırada).
- Menü aksiyonları: `Mağara Doldur` · `Mağara Boşalt` · `Mağara Görev` · `Mağara Rapor`.
- Birim durumları: `Mağarada` · `Mağaraya Giriyor` · `Mağaradan Çıkıyor`.
- Onaylar: *"Seçtiğiniz savaşçılar mağaraya girecek. Emin misiniz!"* / *"… çıkartılacak …"*.

Yani savaşçılar mağaraya **saklanıyor**, bir süre giriş/çıkış animasyonu (durum) yaşıyor ve
kendi raporu var. Büyük ihtimalle **saldırıda orduyu koruma** mekanizması (yağmadan/savaştan
kaçırma). ⚠️ Karar kullanıcınındır: uygulanacak mı, uygulanacaksa dengeye nasıl oturacak?

---

## 14. Açık başlıklar (birlikte kararlaştırılacak)

1. ~~**Harita & mesafe**~~ → **çözüldü, §13.5.** ~~Şehir konum kısıtı~~ → **kısıt yok** (§13.11.5).
2. **Eksik base tablolar:** yapı/teknik maliyet-süre tabloları (sunucu ölü). Formül elde; base sayılar
   türetilecek → `catalog` içinde tunable.
3. **Ekonomi dengesi:** üretim tabloları (Çiftlik/Maden 1-40 seviye) doküman placeholder'larında —
   veriler gelince katalog doldurulacak.
4. **Premium kapsamı:** hangi özellikler (ittifak kurma orijinalde premium'du).
5. ~~**Yağma şartı**~~ → **çözüldü (2026-07-26): `loot.condition = "attackerWon"`**, öncelik
   enkaz → yağma (§13.10.4).
6. **Küçük onaylar (Faz 0'ı engellemez):** palet tonları (§13.13.2 — ekranda görüp "daha koyu/sıcak"
   diyebilirsin) · başlık fontu seçimi · Tuzak savunma tabanına girsin mi (§13.11.10, şu an hayır) ·
   katalog `id`'leri İngilizce kalsın mı (§13.14.3) · Genel Sohbet'in canlıda açık kalıp kalmayacağı.
