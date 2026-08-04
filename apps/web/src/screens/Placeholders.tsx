/**
 * Menüde YERİ AÇILMIŞ ama içeriği sonraki fazlara kalan ekranlar.
 *
 * Boş bırakmak yerine ne geleceğini yazıyoruz: menü yapısı orijinaliyle bugünden hizalanıyor,
 * oyuncu (ve biz) neyin eksik olduğunu ekrandan görüyoruz. `duzenleme_onerileri.txt`'teki
 * kalemler burada tek tek adlandırıldı.
 */
import { Badge, Panel } from '../components/ui.tsx';
import { AccountPanel } from '../components/AccountPanel.tsx';
import { CityAdminPanel } from '../components/CityAdminPanel.tsx';
import { DevicesPanel } from '../components/DevicesPanel.tsx';
import { NotifySettings } from '../components/NotifySettings.tsx';
import { PrefsPanel } from '../components/PrefsPanel.tsx';
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

/*
 * ⚠️ `HelpScreen` buradan 2026-08-03'te ÇIKTI — artık gerçek bir ekran (`screens/Help.tsx`),
 * "yakında" kartı değil.
 */

/**
 * Seçenekler — hesap, cihazlar, bildirimler, şehir ve tatil; mobilde "Daha Fazla" da buraya düşer.
 *
 * ⭐ DÜZEN 2026-08-02'de derlendi (kullanıcı). Öncesinde her şey tek sütunda alt alta
 * uzuyordu; masaüstünde yarısı boş kalıyordu. Şimdi:
 *   - **Hesap** tam genişlikte üstte — tema seçici artık onun başlık bandında (kendi kartı
 *     kaldırıldı: tek seferlik bir tercih tam bir kart kadar yer hak etmiyor).
 *   - Kalan dört kart masaüstünde **iki sütun**, mobilde tek sütun. Sıra konu bazlı:
 *     üstte cihazla ilgili ikisi (bildirim + oturumlar), altta dünyayla ilgili ikisi
 *     (şehir + tatil).
 *   - «Oyunu Kapat» kaldırıldı: çıkış zaten sol menüde ve mobilde «Daha» listesinde var,
 *     bu ÜÇÜNCÜ kopyaydı.
 *
 * ⚠️ `lg:items-start`: grid hücreleri varsayılan olarak satırın en uzun kartı kadar
 * gerilir; kısa kart altında koca bir boşlukla dururdu.
 */
export function OptionsScreen(): React.ReactElement {
  return (
    <div className="space-y-3">
      <AccountPanel />

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <NotifySettings />
        <DevicesPanel />
        {/* ⭐ İkisi de orijinalde Seçenekler menüsünün maddesiydi (`g.java` case 63 —
            tatildeyken madde «Tatil Modundan Çık»a dönüşüyor). */}
        <CityAdminPanel />
        <VacationPanel />
        {/* ⭐ Tercihler (kullanıcı, 2026-08-04) — cihaza özel arayüz anahtarları. Bilerek
            EN ALTTA: hesap/güvenlik kartlarının önüne geçmemeli, ama «yakında» kartının
            üstünde çünkü artık gerçek bir işlevi var. */}
        <PrefsPanel />
      </div>

      <Soon title="Yakında" lines={[
        'Üyelik / premium',
      ]} />
    </div>
  );
}
