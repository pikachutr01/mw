/**
 * ⭐ «UYGULAMAYI İNDİR» — PWA kurulum düğmesi (kullanıcı, 2026-08-02).
 *
 * Mağaza uygulaması DEĞİL: tarayıcının kendi kurulum akışını tetikler. Oyun zaten kurulabilir
 * bir PWA'ydı, davet eksikti (ayrıntı ve tuzaklar `lib/pwa.ts` başlığında).
 *
 * ⚠️ **Zaten uygulama penceresindeysek düğme HİÇ çizilmez** (kullanıcı şartı). Kurulu bir
 * uygulamanın içinde "uygulamayı indir" yazan bir satır, oyuncuyu ikinci kez kurmaya
 * çalıştırmaktan başka bir işe yaramaz.
 *
 * ⚠️ Düğme **yalnız oyun içinde** (kullanıcı kararı): misafir kabuğunda yok. Henüz hesabı
 * olmayan birine kurulum teklif etmek, kayıt akışının önüne ikinci bir karar koyuyordu.
 */
import { useState } from 'react';
import { Modal } from './Modal.tsx';
import { Button, MenuIcon } from './ui.tsx';
import { promptInstall, useInstallState } from '../lib/pwa.ts';

/**
 * `side` → masaüstü sol menü («Oyunu Kapat» ile aynı geometri).
 * `sheet` → mobil «Daha» açılır listesi (liste satırlarıyla aynı geometri).
 */
export function InstallButton({ variant, onDone }: {
  variant: 'side' | 'sheet';
  /**
   * Etkileşim BİTİNCE çağrılır — mobil «Daha» listesi kendini o zaman kapatır.
   *
   * ⚠️ **Tıklama anında kapatılamaz.** Liste kapanınca bu bileşen sökülüyor, iOS yönerge
   * modalı da onunla birlikte kayboluyordu: kutu bir kare görünüp yok oluyordu. Bu yüzden
   * iOS yolunda liste modal KAPANANA kadar açık kalır (modal `z-40`, liste `z-30` — üstte).
   */
  onDone?: () => void;
}): React.ReactElement | null {
  const state = useInstallState();
  const [showIos, setShowIos] = useState(false);

  // 'installed' → kurulu · 'unavailable' → tarayıcı kuramıyor. İkisinde de davet yok.
  if (state !== 'installable' && state !== 'ios') return null;

  const click = (): void => {
    if (state === 'ios') { setShowIos(true); return; }
    // Tarayıcının kendi diyaloğu açılıyor; listenin arkada durmasına gerek yok.
    onDone?.();
    void promptInstall();
  };

  const cls = variant === 'side'
    ? `mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-transparent
       px-2.5 py-1.5 text-[13px] text-accent transition-colors hover:border-accent hover:bg-raised`
    : `flex w-full items-center gap-2 border-b border-on-panel-header/15 px-3 py-2.5
       text-left text-[13px] text-on-panel-header hover:bg-raised/40`;

  return (
    <>
      <button type="button" onClick={click} className={cls}>
        <MenuIcon id="indir" size={variant === 'side' ? 26 : 20} />
        <span className="flex-1 text-left">Uygulamayı İndir</span>
      </button>

      {showIos ? (
        <IosInstructions onClose={() => { setShowIos(false); onDone?.(); }} />
      ) : null}
    </>
  );
}

/**
 * iOS'ta kurulum programla tetiklenemez — Safari'de `beforeinstallprompt` yok. Tek yol
 * Paylaş menüsü, o yüzden burada adımlar anlatılıyor.
 *
 * ⚠️ **Safari şart.** iOS'ta üçüncü taraf tarayıcılar aynı motoru kullansa da «Ana Ekrana
 * Ekle» maddesi güvenilir biçimde yalnız Safari'nin paylaş menüsünde duruyor.
 */
function IosInstructions({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <Modal title="Ana Ekrana Ekle" width="sm" onClose={onClose}
      footer={<Button onClick={onClose}>Anladım</Button>}>
      <div className="space-y-3 p-3 text-sm">
        <p className="text-muted">
          iPhone ve iPad'de kurulum tarayıcı tarafından başlatılamıyor; birkaç dokunuşla
          sen ekliyorsun. Sonuç aynı: oyun kendi simgesiyle ana ekranda, adres çubuğu olmadan
          tam ekran açılır.
        </p>
        <ol className="space-y-2">
          {[
            ['Safari ile aç.', 'Diğer tarayıcıların paylaş menüsünde bu madde çıkmayabilir.'],
            ['Alttaki Paylaş düğmesine dokun.', 'Yukarı ok çıkan kare simge.'],
            ['Listeyi kaydır, «Ana Ekrana Ekle»yi seç.', null],
            ['Sağ üstten «Ekle»ye dokun.', null],
          ].map(([title, hint], i) => (
            <li key={i} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                bg-accent text-[11px] font-semibold text-on-accent">{i + 1}</span>
              <span>
                {title}
                {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        {/* ⭐ Sebebi söylemek gerek: iOS'ta push, kurulumun ARDINDAN çalışıyor (`push.ts`).
            Bunu bilmeyen oyuncu bildirimleri açamayınca hata sanıyor. */}
        <p className="rounded-[var(--radius-sm)] border border-border bg-raised p-2 text-xs text-muted">
          iPhone'da <strong>bildirimler ancak kurulumdan sonra</strong> çalışır. Safari
          sekmesinde kalırsan saldırı ve üretim bildirimleri hiç gelmez.
        </p>
      </div>
    </Modal>
  );
}
