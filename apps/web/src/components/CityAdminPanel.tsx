/**
 * ⭐ ŞEHİR YÖNETİMİ — Seçenekler ekranının "Şehir" paneli.
 *
 * Orijinalde bu iki madde **Seçenekler** menüsünde duruyor (`DecompiledSrc/src/g.java` case 63:
 * `a[4]` = "Şehir Terk Et" → ekran 61, `a[5]` = "Şehir Adı Değiştir" → ekran 62) ve ikisi de
 * **seçili şehir** üzerinde çalışıyor (`teknik_ve_yapi_dokumantasyonu.md:934`). Menü yeri de
 * hedef seçimi de oradan alındı — biz yalnız şehri açıkça yazıyoruz ki oyuncu hangi şehirle
 * uğraştığını tahmin etmesin.
 *
 * ⚠️ Panel `AccountPanel` desenini izler: kapalı dururken tek düğme, açılınca form. Seçenekler
 * ekranı zaten uzun; her aksiyonu açık forma çevirmek sayfayı kaydırılabilir bir duvara döndürüyordu.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCities } from '../lib/queries.ts';
import { Button, ErrorBox, Field, Input, Panel } from './ui.tsx';
import { useQueryClient } from '@tanstack/react-query';

/** Sunucudaki `name-rules.ts` ile AYNI sayılar — form burada da erken uyarsın diye. */
const NAME_MIN = 3;
const NAME_MAX = 10;

export function CityAdminPanel(): React.ReactElement | null {
  const cities = useCities();
  const { cityId } = useActiveCity();
  const [open, setOpen] = useState(false);

  const list = cities.data?.cities ?? [];
  const active = list.find((c) => c.id === cityId) ?? list[0] ?? null;
  if (!active) return null;

  return (
    <Panel title="Şehir" right={`${active.coordinates.k}:${active.coordinates.d}:${active.coordinates.s}`}>
      <div className="space-y-1 p-3 text-sm">
        <div className="text-ink">
          {active.name}
          {active.isCapital ? <span className="ml-1 text-xs text-muted">(başkent)</span> : null}
        </div>
        <div className="text-xs text-muted">
          İşlem <b>seçili şehir</b> için geçerlidir; şehri üstteki şeritten değiştirebilirsin.
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Vazgeç' : 'Şehir Adı Değiştir'}
        </Button>
      </div>

      {open ? (
        <RenameCity cityId={active.id} current={active.name} onDone={() => setOpen(false)} />
      ) : null}
    </Panel>
  );
}

function RenameCity({
  cityId, current, onDone,
}: { cityId: number; current: string; onDone: () => void }): React.ReactElement {
  const qc = useQueryClient();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /* Şerit başka bir şehre geçtiyse form da o şehrin adıyla başlamalı. */
  useEffect(() => { setName(current); setError(null); }, [cityId, current]);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const tooShort = trimmed.length > 0 && trimmed.length < NAME_MIN;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/cities/${cityId}/rename`, { method: 'POST', body: { name: trimmed } });
      /**
       * ⚠️ Sunucu `city:renamed` olayını zaten yayınlıyor ve şerit ondan tazeleniyor; buradaki
       * `invalidateQueries` **WS kopukken** de formun sonucunu göstermek için. İkisi çakışmaz:
       * react-query aynı anahtarın iki tazelemesini birleştirir.
       */
      await qc.invalidateQueries({ queryKey: ['cities'] });
      await qc.invalidateQueries({ queryKey: ['city'] });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
      <Field label={`Yeni ad (${NAME_MIN}-${NAME_MAX} karakter)`}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          required
          autoFocus
        />
      </Field>
      <p className="text-[11px] text-muted">
        Türkçe karakter ve boşluk kullanabilirsin; noktalama işareti kullanılamaz.
      </p>
      {tooShort ? (
        <p className="text-xs text-danger">Ad en az {NAME_MIN} karakter olmalı.</p>
      ) : null}
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || tooShort || trimmed === '' || trimmed === current}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  );
}
