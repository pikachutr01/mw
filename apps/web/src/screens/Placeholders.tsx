/**
 * Menüde YERİ AÇILMIŞ ama içeriği sonraki fazlara kalan ekranlar.
 *
 * Boş bırakmak yerine ne geleceğini yazıyoruz: menü yapısı orijinaliyle bugünden hizalanıyor,
 * oyuncu (ve biz) neyin eksik olduğunu ekrandan görüyoruz. `duzenleme_onerileri.txt`'teki
 * kalemler burada tek tek adlandırıldı.
 */
import { getSession, logout } from '../lib/api.ts';
import { useTheme } from '../lib/hooks.ts';
import { useCities } from '../lib/queries.ts';
import { Badge, Button, Panel } from '../components/ui.tsx';

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

/** §13.11.4 — kahramanlar şehrin tapınağında listelenir (referans `images/kahramanlar.jpeg`). */
export const TempleScreen = (): React.ReactElement => (
  <Soon title="Tapınak" lines={[
    'Şehrin kahramanları: yetenek puanları, tecrübe (mevcut / sonraki seviye)',
    'Görevde mi, şehirde mi, ölü mü',
    'Dirilt · Seviye Arttır · Özellikler · Adını Değiştir',
    'Kahramanlar seviye 0 olarak çıkar; ilk seviye için 500 tecrübe gerekir',
  ]} />
);

export const HelpScreen = (): React.ReactElement => (
  <Soon title="Yardım" lines={[
    'Oyun kuralları ve ekran açıklamaları',
    'Kaynak: teknik_ve_yapi_dokumantasyonu.md',
  ]} />
);

/** Seçenekler — hesap ve tema; mobilde "Daha Fazla" sekmesi de buraya düşer. */
export function OptionsScreen({ onLoggedOut }: { onLoggedOut: () => void }): React.ReactElement {
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
        'Şehir adı değiştirme · şehir terk etme',
        'Tatil moduna al',
        'Şifre değiştirme',
      ]} />

      <Button variant="danger" className="w-full"
        onClick={() => { void logout().then(onLoggedOut); }}>
        Oyunu Kapat
      </Button>
    </div>
  );
}
