/**
 * ⭐ YARDIM — oyuncuya kuralları GÖSTEREN ekranlar (kullanıcı isteği, 2026-08-03).
 *
 * İlk bölüm **Sefer Cetveli**: *"Ulaşım sürelerini askerlere göre, haritacılık seviyesine göre
 * ayrıntılı şekilde gösterecek `harita.html` şeklinde bir sayfa oluştur."*
 *
 * ⚠️⚠️ **SABİTLER KOPYALANMADI — bu sayfanın tek gerçek riski buydu.**
 * `docs/araclar/harita.html` kendi sayı kutularını taşıyor (K, p, taban, tavan…) çünkü o bir
 * geliştirici aracı: koddan bağımsız oynayabilmek işine yarıyor. Oyun İÇİNDEKİ sayfa aynı şeyi
 * yapsaydı panelden bir sayı değiştiği anda oyuncuya **yalan söylemeye** başlardı. Bu yüzden:
 *   • hesap  → `@mobilwar/engine` (`route` · `travelSeconds` · `armySpeed`) — sunucunun aynısı,
 *   • sabitler → `/cities/:id` yanıtındaki `map` bloğu (dünya başına, panelden ayarlanabilir),
 *   • hızlar → `@mobilwar/catalog` (`units.speed`, `HERO_SPEED`).
 * Yani ekranda yazan süre, Dünya ekranındaki hedef modalının yazdığı süreyle **aynı koddan**
 * çıkıyor.
 */
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HERO_SPEED, UNITS_BY_ID } from '@mobilwar/catalog';
import { armySpeed, route, travelSeconds } from '@mobilwar/engine';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCatalog, useCity } from '../lib/queries.ts';
import { formatDuration } from '../lib/hooks.ts';
import { Button, Empty, Panel } from '../components/ui.tsx';

type Tab = 'travel';

export function HelpScreen(): React.ReactElement {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab: Tab = pathname.startsWith('/help/sefer') ? 'travel' : 'travel';

  return (
    <div className="space-y-2">
      {/* Sekme = rota (aynı desen `/command`ta): geri tuşu çalışsın, bağlantı paylaşılabilsin.
          Şimdilik tek bölüm var; ikincisi eklendiğinde bu satır olduğu gibi çalışmaya devam eder. */}
      <div className="flex gap-1">
        <button
          onClick={() => navigate('/help/sefer')}
          className="flex-1 rounded-[var(--radius-sm)] border-2 border-strong bg-accent px-2 py-1.5
            text-xs text-on-accent"
        >
          Sefer Cetveli
        </button>
      </div>
      {tab === 'travel' ? <TravelTable /> : null}
    </div>
  );
}

/* ── Sefer cetveli ──────────────────────────────────────────────────────────── */

/** Hazır rotalar — `harita.html`in ön ayarlarıyla aynı mantık, aynı sıra. */
const PRESETS: [string, { k: number; d: number; s: number }][] = [
  ['Komşu üs', { k: 1, d: 1, s: 2 }],
  ['Diyar içi uzak', { k: 1, d: 1, s: 10 }],
  ['Komşu diyar', { k: 1, d: 2, s: 1 }],
  ['10 diyar ötesi', { k: 1, d: 11, s: 1 }],
  ['Komşu kıta', { k: 2, d: 1, s: 1 }],
  ['Zıt köşe', { k: 10, d: 500, s: 10 }],
];

const CART_MAX = 20;

function TravelTable(): React.ReactElement {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);

  const origin = city.data?.coordinates;
  const mapCfg = city.data?.map;
  /** Dünya hız çarpanı — sunucu hesabıyla aynı olmalı, yoksa hızlı dünyada cetvel yanlış çıkar. */
  const speedMultiplier = city.data?.speed?.travel ?? 1;
  /** Oyuncunun GERÇEK haritacılığı — kaydırağın başlangıcı buradan geliyor. */
  const myCartography = city.data?.techs['cartography'] ?? 0;

  const [target, setTarget] = useState<{ k: number; d: number; s: number }>({ k: 1, d: 2, s: 1 });
  const [cart, setCart] = useState<number | null>(null);
  const cartography = cart ?? myCartography;

  /**
   * ⭐ Sefere çıkabilen birimler + Kahraman. Savunma birimleri hız 0 taşıyor ve
   * `armySpeed` onları `null` ile reddediyor — listeye almak "0 dk" gibi anlamsız bir satır
   * üretirdi.
   */
  const units = useMemo(() => {
    const list = (catalog.data?.units ?? [])
      .filter((u) => (UNITS_BY_ID[u.id]?.speed ?? 0) > 0)
      .map((u) => ({ id: u.id, name: u.name, speed: UNITS_BY_ID[u.id]!.speed }));
    // Kahraman katalogda "birim" değil; hızı ayrı sabit ve oyuncu onu da merak ediyor.
    return [...list, { id: 'hero', name: 'Kahraman', speed: HERO_SPEED }]
      .sort((a, b) => a.speed - b.speed);
  }, [catalog.data]);

  /**
   * ⚠️ MİSAFİR HÂLİ. `/help` oturumsuz da açılıyor (`App.tsx` misafir ağacında da kayıtlı) ve
   * o zaman aktif şehir yok → cetvelin çıkış noktası da yok.
   *
   * Varsayılan sabitlerle (dünya 1:1:1, `DEFAULT_MAP_CONFIG`) çizmek cazip ama YANLIŞ olurdu:
   * bu sayfanın tek vaadi *"burada gördüğün süre, sefer gönderirken çıkanla aynıdır"* ve
   * harita sabitleri dünya başına panelden ayarlanabiliyor. Uydurma bir çıkış noktasıyla
   * çizilen cetvel o vaadi sessizce bozardı.
   */
  if (cityId == null) {
    return (
      <Panel title="Sefer Cetveli">
        <p className="px-3 py-4 text-sm text-muted">
          Sefer süreleri <b className="text-ink">aktif şehrinden</b> hesaplanıyor. Giriş yaptığında
          bu cetvel şehrinin koordinatına ve dünyanın kendi harita ayarlarına göre burada çıkar.
        </p>
      </Panel>
    );
  }
  if (!city.data || !catalog.data) return <Empty>Yükleniyor…</Empty>;
  if (!origin) return <Empty>Şehir bilgisi alınamadı.</Empty>;

  const leg = route(origin, target, mapCfg);
  const seconds = (speed: number): number =>
    travelSeconds({ ...leg, speed, cartography, speedMultiplier }, mapCfg);

  return (
    <div className="space-y-3">
      <Panel title="Sefer Cetveli" right={`${origin.k}:${origin.d}:${origin.s} →`}>
        <div className="space-y-3 px-3 py-3">
          <p className="text-xs text-muted">
            Süreler <b className="text-ink">aktif şehrinden</b> hesaplanıyor ve oyunun kendi
            formülünü kullanıyor — yani burada gördüğün süre, sefer gönderirken çıkan süreyle
            aynıdır.
          </p>

          {/* ── Hedef ── */}
          <div>
            <div className="mb-1 text-[11px] text-muted">Hedef koordinat</div>
            <div className="flex flex-wrap items-center gap-2">
              {(['k', 'd', 's'] as const).map((axis) => (
                <label key={axis} className="flex items-center gap-1 text-xs text-muted">
                  {axis === 'k' ? 'Kıta' : axis === 'd' ? 'Diyar' : 'Üs'}
                  <input
                    type="number" min={1}
                    max={axis === 'k' ? 10 : axis === 'd' ? 500 : 10}
                    value={target[axis]}
                    onChange={(e) => {
                      const max = axis === 'k' ? 10 : axis === 'd' ? 500 : 10;
                      const n = Math.min(max, Math.max(1, Math.trunc(Number(e.target.value) || 1)));
                      setTarget({ ...target, [axis]: n });
                    }}
                    className="tnum w-16 rounded-[var(--radius-sm)] border border-border bg-raised
                      px-1.5 py-1 text-right text-sm text-ink"
                  />
                </label>
              ))}
              <span className="tnum ml-auto text-xs text-muted">
                mesafe <b className="text-ink">{Math.round(leg.distance)}</b>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {PRESETS.map(([label, t]) => (
                <Button key={label} size="sm" variant="ghost" onClick={() => setTarget(t)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* ── Haritacılık ── */}
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
              type="range" min={0} max={CART_MAX} value={cartography}
              onChange={(e) => setCart(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>
      </Panel>

      {/* ── Birim tablosu ── */}
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
                  <td className="tnum px-2 text-right font-semibold text-ink">
                    {formatDuration(seconds(u.speed))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
          Ordunun hızı <b className="text-ink">en yavaş üyesinin</b> hızıdır. Kahraman orduyu
          hızlandırmaz ama ordudan yavaşsa <b className="text-ink">yavaşlatır</b>.
        </p>
      </Panel>

      {/* ── Haritacılık cetveli ── */}
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
                    <td className="tnum px-2 text-right text-ink">{formatDuration(now)}</td>
                    <td className="tnum px-2 text-right text-success">
                      {gain > 0 ? `−%${gain}` : '—'}
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
