/**
 * ⭐⭐ ÜRETİM SÜRELERİ (kullanıcı, 2026-08-12).
 *
 * *"Admin paneline her askerin her baraka seviyesine göre, seçili oranlarda her seviye için ne
 * kadar sürede üretildiğini gösteren bir şey ekleyelim. Dinamik olarak kontrol edilsin."*
 *
 * ⭐ **Hesap PANELDE, ama formül panelin DEĞİL.** `trainingTimeSeconds` doğrudan
 * `@mobilwar/catalog`tan çağrılıyor — yani tablo, oyunun kullandığı fonksiyonun ta kendisi.
 * Formülü burada yeniden yazmak en cazip ve en yanlış seçenekti: iki uygulama bir gün ayrışır
 * ve panel, sunucunun ürettiğinden farklı bir sayı göstermeye başlardı.
 *
 * ⭐ **«Dinamik» şartının karşılığı:** üstteki düğmeler `draft` durumunda tutuluyor ve tablo her
 * tuş vuruşunda yeniden hesaplanıyor — **kaydetmeden**. Yönetici oranı 1,2'den 1,35'e çekince
 * Cüce'nin 1 saniyeye indiği seviyenin 27'den 17'ye kaydığını anında görüyor. Kaydetmek ayrı
 * ve bilinçli bir adım.
 *
 * ⚠️ **1 saniye SERT TABAN** ve tabloda ayrıca işaretleniyor. Formül daha da düşüyor (Baraka
 * 40'ta Cüce 0,09 sn) ama hem kuyruk (`queue.service.ts` `scaled`) hem oyun ekranı
 * (`city.controller.ts` `dur`) `Math.max(1, …)` uyguluyor. Tabanı panelin kendisi bilmiyor,
 * sunucudan `minSeconds` olarak geliyor — biri değişirse tablo sessizce yalan söylemesin.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFENSE_ORDER, LEVEL_BASED, UNITS, WARRIOR_ORDER, orderBy, trainingTimeSeconds,
  type CatalogConfig,
} from '@mobilwar/catalog';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Button, ErrorBox, Info, Panel, Select } from '../components/ui.tsx';

interface ConfigPayload {
  worldId: number;
  config: CatalogConfig;
  hash: string;
  minSeconds: number;
}

/** Panelden oynatılabilen dört sayı — tablonun tamamı bunlardan türüyor. */
const KNOBS = [
  {
    key: 'economy.timeDecayRate', label: 'Asker süre kısaltma oranı',
    min: 1, max: 3, step: 0.01,
    help: 'Baraka\'nın her seviyesi süreyi kaça böler. Büyütmek askerleri hızlandırır. '
      + '⚠️ Yapı/teknik süreleri AYRI bir orana bağlı, bu düğme onlara dokunmaz.',
  },
  {
    key: 'economy.unitTimeFactor', label: 'Birim süre katsayısı',
    min: 1, max: 10000, step: 1,
    help: 'Tüm ordu üretiminin genel katsayısı. Baraka 0\'daki süreyi doğrudan çarpar.',
  },
  {
    key: 'economy.timeExponent', label: 'Birim süre üssü',
    min: 0.1, max: 2, step: 0.01,
    help: 'Fiyatın süreye dönüşme eğrisi. 1\'den küçük olması pahalı birimi saniye başına daha '
      + 'verimli yapar; 1,0 yaparsan elit birimin zaman avantajı biter.',
  },
  {
    key: 'economy.carryTimeWeight', label: 'Taşıma ağırlığı',
    min: 0, max: 10, step: 0.1,
    help: '1 birim taşıma kapasitesi kaç kaynak sayılır. Yalnız Yük Arabası gibi taşıyıcılarda '
      + 'hissedilir.',
  },
] as const;

/** Gösterilecek Baraka seviyeleri — 0-40, ekranı boğmamak için 2 şer atlayarak da bakılabilir. */
const STEPS = [1, 2, 5] as const;

const fmt = (s: number): string => {
  if (s >= 3600) return `${Math.floor(s / 3600)}s ${Math.round((s % 3600) / 60)}d`;
  if (s >= 60) return `${Math.floor(s / 60)}d ${Math.round(s % 60)}s`;
  if (s >= 10) return `${Math.round(s)} sn`;
  return `${s.toFixed(1)} sn`;
};

export function TrainingScreen({ worldId, onNeedStepUp }: {
  worldId: number; onNeedStepUp: () => void;
}): React.ReactElement {
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  /** Kaydedilmemiş düğme değerleri. Boş = sunucudaki değer geçerli. */
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [maxLevel, setMaxLevel] = useState(40);
  const [step, setStep] = useState<number>(2);

  const q = useQuery({
    queryKey: ['catalog-config', worldId],
    queryFn: () => api<ConfigPayload>(`/api/v1/admin/settings/${worldId}/catalog-config`),
  });

  const save = useMutation({
    mutationFn: (values: Record<string, number>) =>
      api(`/api/v1/admin/settings/${worldId}`, { method: 'PUT', body: { values } }),
    onSuccess: () => {
      setDraft({});
      void qc.invalidateQueries({ queryKey: ['catalog-config', worldId] });
      void qc.invalidateQueries({ queryKey: ['settings', worldId] });
    },
    onError: (err) => { if (needsStepUp(err)) onNeedStepUp(); else setError(err); },
  });

  /** Sunucudaki ayar + kaydedilmemiş taslak = tablonun kullandığı config. */
  const effective = useMemo((): CatalogConfig | null => {
    if (!q.data) return null;
    const base = q.data.config;
    const economy = { ...base.economy };
    for (const k of KNOBS) {
      const v = draft[k.key];
      if (v != null && Number.isFinite(v)) {
        (economy as unknown as Record<string, number>)[k.key.slice('economy.'.length)] = v;
      }
    }
    return { ...base, economy };
  }, [q.data, draft]);

  const rows = useMemo(() => {
    const warriors = orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER);
    const defenses = orderBy(
      UNITS.filter((u) => u.kind === 'defense' && !LEVEL_BASED.has(u.id)), DEFENSE_ORDER,
    );
    return [...warriors, ...defenses];
  }, []);

  const levels = useMemo(() => {
    const out: number[] = [];
    for (let l = 0; l <= maxLevel; l += step) out.push(l);
    if (out[out.length - 1] !== maxLevel) out.push(maxLevel);
    return out;
  }, [maxLevel, step]);

  if (q.isPending) return <p className="text-xs text-muted">Yükleniyor…</p>;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!effective || !q.data) return <ErrorBox error={q.error} />;

  const floor = q.data.minSeconds;
  const dirty = Object.keys(draft).length > 0;

  /** Bir birimin tabana ilk çakıldığı Baraka seviyesi (yoksa null). */
  const floorLevel = (unitId: string): number | null => {
    for (let l = 0; l <= maxLevel; l++) {
      if (trainingTimeSeconds(unitId, l, 'balanced', effective) <= floor) return l;
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Süre düğmeleri"
        right={dirty ? 'kaydedilmemiş değişiklik var' : `özet ${q.data.hash}`}
      >
        <div className="space-y-2 p-3">
          <p className="text-xs text-muted">
            Değerleri değiştirdiğinde aşağıdaki tablo <strong className="text-ink">anında</strong>{' '}
            güncellenir — kaydetmeden. Kalıcı yapmak için «Kaydet»e bas.
          </p>
          {KNOBS.map((k) => {
            const server = (q.data.config.economy as unknown as Record<string, number>)[
              k.key.slice('economy.'.length)
            ] ?? 0;
            const value = draft[k.key] ?? server;
            return (
              <div key={k.key} className="flex flex-wrap items-center gap-2">
                <span className="w-56 text-xs text-ink">
                  {k.label}
                  <Info label={k.label}>{k.help}</Info>
                </span>
                <input
                  type="range" min={k.min} max={k.max} step={k.step} value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [k.key]: Number(e.target.value) }))}
                  className="h-1 w-64 accent-[var(--color-accent)]"
                />
                <input
                  type="number" min={k.min} max={k.max} step={k.step} value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [k.key]: Number(e.target.value) }))}
                  className="tnum w-24 rounded-[var(--radius-sm)] border border-border bg-bg px-1.5
                    py-0.5 text-right text-xs text-ink outline-none focus:border-accent"
                />
                {draft[k.key] != null && draft[k.key] !== server ? (
                  <span className="tnum text-xs text-muted">sunucuda: {server}</span>
                ) : null}
              </div>
            );
          })}
          <ErrorBox error={error} />
          <div className="flex items-center gap-2 pt-1">
            <Button disabled={!dirty || save.isPending} onClick={() => { setError(null); save.mutate(draft); }}>
              {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft({})}>Geri al</Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Üretim süreleri — birim × Baraka seviyesi"
        right={
          <span className="flex items-center gap-2">
            <Select className="w-28" value={maxLevel}
              onChange={(e) => setMaxLevel(Number(e.target.value))}>
              {[20, 30, 40].map((n) => <option key={n} value={n}>{`0-${n}`}</option>)}
            </Select>
            <Select className="w-28" value={step}
              onChange={(e) => setStep(Number(e.target.value))}>
              {STEPS.map((n) => <option key={n} value={n}>{`${n} adım`}</option>)}
            </Select>
          </span>
        }
      >
        <p className="border-b border-border px-3 py-2 text-xs text-muted">
          Savunma birimlerini <strong className="text-ink">Mimar Okulu</strong> hızlandırır,
          savaşçıları <strong className="text-ink">Baraka</strong> — ikisi de aynı oranı kullanır,
          o yüzden tek tablo. ⚠️ <strong className="text-warning">{floor} saniye sert tabandır</strong>:
          formül daha da düşer ama oyun orada durur. Tabana çakılan hücreler soluk gösteriliyor;
          bir birimin ilk çakıldığı seviye sağdaki sütunda.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="sticky left-0 bg-surface px-3 py-1.5 font-normal">Birim</th>
                {levels.map((l) => (
                  <th key={l} className="tnum px-2 py-1.5 text-right font-normal">{l}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-normal">1 sn ⤓</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {rows.map((u, i) => {
                const fl = floorLevel(u.id);
                return (
                  <tr key={u.id} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                    <td className={`sticky left-0 px-3 py-1 ${i % 2 === 1 ? 'bg-row-alt' : 'bg-surface'}`}>
                      {u.name.tr}
                      {u.kind === 'defense' ? <span className="ml-1 text-muted">(sav.)</span> : null}
                    </td>
                    {levels.map((l) => {
                      const raw = trainingTimeSeconds(u.id, l, 'balanced', effective);
                      const shown = Math.max(floor, raw);
                      const capped = raw <= floor;
                      return (
                        <td key={l}
                          className={`tnum px-2 py-1 text-right ${capped ? 'text-muted/60' : ''}`}
                          title={capped ? `formül: ${raw.toFixed(3)} sn — taban ${floor} sn` : undefined}>
                          {fmt(shown)}
                        </td>
                      );
                    })}
                    <td className="tnum px-2 py-1 text-right text-accent">
                      {fl == null ? '—' : fl}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
