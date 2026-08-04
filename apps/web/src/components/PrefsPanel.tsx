/**
 * ⭐ TERCİHLER — oyuncunun kendi arayüz anahtarları (kullanıcı, 2026-08-04).
 *
 * ⚠️ Ekran kendini `PREFS` listesinden çiziyor. Her tercih için elle bir satır yazmadım
 * çünkü kullanıcının kendi cümlesi *"başka bu şekilde switch ile açılıp kapatılan ayarlar
 * ekleyeceğiz sonradan"* — yani bu kartın asıl işi ikinci, üçüncü tercihte belli olacak.
 * Yeni tercih eklemek artık `prefs.ts`te tek satır.
 *
 * ⚠️ **Kaydet düğmesi YOK** (kullanıcı şartı): switch'in kendisi karardır, ikinci bir onay
 * adımı sormak anlamsız olurdu. Değişiklik anında yazılıyor.
 */
import { PREFS, usePref } from '../lib/prefs.ts';
import { Panel } from './ui.tsx';

export function PrefsPanel(): React.ReactElement {
  return (
    <Panel title="Tercihler">
      <ul className="divide-y divide-border">
        {PREFS.map((p) => <PrefRow key={p.key} prefKey={p.key} label={p.label} hint={p.hint} />)}
      </ul>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Tercihler <b>bu cihazda</b> saklanır ve anında kaydedilir. Başka bir cihazda
        girdiğinde kendi tercihleri geçerli olur.
      </p>
    </Panel>
  );
}

function PrefRow({ prefKey, label, hint }: { prefKey: string; label: string; hint: string }) {
  const [on, set] = usePref(prefKey);
  return (
    <li className="px-3 py-2.5">
      {/*
        ⚠️ Sarmalayıcı `<label>`: switch'in vuruş alanı yalnız küçük anahtar değil, tüm satır.
        Mobilde 20 piksellik bir hedefe nişan almak, tercihi kullanılamaz kılardı.
      */}
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm text-ink">{label}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>
        </span>
        {/*
          ⚠️ Gerçek bir `<input type="checkbox">` görsel olarak gizlenip üstüne switch
          çiziliyor — `<div>`den switch uydurmak klavye erişimini ve ekran okuyucuyu
          kaybettirirdi. `peer` sınıfı görünümü girdinin durumuna bağlıyor.
        */}
        <span className="relative mt-0.5 shrink-0">
          <input
            type="checkbox" checked={on} onChange={(e) => set(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="block h-6 w-11 rounded-full border border-border bg-raised
              transition-colors peer-checked:border-strong peer-checked:bg-accent
              peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full
              bg-surface shadow transition-transform peer-checked:translate-x-5"
          />
        </span>
      </label>
    </li>
  );
}
