/**
 * ⭐ ANA SAYFA (kullanıcı, 2026-08-02) — siteye ilk gelen ziyaretçiyi karşılar.
 *
 * ⚠️ **Metinler TASLAK.** Kullanıcı *"ben taslak yazayım, sen düzeltirsin"* dedi; buradaki
 * hikâye ve tanıtım cümleleri benim önerim, oyunun kanonik anlatısı değil. Düzeltilecekler.
 *
 * ⚠️ Türkçe metin JSX içinde satır içi: projenin **yerleşik düzeni** bu (§13.14.2 `i18n/tr.json`
 * hedefini koyuyor ama o dizin henüz yok ve her ekran metni gömüyor). Üçüncü bir desen
 * (`landing-copy.ts`) ne mevcut düzen ne hedef olurdu; tekrarlayan yapılar dosya başındaki
 * `const` dizilerinde — `Shell.tsx`teki `MENU`/`TABS` alışkanlığının aynısı.
 *
 * ⚠️ Birim adları **katalogdan** okunuyor (`UNITS_BY_ID`), elle yazılmıyor: oyunun birim adı
 * değişirse tanıtım sayfası sessizce yalan söylemesin.
 */
import { NavLink } from 'react-router-dom';
import { UNITS_BY_ID } from '@mobiwar/catalog';
import { useAuthModal } from '../components/GuestShell.tsx';
import { Button, CatalogIcon, Panel } from '../components/ui.tsx';

/** Öne çıkan dört başlık — simgeler mevcut setten, yeni sanat istemiyor. */
const FEATURES = [
  {
    art: 'menu', id: 'ordular', title: 'Ordular yolda',
    text: 'Gönderdiğin her ordu haritada gerçek zaman harcar. Saldırı da savunma da '
      + 'saat tutar; zamanlama en az asker sayısı kadar önemlidir.',
  },
  {
    art: 'buildings', id: 'castle', title: 'Şehrini büyüt',
    text: 'Çiftlik, maden, baraka, akademi… Her yapı bir sonrakinin kapısını açar. '
      + 'Kale bütçen neyi aynı anda barındırabileceğini belirler.',
  },
  {
    art: 'menu', id: 'komutamerkezi', title: 'İttifak kur',
    text: 'Tek başına ayakta kalmak zor. İttifak sohbeti, ortak savunma ve sıralamalar '
      + 'komuta merkezinde.',
  },
  {
    art: 'buildings', id: 'temple', title: 'Kahramanlar',
    text: 'Tapınağın büyüdükçe savaşta kahraman çıkma ihtimalin artar. Kahramanlar '
      + 'seviye atlar, yetenek dağıtır ve ölseler bile geri döner.',
  },
] as const;

/** Galeride gösterilen birimler — adları katalogdan gelir. */
const SHOWCASE = ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'ogre', 'shaman', 'chaos'];

export function Landing(): React.ReactElement {
  const openAuth = useAuthModal();

  return (
    <div className="space-y-4">
      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <Panel title="Mobiwar">
        <div className="space-y-4 p-5 text-center sm:p-8">
          <img src="/assets/ui/logo.png" alt="" aria-hidden width={280} height={112}
            className="icon-shadow mx-auto h-16 w-auto object-contain sm:h-24" />

          <h1 className="display text-2xl leading-tight font-semibold text-ink sm:text-4xl">
            Bir başkent kur, ordularını yönet, dünyayı paylaş.
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted sm:text-base">
            Zamanlanmış olaylar üzerine kurulu ortaçağ strateji oyunu. Sen çevrimdışıyken de
            çiftliklerin üretir, orduların yol alır, savaşların sonuçlanır.
          </p>

          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button onClick={() => openAuth('register')}>Kayıt ol</Button>
            <Button variant="ghost" onClick={() => openAuth('login')}>Giriş yap</Button>
          </div>

          {/* ⭐ Kullanıcının özellikle vurguladığı yol: üye olmadan denenebilen tek gerçek araç. */}
          <NavLink to="/simulate"
            className="inline-block text-xs text-accent underline hover:text-ink sm:text-sm">
            Üye olmadan savaş simülatörünü dene →
          </NavLink>
        </div>
      </Panel>

      {/* ── HİKÂYE ────────────────────────────────────────────────────────────── */}
      <Panel title="Hikâye">
        <div className="space-y-3 p-4 text-sm leading-relaxed text-ink sm:p-5">
          <p>
            Uzun savaşlar bitti, imparatorluk dağıldı. Geriye adı sanı unutulmuş kaleler,
            sahipsiz madenler ve kime ait olduğu belli olmayan geniş topraklar kaldı.
          </p>
          <p>
            Sen bu topraklarda küçük bir yerleşimin başındasın. Elinde bir çiftlik, bir maden
            ve avuç dolusu asker var. Komşuların da öyle — ve hepsi aynı şeyi istiyor.
          </p>
          <p className="text-muted">
            Kimi surlarının arkasına çekilip büyümeyi seçer, kimi erkenden kılıcına güvenir.
            İkisi de kazanabilir; ikisi de her şeyini kaybedebilir. Dünya ortak, saat herkes
            için aynı işliyor.
          </p>
        </div>
      </Panel>

      {/* ── ÖNE ÇIKANLAR ──────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <Panel key={f.title} title={f.title}>
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <img src={`/assets/${f.art}/${f.id}.png`} alt="" aria-hidden width={56} height={56}
                className="icon-shadow h-14 w-14 object-contain" />
              <p className="text-xs leading-relaxed text-muted">{f.text}</p>
            </div>
          </Panel>
        ))}
      </div>

      {/* ── ORDUNUN GÜCÜ ──────────────────────────────────────────────────────── */}
      <Panel title="Ordunun gücü">
        <div className="flex flex-wrap justify-center gap-4 p-4 sm:gap-6">
          {SHOWCASE.map((id) => (
            <div key={id} className="flex w-20 flex-col items-center gap-1">
              <CatalogIcon kind="units" id={id} alt="" size={56} />
              <span className="text-center text-[11px] text-muted">
                {UNITS_BY_ID[id]?.name.tr ?? id}
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted">
          Her birimin fiziksel ve büyü gücü ayrı; teknikler, sur ve gece savaşı sonucu
          baştan aşağı değiştirir.
        </p>
      </Panel>

      {/* ── SİMÜLATÖR ─────────────────────────────────────────────────────────── */}
      <Panel title="Savaş simülatörü">
        <div className="flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:text-left">
          <img src="/assets/menu/simulator.png" alt="" aria-hidden width={64} height={64}
            className="icon-shadow h-16 w-16 shrink-0 object-contain" />
          <p className="flex-1 text-sm text-muted">
            Saldırıya çıkmadan önce sonucunu gör. Simülatör oyunun <b className="text-ink">gerçek
            savaş motorunu</b> çalıştırır: birimler, teknikler, kahramanlar, sur ve gece savaşı
            dâhil. <b className="text-ink">Hesap açmadan</b> kullanabilirsin.
          </p>
          <NavLink to="/simulate" className="shrink-0">
            <Button variant="ghost">Simülatörü aç</Button>
          </NavLink>
        </div>
      </Panel>

      {/* ── KAPANIŞ ───────────────────────────────────────────────────────────── */}
      <Panel title="Başla">
        <div className="space-y-3 p-5 text-center">
          <p className="text-sm text-ink">Kayıt ücretsiz. Başkentini bir dakikada kurarsın.</p>
          <Button onClick={() => openAuth('register')}>Kayıt ol</Button>
        </div>
      </Panel>
    </div>
  );
}
