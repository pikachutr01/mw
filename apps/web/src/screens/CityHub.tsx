/**
 * MOBİL "Şehir" sekmesi — masaüstünde sol menüde ayrı maddeler olan şehir ekranlarının hub'ı.
 *
 * Alt bar 11 madde taşıyamaz; masaüstündeki menü sırası burada korunuyor ki oyuncu iki düzen
 * arasında geçerken aynı sırayı bulsun.
 */
import { Link } from 'react-router-dom';
import { fmt } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCity } from '../lib/queries.ts';
import { Panel, Res } from '../components/ui.tsx';
import { ActivityDot, cityActivity } from '../components/Shell.tsx';

const ITEMS = [
  { to: '/barracks', label: 'Baraka', icon: 'barracks', hint: 'Savaşçı üret' },
  { to: '/buildings', label: 'Yapılar', icon: 'castle', hint: 'Bina yükselt' },
  { to: '/defense', label: 'Savunma', icon: 'architect_school', hint: 'Sur ve savunma birimleri' },
  { to: '/academy', label: 'Akademi', icon: 'academy', hint: 'Teknik araştır' },
  { to: '/temple', label: 'Tapınak', icon: 'temple', hint: 'Kahramanlar' },
] as const;

export function CityHub() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const d = city.data;
  // ⭐ Masaüstü sol menüyle AYNI aktivite noktaları (kullanıcı, 2026-07-30) — şehir bazlı.
  const activity = cityActivity(d, cityId);

  return (
    <div className="space-y-3">
      <Panel title={d ? `${d.name}${d.isCapital ? ' · Başkent' : ''}` : 'Şehir'}
        right={d ? `${d.coordinates.k}:${d.coordinates.d}:${d.coordinates.s}` : undefined}>
        <div className="flex items-center gap-4 px-3 py-2 text-sm">
          <Res kind="gold" value={fmt(d?.resources.gold ?? 0)} />
          <Res kind="food" value={fmt(d?.resources.food ?? 0)} />
        </div>
      </Panel>

      <Panel title="Şehir ekranları">
        <ul className="divide-y divide-border">
          {ITEMS.map((it, i) => (
            <li key={it.to} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
              <Link to={it.to} className="flex items-center gap-3 px-3 py-2.5 hover:bg-raised">
                <img src={`/assets/buildings/${it.icon}.png`} alt="" width={32} height={32}
                  className="h-8 w-8 shrink-0 object-contain" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {it.label}
                    {activity[it.to] ? <ActivityDot /> : null}
                  </span>
                  <span className="block text-[11px] text-muted">{it.hint}</span>
                </span>
                <span aria-hidden className="text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
