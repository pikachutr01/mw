/**
 * DAHA FAZLA — az kullanılan sayfaların evi (§10).
 *
 * Faz 2'de yalnız hesap/tema/oyuncu bilgisi var. Kahramanlar · İttifak · Sıralamalar ·
 * Simülatör · Arama · Üyelik sonraki fazlarda buraya eklenecek; yer tutucular niyeti gösteriyor.
 */
import { getSession, logout } from '../lib/api.ts';
import { useTheme } from '../lib/hooks.ts';
import { useCities } from '../lib/queries.ts';
import { Badge, Button, Panel } from '../components/ui.tsx';

const SOON = [
  ['Kahramanlar', 'Dirilt · Seviye Arttır · Özellikler'],
  ['İttifak', 'Kurmak için Kale ≥ 5'],
  ['Sıralamalar', 'Oyuncu · İttifak · Kahraman'],
  ['Simülatör', 'Savaşı denemeden önce hesapla'],
  ['Üyelik', 'Premium'],
] as const;

export function More({ onLoggedOut }: { onLoggedOut: () => void }) {
  const session = getSession();
  const cities = useCities();
  const [theme, setTheme] = useTheme();

  return (
    <div className="space-y-3">
      <Panel title="Hesap">
        <div className="space-y-1 p-3 text-sm">
          <div className="text-ink">{session?.username}</div>
          <div className="text-xs text-muted">
            Dünya {session?.worldId} · {cities.data?.cities.length ?? 0} şehir
          </div>
        </div>
      </Panel>

      <Panel title="Tema">
        <div className="flex gap-1 p-3 pb-1.5">
          {([['system', 'Sistem'], ['light', 'Gündüz'], ['dark', 'Gece']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTheme(id)}
              className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs ${
                theme === id ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="px-3 pb-3 text-[11px] text-muted">
          «Sistem» seçiliyken işletim sisteminin gece moduna geçişini canlı izler.
        </div>
      </Panel>

      <Panel title="Yakında">
        <ul className="divide-y divide-border">
          {SOON.map(([title, hint]) => (
            <li key={title} className="flex items-center justify-between gap-2 px-3 py-2">
              <div>
                <div className="text-sm text-muted">{title}</div>
                <div className="text-[11px] text-muted">{hint}</div>
              </div>
              <Badge>yakında</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Button variant="danger" className="w-full"
        onClick={() => { void logout().then(onLoggedOut); }}>
        Çıkış yap
      </Button>
    </div>
  );
}
