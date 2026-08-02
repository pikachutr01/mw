/**
 * Menüde YERİ AÇILMIŞ ama içeriği sonraki fazlara kalan ekranlar.
 *
 * Boş bırakmak yerine ne geleceğini yazıyoruz: menü yapısı orijinaliyle bugünden hizalanıyor,
 * oyuncu (ve biz) neyin eksik olduğunu ekrandan görüyoruz. `duzenleme_onerileri.txt`'teki
 * kalemler burada tek tek adlandırıldı.
 */
import { logout } from '../lib/api.ts';
import { useTheme } from '../lib/hooks.ts';
import { Badge, Button, Panel } from '../components/ui.tsx';
import { AccountPanel } from '../components/AccountPanel.tsx';
import { CityAdminPanel } from '../components/CityAdminPanel.tsx';
import { DevicesPanel } from '../components/DevicesPanel.tsx';
import { NotifySettings } from '../components/NotifySettings.tsx';
import { VacationPanel } from '../components/VacationPanel.tsx';

function Soon({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Panel title={title}>
      <ul className="space-y-1 px-3 py-3 text-sm text-muted">
        {lines.map((l) => <li key={l}>• {l}</li>)}
      </ul>
      <div className="border-t border-border px-3 py-1.5">
        <Badge>yakında</Badge>
      </div>
    </Panel>
  );
}

export const HelpScreen = (): React.ReactElement => (
  <Soon title="Yardım" lines={[
    'Oyun kuralları ve ekran açıklamaları',
    'Kaynak: teknik_ve_yapi_dokumantasyonu.md',
  ]} />
);

/** Seçenekler — hesap ve tema; mobilde "Daha Fazla" sekmesi de buraya düşer. */
export function OptionsScreen({ onLoggedOut }: { onLoggedOut: () => void }): React.ReactElement {
  const [theme, setTheme] = useTheme();

  return (
    <div className="space-y-3">
      <AccountPanel />

      {/* ⭐ Orijinalde de Seçenekler menüsünün maddesi (`g.java` case 63). */}
      <CityAdminPanel />

      {/* ⭐ Aktif cihazlar HESAP panelinin hemen ardında: ikisi de "hesabım" konusu ve
          oyuncu şüphelendiğinde ikisine art arda bakıyor (cihazı çıkar → parolayı değiştir). */}
      <DevicesPanel />

      <NotifySettings />

      {/* ⭐ Orijinalde de Seçenekler menüsünde (`g.java` case 63 — tatildeyken madde
          «Tatil Modundan Çık»a dönüşüyor). Tema'dan ÖNCE: tema bir görünüm tercihi,
          tatil hesabın durumu — hesap konuları bir arada duruyor. */}
      <VacationPanel />

      <Panel title="Tema">
        <div className="flex gap-1 p-3 pb-1.5">
          {([['system', 'Sistem'], ['light', 'Gündüz'], ['dark', 'Gece']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTheme(id)}
              className={`flex-1 rounded-[var(--radius-sm)] border-2 px-2 py-1.5 text-xs ${
                theme === id
                  ? 'border-strong bg-accent text-on-accent'
                  : 'border-border bg-surface text-muted hover:bg-raised'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="px-3 pb-3 text-[11px] text-muted">
          «Sistem» seçiliyken işletim sisteminin gece moduna geçişini canlı izler.
        </div>
      </Panel>

      <Soon title="Yakında" lines={[
        'Üyelik / premium',
      ]} />

      <Button variant="danger" className="w-full"
        onClick={() => { void logout().then(onLoggedOut); }}>
        Oyunu Kapat
      </Button>
    </div>
  );
}
