/**
 * DÜNYA sekmesi — **harita değil, DİYAR LİSTESİ** (§13.16.2), referans `images/scr_web03`.
 *
 * Tablo altı sütun: **No · Şehir · Oyuncu · İttifak · Sıra / Puan · Görev**. Boş şehir de dolu şehir de
 * **aynı yükseklikte** satır alır — orijinalde de öyle ve göz sütunları kaydırmadan tarıyor.
 *
 * ⭐ **Görev sütunu bir kısayoldur:** simgeye tıklamak modalı doğrudan o görevin formunda açar.
 * Simgeler istemcide hedefin türünden türetiliyor (ucuz, 10 satır için 10 istek atmamak lazım);
 * **yetki kararı yine sunucunun** — modal açılınca `GET /missions/options` doğrulamayı yapar.
 *
 * **Mobilde Görev sütunu gizlenir** (sığmıyor): satıra tıklamak seçenek listesini açar.
 *
 * ⭐ **Müttefik rozeti** (kullanıcı 2026-08-07): aynı ittifaktan oyuncunun adının yanında ittifak
 * simgesi çıkar. Kararı sunucu veriyor (`slot.city.isAlly`) — bkz. `world.controller.ts`.
 *
 * ⚠️ **Gizlilik (§13.16.5):** liste asker ve kaynak GÖSTERMEZ — bunu öğrenmenin yolu casusluktur.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useActiveCity } from '../lib/city-context.tsx';
import { fmt } from '../lib/hooks.ts';
import { useCity, useMovements, useWorld, type Movement, type WorldSlot } from '../lib/queries.ts';
import { homeAction, visibleCoords } from '../lib/world-coords.ts';
import { AllyBadge } from '../components/AllyBadge.tsx';
import {
  MovementIcon, MovementModal, MovementTooltip, movementsForSlot, type TipState,
} from '../components/movements.tsx';
import { BoundedAmountInput, Button, MissionIcon, Panel, Skeleton, Td, Th } from '../components/ui.tsx';
import { TargetModal } from './world-modal.tsx';

/**
 * Hedefin türüne göre gösterilecek görev simgeleri (yalnız GÖSTERİM — yetki sunucuda).
 *
 * ⚠️ Rakip şehirde **kırmızı** varyantlar kullanılıyor (`attack_in`, `spy_back`): orijinal
 * ekranda düşmana yapılan saldırı/casusluk kırmızı kılıç ve kırmızı kuşla gösteriliyor
 * (`images/scr_web03`). Dosyalar zaten elimizde; renk filtresi uydurmaya gerek yok.
 */
function shortcutsFor(slot: WorldSlot, activeCityId: number | null): { type: string; icon: string; label: string }[] {
  if (!slot.city) return [{ type: 'found_city', icon: 'found_city', label: 'Şehir Kur' }];
  if (slot.city.isOwn) {
    // Aktif şehrin kendisine görev gönderilemez → sütun boş kalır.
    if (slot.city.id === activeCityId) return [];
    return [
      { type: 'transport', icon: 'transport_out', label: 'Nakliye' },
      { type: 'support', icon: 'support_out', label: 'Destek' },
      { type: 'teleport', icon: 'teleport', label: 'Teleport' },
    ];
  }
  return [
    { type: 'attack', icon: 'attack_in', label: 'Saldırı' },
    { type: 'spy', icon: 'spy_back', label: 'Casusluk' },
    { type: 'transport', icon: 'transport_out', label: 'Nakliye' },
  ];
}

/**
 * Şehir adından **" şehri"** ekini atar (kullanıcı kararı: sütunda yalnız ad görünsün).
 * Kayıtta üretilen ad `"<oyuncu> şehri"` biçimindeydi; yeni kayıtlarda ek artık üretilmiyor,
 * bu yardımcı **eski satırlar** için duruyor.
 */
const cityLabel = (name: string): string => name.replace(/\s+şehri$/i, '');

export function World() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  /**
   * ⭐ AÇILIŞ DİYARI = AKTİF ŞEHRİN DİYARI (kullanıcı 2026-07-30). Oyuncu elle seçim
   * yapana kadar `sel` null'dır ve görünüm aktif şehri izler; seçim yapınca sabitlenir.
   * Şehir koordinatı gelene dek sorgu da atılmaz — 1:1 "parlaması" olmaz.
   */
  const [sel, setSel] = useState<{ k: number; d: number } | null>(null);
  const [target, setTarget] = useState<{ slot: WorldSlot; type?: string } | null>(null);

  /**
   * ⭐ DERİN BAĞLANTI `/world/:k/:d` (§13.16) — "Dünyada Bul" (orijinal `grDny.do?o=`) ve
   * paylaşılabilir adres için. Adresteki koordinat **seçimden ÖNCE** gelir; oyuncu seçiciyi
   * elle oynatınca `sel` devreye girer ve adres artık takip edilmez (geri tuşu yine çalışır,
   * çünkü rota değişmedi).
   */
  const params = useParams();
  const navigate = useNavigate();
  const urlK = Number(params['k']);
  const urlD = Number(params['d']);
  const fromUrl = Number.isInteger(urlK) && Number.isInteger(urlD) && urlK > 0 && urlD > 0
    ? { k: Math.min(10, urlK), d: Math.min(500, urlD) }
    : null;

  /**
   * ⭐⭐ HEDEF SLOTU KISA BİR AN PARLIYOR (kullanıcı, 2026-08-19): *"savaş raporu, casusluk
   * raporu gibi ekranlardan bir koordinata tıklayıp dünya ekranını açıyorsak, o koordinata
   * kısa bir anlığına highlight verelim ki oyuncu ekranı açınca hangi şehre gittiğini
   * anlasın."*
   *
   * ⚠️⚠️ Adres `/world/:k/:d` **değişmedi**; slot bir **sorgu parametresi** (`?s=`) olarak
   * geliyor. Yola üçüncü bir segment eklemek eski bağlantıları kırardı ve slot zaten adresin
   * kimliği değil, bir **vurgu ipucu**: diyarı açan şey k:d, s yalnız "hangisine bak" diyor.
   *
   * ⚠️ Diyar değiştiğinde vurgu kendiliğinden ölür (`useEffect` bağımlılığı): oyuncu başka
   * bir diyara geçtiğinde eski slotun parlaması yanlış yeri işaret ederdi.
   */
  const [search] = useSearchParams();
  const highlightSlot = Number(search.get('s'));
  const [flash, setFlash] = useState<number | null>(null);

  /**
   * ⭐⭐ `?m=` — RAPORDAN GELEN SEFER TÜRÜ (kullanıcı, 2026-08-21: raporlara «saldır» ve
   * «casus gönder» düğmeleri).
   *
   * ⚠️⚠️ Rapor sefer formunu KENDİ açmıyor, buraya yönlendiriyor ve bu bilinçli. `TargetModal`
   * bir `WorldSlot` istiyor; raporun elinde yalnız koordinat var ve slotu rapordan **uydurmak**
   * yanlış olurdu: rapor tarihsel bir kayıt, koordinatın sahibi o günden beri değişmiş
   * olabilir. Buraya gelince slot **taze** listeden çözülüyor, oyuncu hedefin bugünkü hâlini
   * (sahibi, koruması, ittifakı) görüyor ve form doğru veriyle açılıyor.
   *
   * ⚠️ `?s=` ile aynı biçim: yola segment eklenmedi, tür bir **ipucu**. `?s=` olmadan `?m=`
   * anlamsız (hangi slot?) ve o yüzden ikisi birlikte okunuyor.
   */
  const missionType = search.get('m');
  const missionRef = useRef<string | null>(null);

  /**
   * ⚠️⚠️ **BİR KEZ parlıyor** (kullanıcı bildirimi, 2026-08-19): *"dünyada diyar değişince
   * aynı satıra yapmaya devam ediyor. İlk açılışta bir kere yapması lazım."*
   *
   * İlk yazımda etkinin bağımlılıkları arasında `k` ve `d` vardı; oyuncu diyar değiştirince
   * etki yeniden koşuyor ve **başka bir diyarda** aynı numaralı slotu parlatıyordu — yani
   * vurgu yanlış yeri işaret ediyordu. Bu `ref` "bu `?s=` için zaten parladık" diyor ve
   * yeniden çizimler onu tetikleyemiyor.
   *
   * ⚠️ Anahtar `k:d:s` üçlüsü, yalnız `s` DEĞİL: oyuncu başka bir rapordan aynı slot
   * numarasına ama başka bir diyara giderse o gerçekten yeni bir vurgu.
   */
  const flashedRef = useRef<string | null>(null);

  const home = city.data?.coordinates;
  /* ⚠️ Öncelik zinciri ve «eve dön» kararı `lib/world-coords.ts`te — orada test edilebiliyor,
     burada edilemiyordu ve 2026-08-16 hatası tam bu yüzden gözden kaçtı. */
  const { k, d } = visibleCoords(sel, fromUrl, home ?? null);
  const world = useWorld(k, d, sel != null || fromUrl != null || home != null);
  /* ⚠️ Diyar elle değişince vurgu ANINDA söndürülüyor: `useEffect`in erken dönmesi yeni bir
     parlama başlatmıyor ama ekranda duran eskisini de kaldırmıyordu. */
  const setK = (n: number): void => { setFlash(null); setSel({ k: n, d }); };
  const setD = (n: number): void => { setFlash(null); setSel({ k, d: n }); };

  const slots = world.data?.slots ?? [];

  /**
   * ⭐ SATIRA ASILAN GÖREV SİMGELERİ (kullanıcı, 2026-08-21).
   *
   * ⚠️ Bu **yeni bir ağ isteği değil**: `['missions']` anahtarını şehir şeridi zaten her
   * ekranda çekiyor, React Query aynı anahtarı paylaşıyor. Sunucuya dokunmaya da gerek
   * kalmadı — `Movement` hem uçları hem yönü hem `cityId`yi zaten taşıyor.
   */
  const movements = useMovements();
  const allMovements = movements.data?.movements ?? [];
  const [tip, setTip] = useState<TipState | null>(null);
  const [openMovement, setOpenMovement] = useState<Movement | null>(null);

  /* ⚠️ Vurgu LİSTE GELDİKTEN sonra başlıyor (`slots.length` bağımlılığı): veri gelmeden
     tetiklenirse animasyon boş iskeletin üstünde akıp biter ve oyuncu hiçbir şey görmez.
     ⚠️ Süre 1,6 sn: kullanıcı *"kısa bir an parlayıp sönen"* dedi. Daha kısası göz kırpmayla
     kaçırılabiliyor, daha uzunu ekranda takılı kalmış gibi duruyor. */
  useEffect(() => {
    if (!Number.isInteger(highlightSlot) || highlightSlot <= 0) return;
    if (slots.length === 0) return;
    // ⚠️ Oyuncu diyarı ELLE değiştirdiyse (`sel`) vurgu artık geçersiz: adresteki slot
    //    başka bir diyarda başka bir şeye denk gelir.
    if (sel != null) return;
    const key = `${k}:${d}:${highlightSlot}`;
    if (flashedRef.current === key) return;
    flashedRef.current = key;
    setFlash(highlightSlot);
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [highlightSlot, slots.length, k, d, sel]);

  /**
   * ⭐ Rapordan gelen `?m=` sefer formunu açıyor — **liste geldikten sonra** ve **bir kez**.
   * Vurgunun (`flash`) disipliniyle aynı ve aynı gerekçelerle: veri gelmeden slot çözülemez,
   * `ref` olmadan her yeniden çizim modalı geri açar ve oyuncu kapatamaz.
   *
   * ⚠️ Slot BOŞSA da modal açılıyor: boş koordinata «şehir kur» meşru bir sefer ve
   * `TargetModal` zaten o durumu biliyor. Erken dönmek, rapordaki koordinat bu arada
   * boşalmışsa oyuncuyu sessizce hiçbir şeye götürmek olurdu.
   */
  useEffect(() => {
    if (missionType == null || missionType === '') return;
    if (!Number.isInteger(highlightSlot) || highlightSlot <= 0) return;
    if (slots.length === 0 || sel != null) return;
    const key = `${k}:${d}:${highlightSlot}:${missionType}`;
    if (missionRef.current === key) return;
    missionRef.current = key;
    const slot = slots.find((s) => s.s === highlightSlot);
    if (slot) setTarget({ slot, type: missionType });
  }, [missionType, highlightSlot, slots, k, d, sel]);

  return (
    <div className="space-y-2">
      {/* Seçici TEK SATIR ve küçük: diyar listesi sayfa kaydırmadan ekrana sığmalı. */}
      <Panel title="Dünya" right={`${k}:${d}`}>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="shrink-0 text-[11px] text-muted">Kıta</span>
          <select value={k} onChange={(e) => setK(Number(e.target.value))}
            className="tnum shrink-0 rounded-[var(--radius-sm)] border border-border bg-raised px-1.5 py-1 text-sm text-ink">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="ml-1 shrink-0 text-[11px] text-muted">Diyar</span>
          <Button size="sm" variant="ghost" onClick={() => setD(Math.max(1, d - 1))}>−</Button>
          {/* ⚠️ `AmountInput` DEĞİL: alan alt sınır yüzünden silinemiyordu (bkz. ui.tsx). */}
          <BoundedAmountInput min={1} max={500} value={d} onCommit={setD} aria-label="Diyar" />
          <Button size="sm" variant="ghost" onClick={() => setD(Math.min(500, d + 1))}>+</Button>
          {home ? (
            /**
             * ⭐⭐ **KENDİ DİYARIMA DÖN — adresi de temizlemek ZORUNDA** (kullanıcı, 2026-08-16).
             *
             * ⚠️ Eskiden yalnız `setSel(null)` yapıyordu ve derin bağlantıyla açılmış sayfada
             * YANLIŞ yere gidiyordu: koordinat çözümü `sel ?? fromUrl ?? home` sırasıyla
             * ilerliyor, yani `sel` boşalınca sıra `home`a değil **adresteki koordinata**
             * düşüyordu. Casusluk raporundan Dünya'ya geçen oyuncu düğmeye basınca kendi
             * diyarına değil raporun diyarına dönüyordu.
             *
             * `/world`e gitmek `fromUrl`ü null yapıyor → zincir `home`a iniyor. `setSel(null)`
             * korunuyor çünkü asıl anlamı "sabitlemeyi bırak, aktif şehri izle": oyuncu sonra
             * şehir değiştirirse görünüm onu takip etmeli (dosya başındaki açılış kuralı).
             *
             * ⚠️ `replace` KULLANILMIYOR: geri tuşu raporun diyarına dönebilmeli — oyuncu
             * "bir bakıp geri döneyim" akışında tam olarak bunu bekliyor.
             */
            <Button size="sm" variant="ghost" className="ml-auto px-1.5 py-0.5"
              title="Kendi diyarıma dön"
              onClick={() => {
                const a = homeAction(fromUrl);
                setSel(a.sel);
                if (a.clearUrl) navigate('/world');
              }}>
              <img src="/assets/buildings/city.png" alt="" width={22} height={22}
                className="icon-shadow h-[22px] w-auto object-contain" />
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Diyar listesi">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                <Th className="w-8 text-center">#</Th>
                {/*
                  ⭐ ŞEHİR ADI **MOBİLDE GİZLİ** (kullanıcı, 2026-08-11). Dar ekranda ad,
                  oyuncu adı ve sıra/puan üçü birden sığmıyordu; ad kırpılınca da zaten
                  okunmuyordu. Karar: adı satırdan çıkar, **modalda büyük** göster — çünkü
                  "kim, ne kadar güçlü" kararı satırda, "hangi şehir" kararı modalda veriliyor.
                */}
                <Th className="hidden sm:table-cell">Şehir</Th>
                <Th>Oyuncu</Th>
                <Th className="hidden sm:table-cell">İttifak</Th>
                {/* ⭐ Sıra TEK BAŞINA yetmiyordu (kullanıcı, 2026-08-09): «12.» bir hedefin ne
                    kadar güçlü olduğunu söylemiyor, aradaki fark söylüyor. İkisi tek sütunda
                    çünkü aynı anlık görüntünün iki yüzü. */}
                <Th className="w-28 text-center whitespace-nowrap">Sıra / Puan</Th>
                {/* Mobilde sığmıyor → gizli; satıra tıklayınca seçenek listesi açılıyor. */}
                <Th className="hidden w-32 text-center sm:table-cell">Görev</Th>
              </tr>
            </thead>
            <tbody>
              {/* ⭐ İSKELET: diyar değişince veri gelene kadar AYNI yükseklikte 10 gri satır
                  çizilir. Önceden tablo boşalıp yeniden doluyordu ve ekran zıplıyordu. */}
              {slots.length === 0
                ? Array.from({ length: 10 }, (_, i) => (
                  <tr key={`sk${i}`} className={`h-9 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                    <Td className="tnum text-center text-muted">{i + 1}</Td>
                    <Td className="hidden sm:table-cell"><Skeleton w="7rem" /></Td>
                    <Td><Skeleton w="5rem" /></Td>
                    <Td className="hidden sm:table-cell"><Skeleton w="4rem" /></Td>
                    <Td className="text-center"><Skeleton w="3.5rem" /></Td>
                    <Td className="hidden sm:table-cell"><Skeleton w="5rem" /></Td>
                  </tr>
                ))
                : null}
              {slots.map((slot, i) => {
                const c = slot.city;
                const shortcuts = shortcutsFor(slot, cityId);
                /**
                 * ⭐ AKTİF ŞEHİR BELİRTECİ (kullanıcı, 2026-08-03): *"Bize ait şehirler belirgin
                 * ama aktif şehri de anlamak için bir işaret koyalım."*
                 *
                 * ⚠️ Renkle DEĞİL kenarla ayrılıyor. "Bize ait" zaten `text-own` kullanıyor;
                 * aktif şehri de renkle işaretlemek iki farklı anlamı aynı kanala yığardı ve
                 * ikisi de okunmaz hâle gelirdi.
                 * ⚠️ Yanına «(buradasın)» yazısı da konmuştu; kullanıcı aynı gün kaldırttı —
                 * *"soldaki kenarlık rengi yeterli"*. Satır zaten dar, metin gürültü oluyordu.
                 *
                 * ⚠️ **`text-own`, `text-accent` DEĞİL** (kullanıcı bildirimi, 2026-08-11:
                 * *"açık modda kendi şehirlerimizin yazısı belli olmuyor"*). Gündüz `accent`
                 * bronz (`#8A5A2B`), gövde mürekkebi ise koyu kahve (`#2B2116`) — ikisi **aynı
                 * ailede** ve yalnız açıklıkla ayrılıyor, yani 12px'lik bir tablo satırında
                 * «biraz solmuş yazı» gibi okunuyordu. Yeni `own` token'ı laciverte geçiyor:
                 * kazanç açıklıkta DEĞİL **tondadır** (ölçüm: mürekkeple açıklık oranı 2,69 →
                 * 2,30 ile hafifçe DÜŞTÜ; gözü ayıran şey sıcak-soğuk zıtlığı).
                 */
                const isActive = c != null && c.id === cityId;
                const rowMovements = movementsForSlot(allMovements, cityId, { k, d, s: slot.s });
                // ⭐ Rapordan gelen slot — kısa bir an parlıyor (gerekçe `flash` başlığında).
                const isFlash = flash === slot.s;
                return (
                  <tr
                    key={slot.s}
                    onClick={() => setTarget({ slot })}
                    /* ⭐ Tüm satırlar EŞİT yükseklikte (`h-9`): boş şehir de dolu şehir kadar yer
                       kaplar, böylece 10 satır her ekranda aynı yüksekliği tutar. */
                    className={`h-9 cursor-pointer border-b border-border transition-colors hover:bg-raised ${
                      i % 2 === 1 ? 'bg-row-alt' : ''
                    } ${c?.isOwn ? 'text-own' : 'text-ink'} ${
                      isActive ? 'bg-raised/60 shadow-[inset_3px_0_0_0_var(--color-accent)]' : ''
                    } ${isFlash ? 'mw-flash' : ''}`}
                  >
                    <Td className="tnum text-center text-muted">{slot.s}</Td>
                    {/*
                      ⛔ **BAŞKENT YILDIZI KALDIRILDI** (kullanıcı, 2026-08-11) — ve orijinal
                      oyun da bizi doğruluyor: istemcideki tek "Başkent:" dizesi (`k.a[194]`)
                      YALNIZ **Oyuncu Ara** ekranında kullanılıyor (`g.java` case 41 → `j.java`
                      mod 5). Dünya ekranının slot çizimi (`j.java d()`) yalnız `Şehir: <ad>` +
                      `İttifak: <i>` ya da `Durum: Sahipsiz` yazıyor; **başkent işareti yok.**
                      Bilgi kayıp değil: modalda «· başkent» olarak duruyor.
                    */}
                    <Td className="hidden max-w-[9rem] truncate font-medium sm:table-cell">
                      {c ? cityLabel(c.name) : <span className="text-muted">—</span>}
                    </Td>
                    {/*
                      ⭐ MÜTTEFİK ROZETİ (kullanıcı 2026-08-07) — adın YANINDA, İttifak sütununda
                      değil: o sütun mobilde gizli ve asıl "saldırayım mı" kararı orada veriliyor.
                      ⚠️ `truncate` artık iç `span`de: flex kabında bir öge varsayılan
                      `min-width:auto` yüzünden içeriğinin altına inemez → `min-w-0` olmadan uzun
                      ad kısalmaz, rozeti hücreden dışarı iterdi.
                    */}
                    <Td className="max-w-[8rem]">
                      {c ? (
                        <span className="flex items-center gap-1">
                          {/*
                            ⭐ OYUNCU ADI **KALIN** (kullanıcı, 2026-08-11). Şehir adı mobilde
                            gizlendikten sonra satırın asıl kimliği bu sütun oldu; ağırlık onu
                            koordinat ve sıra sayılarının arasından öne çıkarıyor.
                            ⚠️ Renk DEĞİL ağırlık: renk kanalı zaten dolu — `text-own` "benim
                            şehrim", müttefik rozeti "dostum" diyor. Üçüncü bir anlamı da renge
                            yıkmak hepsini okunmaz hâle getirirdi (aynı gerekçe: aktif şehir
                            belirteci de kenarlıkla çizildi).
                          */}
                          <span className="min-w-0 truncate font-semibold">{c.username}</span>
                          {c.isAlly ? <AllyBadge /> : null}
                          {/*
                            ⭐ GÖREV SİMGELERİ ADIN YANINDA (kullanıcının şartı, 2026-08-21).
                            ⚠️ `shrink-0`: sıkışınca ad kırpılır, simge kırpılmaz. Yarım çizilen
                            bir simge hangi görev olduğunu söylemez; yarım bir ad hâlâ okunur.
                            ⚠️ `stopPropagation` ŞART — satırın kendisi hedef penceresini
                            açıyor ve simgeye basan oyuncu onu değil hareketi görmek istiyor.
                          */}
                          {rowMovements.map((m) => (
                            <span key={m.key} className="shrink-0"
                              onClick={(e) => e.stopPropagation()}>
                              <MovementIcon m={m} onTip={setTip} onOpen={setOpenMovement} />
                            </span>
                          ))}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="hidden max-w-[8rem] truncate text-muted sm:table-cell">
                      {c?.alliance ?? '—'}
                    </Td>
                    {/*
                      ⚠️ `rank` yoksa puan da YAZILMAZ: ikisi de aynı `rankings` satırından
                      geliyor, biri yoksa diğeri de yok (anlık görüntü henüz alınmamış). Tek
                      başına bir puan yazmak, sıranın "hesaplanamadığını" değil "sıfır"
                      olduğunu ima ederdi.
                      ⚠️ `rankScore` ayrıca `?? null` ile korunuyor: sunucusu eski bir istemci
                      alanı hiç görmez, o zaman satır eskisi gibi yalnız sırayı yazar.
                    */}
                    <Td className="tnum text-center whitespace-nowrap text-muted">
                      {c?.rank == null ? '—' : (
                        <>
                          {c.rank}
                          {c.rankScore == null ? null : (
                            <><span className="mx-0.5 opacity-50">/</span>{fmt(c.rankScore)}</>
                          )}
                        </>
                      )}
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="flex items-center justify-center gap-1">
                        {shortcuts.map((s) => (
                          <button
                            key={s.type}
                            title={s.label}
                            onClick={(e) => { e.stopPropagation(); setTarget({ slot, type: s.type }); }}
                            className="rounded-[var(--radius-sm)] p-0.5 transition-[filter] hover:brightness-125"
                          >
                            <MissionIcon id={s.icon} size={22} title={s.label} />
                          </button>
                        ))}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {target ? (
        <TargetModal
          slot={target.slot}
          coords={{ k, d }}
          initialType={target.type}
          onClose={() => setTarget(null)}
        />
      ) : null}

      {/* ⚠️ Tooltip modal AÇIKKEN gizleniyor (şehir şeridindeki kararın aynısı): ikisi üst
          üste binince tooltip modalın önünde asılı kalıyor ve fare modalın içindeyken
          kapanmıyor. */}
      {tip && !openMovement ? <MovementTooltip {...tip} /> : null}
      {openMovement ? (
        <MovementModal m={openMovement} onClose={() => setOpenMovement(null)} />
      ) : null}
    </div>
  );
}
