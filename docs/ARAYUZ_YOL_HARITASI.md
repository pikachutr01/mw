# ARAYÜZ — KALAN İŞLER

> **Bu dosya artık yalnız YAPILACAKLAR listesidir.** Kaynağı kullanıcının ekran görüntüsü
> referanslı geri bildirimi (`duzenleme_onerileri.txt`). Bitmiş işlerin tur tur dökümü buradan
> **kaldırıldı** — o kayıt zaten commit mesajlarında duruyor (`git log`), burada tutmak aynı
> bilgiyi ikinci kez takip etmek demekti.
>
> Yerleşen kararlar ve formüller **`MOBIWAR_SISTEM_PLANI.md`**'de yaşar; oyunun nasıl açılacağı,
> tuzaklar ve sıradaki iş **`BASLANGIC.md`**'de. Referans görseller `images/`.

---

## 🔴 Karar bekleyen

*(şu an yok — üretim süresi, ekonomi tabanları ve seviye tavanı 2026-07-28'de kapandı)*

## 🎨 Eksik görsel

*(yok — `teleport.png` 2026-07-28'de eklendi, görev simgeleri tam)*

---

## A. Dünya ekranı (referans `scr_web03`)

- [x] ~~Şehre tıklayınca **görev seçenekleri** modalı~~ ✅ 2026-07-28 — altı görev tipi de
      çalışıyor (`screens/world-modal.tsx`), seçenekleri sunucu belirliyor. Ayrıntı: BAŞLANGIÇ §4
- [x] ~~**oyuncu sırası** (son güncellemeden, canlı hesaplanmaz)~~ ✅ 2026-07-28 — sıra artık
      `rankings` anlık görüntüsünden okunuyor; Dünya ile Sıralamalar birebir aynı sayıyı veriyor
- [ ] Tablo sütunları: **ittifak adı** (şema İttifak turunda) · **görev simgeleri** (satırın
      sağında, o şehre yapılabilecekler)
- [ ] **Mesaj** seçeneği — DM Faz 3'te geliyor, modalda yeri hazır

## B. Komuta Merkezi — ✅ 2026-07-28 (`screens/Command.tsx`)

- [x] ~~**Genel Durum** ("Hükümdarlık" paneli): puan · sıra · sıra değişim · ittifak alanları ·
      teknik seviyeleri · şehir tablosu (satır = kalem, sütun = şehir — orijinaldeki yön)~~
- [x] ~~**Sıralamalar**: Oyuncu · İttifak · Kahraman · sütunlar Sıra/Oyuncu/Puan/Değişim/İttifak/✉~~
- Ayrıntı ve gerekçeler: `MOBIWAR_SISTEM_PLANI.md` §13.17 (puan/sıra) ve §13.18 (menü ağacı).
- [ ] **Kalan:** ittifak adı/sırası sütunları (İttifak şeması gelince) · **Arama** sekmesi
      (Oyuncu Ara / İttifak Ara — orijinalde bu hub'ın altında, §13.18) · **Gelen Ordu** paneli
      (şu an Ordular ekranında) · satır menüsünün diğer maddeleri (**Dünyada Bul** · İttifağa Davet)
- [ ] Mesaj düğmesi **etkin** olacak — DM (§13.12) açılınca

## C. İttifak (`scr_web06`) — ✅ 2026-07-30 (`screens/Alliance.tsx`)

- [x] Üyeler tablosu: ad · puan · dünya sırası · rütbe · çevrimiçi durumu · sayfa başına **20**
- [x] Düzenlenebilir **ittifak metni** (tüm üyeler görür) · toplu mesaj · ittifaktan ayrıl
- [ ] **Kalan tek madde — askerî unvanlar** (`k.java:1214`): Lider · Konsey Üyesi · Asker ✅
      yapıldı; **Subay · Komutan · Başkomutan · Mareşal** ❌ yok. Son dördü lider tarafından
      verilmiyor, **savaş başarısına göre** kazanılıyor ve muhtemelen süreli. Şimdilik yalnız
      gösterim (özel rozet); kazanma kuralı sonra. Bkz. `EKSIK_OZELLIKLER.md` §2.

## D. Tapınak / Kahramanlar (`kahramanlar.jpeg`) — ✅ 2026-07-29 (`screens/Temple.tsx`)

- [x] Yetenek puanları · mevcut XP / sonraki seviye XP · görevde mi
- [x] Kahraman **hangi şehirdeyse veya hangi şehirden göreve çıktıysa** o şehrin tapınağında
- [x] Dirilt · Seviye Arttır · Özellikler · Adını Değiştir

## E. Ayrıntı modalları

- [ ] **Birim detay modalı**: alan · hız · savaşçının hikâyesi (görseller hazır)
- [ ] **Yapı detay modalı**: yapıya tıklayınca; Kale'de **bütçe çubuğu** burada görünecek
      (`Budget` bileşeni `screens/City.tsx`'te bu gün için duruyor)
- [ ] **Yardım sayfası**: casusluk kademeleri, iade kuralları, sefer süresi formülü —
      modallardan kaldırılan açıklamalar buraya toplanacak (kullanıcı: *"ayrı bir sayfada
      detaylı olarak sunacağız"*)

## H. Ordular ekranı

- [ ] **Alt liste opsiyonel olsun**: şehir şeridinde zaten görünen hareketler altta tablo olarak
      tekrarlanıyor. Kullanıcı: *"şimdilik kalsın, ileride ayarlardan opsiyonel sunarız."*

## E2. Tooltip — ✅ altyapı hazır (`components/Tooltip.tsx`)

Portal + kenara kelepçeleme + klavye odağı. Şu an bağlı olduğu yerler: bağlantı noktası,
hızlandırılmış dünya rozeti, şehir sütunu başlıkları, sıralama mesaj düğmesi, anlık görüntü saati.

- [ ] Yaygınlaştır: birim/yapı satırları (maliyet · süre · ön-şart), savaş raporu alanları,
      kaynak sayaçları (üretim hızı), kuyruk çubukları

## F. Bildirim ve oturum

- [ ] **Web Push** (offline oyuncu) — outbox'a ikinci sink. Ordu dönüşü **rapor değil push**
- [ ] **Bildirim ayarları sayfası** — hangi olayda push/normal bildirim gelsin
- [ ] **Tek aktif sekme** kuralı (WhatsApp gibi): başka sekmeden açınca uyarı

## G. Sohbet — ⚠️ kullanıcı EN SONA aldı

- [ ] **Genel Sohbet** (§13.12): WS odaları, kimlik doğrulama ve `ChatGateway` iskeleti hazır

---

## 📌 Çözülemeyen tek veri

**Kahraman diriltme SÜRESİ.** Ekrandaki tapınak seviyesi bilinmediği için tek veri noktasıyla
taban ve oran birlikte çözülemiyor (`scr_itv03`: sv0 ölü kahraman, 3000/2000, 2:04:27 — bizim
formülümüz 2:00:00 veriyor). **Farklı tapınak seviyeli ikinci bir kahraman ekran görüntüsü**
gelirse iki bilinmeyen anında çözülür. Maliyet formülü doğrulandı, süre `world_config.hero.revive`
altında denge düğmesi olarak duruyor.
