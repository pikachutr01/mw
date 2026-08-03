/**
 * ⭐ YARDIM — oyunun kural kitabı (kullanıcı isteği, 2026-08-03).
 *
 * `/help` bir **konu indeksi**: oyunun bütün sistemleri madde madde. Hesaplama gerektiren
 * araçlar (şimdilik yalnız Sefer Cetveli) ilgili konunun altından **ayrı sayfaya** bağlanıyor.
 *
 * ⚠️ İlk sürümde `/help` doğrudan Sefer Cetveli'ni açıyordu; kullanıcı düzeltti:
 * *"Yardım sayfası oyunla ilgili genel tüm bilgileri kaplayan bir giriş sayfası niteliğinde
 * olacak… Sefer cetvelini de ona en uygun bir konunun altına bağlantı olarak koyacağız."*
 *
 * ⚠️ **MİSAFİR DE OKUR.** Rota hem oturumlu hem misafir ağacında kayıtlı; metinler oturum
 * gerektirmiyor. Yalnız Sefer Cetveli oturum ister (çıkış noktası aktif şehir).
 *
 * ⚠️⚠️ **METİNLERE AYARLANABİLİR SAYI YAZILMAZ.** Fiyatlar, süreler, oranlar ve eşikler
 * panelden dünya başına değiştirilebiliyor; buraya sabit yazmak, ilk ayar değişikliğinde
 * oyuncuya yalan söylemek olurdu. Bu yüzden metinler KURALI anlatıyor, sayıyı değil — sayı
 * gerektiğinde onu canlı hesaplayan bir araç (Sefer Cetveli gibi) bağlanıyor.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HERO_SPEED, UNITS_BY_ID } from '@mobilwar/catalog';
import { route, travelSeconds } from '@mobilwar/engine';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCatalog, useCity } from '../lib/queries.ts';
import { formatDuration } from '../lib/hooks.ts';
import { Button, Empty, Panel } from '../components/ui.tsx';

/* ═══ Giriş sayfası — konu indeksi ══════════════════════════════════════════ */

interface Topic {
  title: string;
  items: string[];
  /** Konunun altına düşen araç bağlantısı (varsa). */
  tool?: { to: string; label: string; hint: string };
}

/**
 * ⚠️ Maddeler koddaki DAVRANIŞTAN yazıldı, dokümandan değil — ikisi ayrıldığında oyuncunun
 * gördüğü şey kod. Sayı geçen tek yer yok; hepsi kural cümlesi (yukarıdaki gerekçe).
 */
const TOPICS: Topic[] = [
  {
    title: 'Temel akış',
    items: [
      'Oyun **zamanlanmış olaylar** üzerine kurulu: sen çevrimdışıyken de çiftliklerin üretir, ordularının yolu ilerler, savaşların çözülür.',
      'Her şehir kendi kaynağını, kendi binalarını ve kendi ordusunu tutar. Teknikler ise OYUNCUYA aittir — bir kez araştırıldığında bütün şehirlerinde geçerlidir.',
      'Yeni hesap **acemi koruması** ile başlar: bu süre boyunca sana saldırılamaz.',
      'Kaynak birikimi tembeldir: şehri açtığında o ana kadar biriken üretim tek seferde hesaplanır. Yani oyunu açık tutmak avantaj sağlamaz.',
    ],
  },
  {
    title: 'Şehir ve yapılar',
    items: [
      'Çiftlik yemek, Maden altın üretir; ikisi de diğer yapılardan daha yükseğe çıkabilir.',
      '**Kale** şehrin yapı bütçesini belirler: bütçe dolduğunda yeni seviye alabilmek için önce Kale yükseltilir. Kale, Sur ve Büyü Kalkanı bu bütçeyi TÜKETMEZ.',
      '**Mimar Okulu** yapı inşasını hızlandırır — ama kendi yükseltmesini hızlandırmaz.',
      '**Baraka** savaşçı üretimini hızlandırır ve aynı anda kaç sefer/sipariş yürütebileceğini sınırlar.',
      '**Akademi** teknik araştırmasını hızlandırır; araştırma onu başlatan şehirden iptal edilir.',
      '**Mağara** kuşatmada savaşçılarını saklar. İçindekiler savaşa katılmaz; yeterince Cüce gelirse mağara yıkılır.',
      '**Tapınak** kahraman kapasitesini ve diriltme süresini belirler. Kahraman çıkma ihtimali ise TÜM şehirlerindeki tapınakların toplamına bakar.',
      '**Teleport** kendi şehirlerin arasında birlikleri anında taşır; kaynak taşınmaz ve her iki şehirde de bina gerekir. Kullanımdan sonra bekleme süresine girer.',
    ],
  },
  {
    title: 'Ordu ve savunma',
    items: [
      'Savaşçılar sefere çıkar; savunma birimleri (Sur, Büyü Kalkanı, kuleler, tuzaklar) şehirden **çıkmaz**.',
      'Savaşta önce Sur ve Büyü Kalkanı devreye girer, sonra birimler çarpışır.',
      '**Tuzaklar** gelen ordunun ağırlığına göre patlar: tek bir Kaos tarlayı süpürürken tek bir Cüce yarım tuzağa ancak yeter. **Uçan birimler tuzağa basmaz.**',
      'Yıkılan savunma birimleri saldırgana **enkaz vermez** — savunmaya yatırım yapmak seni kaynak çiftliğine çevirmez.',
      'Gece saatlerinde savunan avantajlıdır.',
    ],
  },
  {
    title: 'Seferler',
    items: [
      'Bütün seferler **Dünya** ekranından, hedef şehre tıklanarak başlatılır.',
      'Sefer süresi ordunun **en yavaş üyesinin** hızına ve mesafeye bağlıdır. Kahraman orduyu hızlandırmaz ama ordudan yavaşsa yavaşlatır.',
      '**Haritacılık** tekniği yol süresini kısaltır; her seferde bulunan sabit hazırlık payını kısaltmaz.',
      'Yoldaki ordu geri çağrılabilir: gittiği yol kadar sürede döner.',
      '**Casus Kuş** yalnız casusluk ve destek görevine katılır; saldırıya ve nakliyeye katılmaz.',
      '**Destek** tek yönlüdür: birlikler hedef şehre kalıcı olarak yerleşir, dönüş görevi yoktur.',
    ],
    tool: {
      to: '/help/sefer',
      label: 'Sefer Cetveli',
      hint: 'Hangi birim, hangi hedefe, hangi Haritacılık seviyesinde kaç dakikada gider',
    },
  },
  {
    title: 'Kahramanlar',
    items: [
      'Kahraman savaşlardan tecrübe kazanır ve seviye atladıkça yetenek puanı biriktirir.',
      'Ölen kahraman kaybolmaz: Tapınak\'tan diriltilebilir. Diriltme hem kaynak hem süre ister; kahramanın seviyesi süreyi uzatır, Tapınak seviyesi kısaltır.',
      'Kahraman saldırı, destek, teleport ve şehir kurma görevlerine katılabilir.',
      'Ordunun tamamı ölse bile kahraman kendi hızıyla eve döner.',
    ],
  },
  {
    title: 'Casusluk',
    items: [
      'Casusluk yalnız Casus Kuş ile yapılır; gönderilen kuş sayısı arttıkça öğrenilen bilgi kademesi yükselir.',
      'Rakibin Casusluk seviyesi ve şehrindeki kuşlar bilgiyi kısabilir veya tamamen engelleyebilir.',
      'Sana casusluk yapıldığında bunu görürsün — ne kadar bilgi sızdığını da.',
    ],
  },
  {
    title: 'Şehirler ve genişleme',
    items: [
      '**Sömürgecilik** tekniği ilerledikçe yeni şehir kurma hakkı açılır; toplam şehir sayısının bir üst sınırı vardır.',
      'Şehir kurma konumu serbesttir — dünyanın herhangi bir boş şehir yerine kurulabilir. ⚠️ Uzağa kurulan şehir savunulamaz: destek ve teleport dışında yardım gitmez.',
      'Ordun varmadan oraya başkası şehir kurarsa ordun geri döner.',
      'Başkent dışındaki şehirler terk edilebilir; terk etmeden önce barakanın, mağaranın ve tapınağın boş olması gerekir.',
    ],
  },
  {
    title: 'İttifak ve sıralama',
    items: [
      'İttifak üyeleri birbirinin çevrimiçi durumunu görür; bu bilgi ittifak dışına sızmaz.',
      'Askerî ünvanlar (Subay, Komutan, Başkomutan, Mareşal) tek bir savaşta düşmana kaybettirilen değere göre verilir — savaşı kaybeden taraf da alabilir. **Yalnız ittifak sayfasında görünür.**',
      'Sıralama sürekli değil, **belirli aralıklarla** güncellenir. Ekranda yazan puan da o anlık görüntüden gelir; iki güncelleme arasında değişmez.',
    ],
  },
  {
    title: 'Hesap',
    items: [
      'E-postanı doğrulamayan hesaplar bazı kısıtlamalara tabidir (saldırı, nakliye, mesaj, ittifak ve şehir kurma kapalıdır).',
      '**Tatil modu** oyunu tamamen dondurur: saldırılamazsın ama üretim ve ilerleme de durur. Girmek için hiçbir şehrinde iş ve hareket olmamalıdır.',
      'Seçenekler ekranından aktif cihazlarını görebilir ve uzaktan çıkış yapabilirsin.',
    ],
  },
];

/** `**kalın**` işaretlerini vurguya çevirir — metinler düz yazı olarak duruyor. */
function renderItem(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**')
      ? <b key={i} className="text-ink">{part.slice(2, -2)}</b>
      : <span key={i}>{part}</span>
  ));
}

export function HelpScreen(): React.ReactElement {
  return (
    <div className="space-y-3">
      <Panel title="Yardım">
        <p className="px-3 py-3 text-sm text-muted">
          Oyunun kuralları konu konu aşağıda. Sayılar (fiyat, süre, oran) dünyaya göre
          değişebildiği için burada yazmıyor — hesap gerektiren yerlerde konunun altındaki
          <b className="text-ink"> araç bağlantısını</b> kullan, o senin dünyandan okur.
        </p>
      </Panel>

      {TOPICS.map((t) => (
        <Panel key={t.title} title={t.title}>
          <ul className="space-y-1.5 px-3 py-3 text-sm text-muted">
            {t.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span aria-hidden className="shrink-0 text-accent">•</span>
                <span>{renderItem(it)}</span>
              </li>
            ))}
          </ul>
          {t.tool ? (
            <Link
              to={t.tool.to}
              className="flex items-center gap-3 border-t border-border px-3 py-2.5 hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-accent">{t.tool.label}</span>
                <span className="block text-[11px] text-muted">{t.tool.hint}</span>
              </span>
              <span aria-hidden className="shrink-0 text-muted">›</span>
            </Link>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

/* ═══ Sefer Cetveli — ayrı sayfa ════════════════════════════════════════════ */

/**
 * ⭐ ÖN AYARLAR **AKTİF ŞEHRE GÖRE** (kullanıcı düzeltmesi, 2026-08-03).
 *
 * ⚠️ İlk sürümde sabit koordinatlardı (`1:1:2`, `1:2:1`…) ve kullanıcı hatayı yakaladı:
 * *"Bu butonlara tıklayınca her şehirde aynı koordinatı veriyor."* Sayfanın bütün fikri
 * "senin şehrinden" hesaplamak olduğu için sabit hedef o fikri kökünden bozuyordu.
 *
 * ⚠️ Yön seçimi **aşağı öncelikli, sınırda yukarı**: 1'den küçük koordinat yok, o yüzden
 * `k=1` iken komşu kıta `k+1` oluyor (kullanıcının verdiği örnek birebir bu).
 */
type Axis = 'k' | 'd' | 's';
const AXIS_MAX: Record<Axis, number> = { k: 10, d: 500, s: 10 };

function neighbourOn(origin: { k: number; d: number; s: number }, axis: Axis) {
  const v = origin[axis];
  const next = v > 1 ? v - 1 : Math.min(AXIS_MAX[axis], v + 1);
  return { ...origin, [axis]: next };
}

export function TravelHelpScreen(): React.ReactElement {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);

  const origin = city.data?.coordinates;
  const mapCfg = city.data?.map;
  /** Dünya hız çarpanı — sunucu hesabıyla aynı olmalı, yoksa hızlı dünyada cetvel yanlış çıkar. */
  const speedMultiplier = city.data?.speed?.travel ?? 1;
  const myCartography = city.data?.techs['cartography'] ?? 0;

  const [target, setTarget] = useState<{ k: number; d: number; s: number } | null>(null);
  const [cart, setCart] = useState<number | null>(null);
  const cartography = cart ?? myCartography;

  /**
   * ⚠️ Hedefin varsayılanı da AKTİF ŞEHİRDEN türüyor (komşu şehir). Sabit bir varsayılan,
   * ön ayarlarla aynı hatayı sayfanın açılışında tekrar üretirdi.
   */
  const effectiveTarget = target ?? (origin ? neighbourOn(origin, 's') : null);

  const units = useMemo(() => {
    const list = (catalog.data?.units ?? [])
      .filter((u) => (UNITS_BY_ID[u.id]?.speed ?? 0) > 0)
      .map((u) => ({ id: u.id, name: u.name, speed: UNITS_BY_ID[u.id]!.speed }));
    // Kahraman katalogda "birim" değil; hızı ayrı sabit ve oyuncu onu da merak ediyor.
    return [...list, { id: 'hero', name: 'Kahraman', speed: HERO_SPEED }]
      .sort((a, b) => a.speed - b.speed);
  }, [catalog.data]);

  /**
   * ⚠️ MİSAFİR HÂLİ. Cetvel oturum ister: çıkış noktası aktif şehir. Varsayılan sabitlerle
   * çizmek cazip ama sayfanın tek vaadini (*"gördüğün süre gönderirken çıkanla aynıdır"*)
   * sessizce bozardı — harita sabitleri dünya başına ayarlanabiliyor.
   */
  if (cityId == null) {
    return (
      <div className="space-y-3">
        <BackLink />
        <Panel title="Sefer Cetveli">
          <p className="px-3 py-4 text-sm text-muted">
            Sefer süreleri <b className="text-ink">aktif şehrinden</b> hesaplanıyor. Giriş
            yaptığında bu cetvel şehrinin koordinatına ve dünyanın kendi harita ayarlarına göre
            burada çıkar.
          </p>
        </Panel>
      </div>
    );
  }
  if (!city.data || !catalog.data) return <Empty>Yükleniyor…</Empty>;
  if (!origin || !effectiveTarget) return <Empty>Şehir bilgisi alınamadı.</Empty>;

  /**
   * ⭐ KENDİ ŞEHRİNE MESAFE HESAPLANMAZ (kullanıcı): *"kendi şehrimizden kendi şehrimize olan
   * mesafeyi hesaplamak anlamsız"*. Tablo çiziliyor ama süre yerine çizgi düşüyor — satırların
   * kaybolması "bir şey bozuldu" izlenimi verirdi.
   */
  const isSelf = effectiveTarget.k === origin.k
    && effectiveTarget.d === origin.d
    && effectiveTarget.s === origin.s;

  const leg = route(origin, effectiveTarget, mapCfg);
  const seconds = (speed: number): number =>
    travelSeconds({ ...leg, speed, cartography, speedMultiplier }, mapCfg);
  const cell = (speed: number): string => (isSelf ? '—' : formatDuration(seconds(speed)));

  const presets: [string, { k: number; d: number; s: number }][] = [
    ['Komşu şehir', neighbourOn(origin, 's')],
    ['Komşu diyar', neighbourOn(origin, 'd')],
    ['Komşu kıta', neighbourOn(origin, 'k')],
  ];

  return (
    <div className="space-y-3">
      <BackLink />

      <Panel title="Sefer Cetveli" right={`${origin.k}:${origin.d}:${origin.s} →`}>
        <div className="space-y-3 px-3 py-3">
          <p className="text-xs text-muted">
            Süreler <b className="text-ink">aktif şehrinden</b> hesaplanıyor ve oyunun kendi
            formülünü kullanıyor — yani burada gördüğün süre, sefer gönderirken çıkan süreyle
            aynıdır.
          </p>

          <div>
            <div className="mb-1 text-[11px] text-muted">Hedef koordinat</div>
            <div className="flex flex-wrap items-center gap-2">
              {(['k', 'd', 's'] as Axis[]).map((axis) => (
                <label key={axis} className="flex items-center gap-1 text-xs text-muted">
                  {axis === 'k' ? 'Kıta' : axis === 'd' ? 'Diyar' : 'Şehir'}
                  <input
                    type="number" min={1} max={AXIS_MAX[axis]}
                    value={effectiveTarget[axis]}
                    onChange={(e) => {
                      const n = Math.min(
                        AXIS_MAX[axis], Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                      );
                      setTarget({ ...effectiveTarget, [axis]: n });
                    }}
                    className="tnum w-16 rounded-[var(--radius-sm)] border border-border bg-raised
                      px-1.5 py-1 text-right text-sm text-ink"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {presets.map(([label, t]) => (
                <Button key={label} size="sm" variant="ghost" onClick={() => setTarget(t)}>
                  {label}
                </Button>
              ))}
            </div>
            {isSelf ? (
              <p className="mt-2 text-[11px] text-warning">
                Hedef, bulunduğun şehrin kendisi — başka bir koordinat seç.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
              <span>Haritacılık</span>
              <b className="tnum text-ink">{cartography}</b>
              {cartography !== myCartography ? (
                <button className="text-accent underline" onClick={() => setCart(null)}>
                  seninkine dön ({myCartography})
                </button>
              ) : <span>(senin seviyen)</span>}
            </div>
            <input
              type="range" min={0} max={20} value={cartography}
              onChange={(e) => setCart(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>
      </Panel>

      <Panel title="Bu rotada birimler" right={`Haritacılık ${cartography}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase">Birim</th>
                <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase">Hız</th>
                <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase">Süre</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={u.id} className={`h-8 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                  <td className="px-2 text-ink">{u.name}</td>
                  <td className="tnum px-2 text-right text-muted">{u.speed}</td>
                  <td className="tnum px-2 text-right font-semibold text-ink">{cell(u.speed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Haritacılık ne kazandırıyor?">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase">Seviye</th>
                <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase">En yavaş birim</th>
                <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase">Kazanç</th>
              </tr>
            </thead>
            <tbody>
              {[0, 5, 10, 15, 20].map((lv, i) => {
                const slow = units[0]?.speed ?? 100;
                const base = travelSeconds(
                  { ...leg, speed: slow, cartography: 0, speedMultiplier }, mapCfg,
                );
                const now = travelSeconds(
                  { ...leg, speed: slow, cartography: lv, speedMultiplier }, mapCfg,
                );
                const gain = base > 0 ? Math.round((1 - now / base) * 100) : 0;
                return (
                  <tr key={lv} className={`h-8 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                    <td className="tnum px-2 text-ink">{lv}</td>
                    <td className="tnum px-2 text-right text-ink">{isSelf ? '—' : formatDuration(now)}</td>
                    <td className="tnum px-2 text-right text-success">
                      {isSelf ? '—' : gain > 0 ? `−%${gain}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
          ⚠️ Haritacılık yalnız <b className="text-ink">yol payını</b> kısaltır; her seferde
          bulunan sabit hazırlık süresini kısaltmaz. Bu yüzden kazanç yakın hedeflerde küçük,
          uzak hedeflerde büyüktür.
        </p>
      </Panel>
    </div>
  );
}

function BackLink(): React.ReactElement {
  return (
    <Link to="/help" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
      ← Yardım
    </Link>
  );
}
