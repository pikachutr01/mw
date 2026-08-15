/**
 * Küratörlü aksiyon formu — **paylaşılan**.
 *
 * ⚠️ Öncesinde `Database.tsx` içine gömülüydü. İmparatorluk ekranından "bu şehrin ordusunu
 * düzenle" diyebilmek için ikinci bir kopya yazmak gerekirdi ve iki form ayrışırdı; artık
 * ikisi de bunu çağırıyor, tek fark `lockedCityId`.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Button, ErrorBox } from './ui.tsx';
import {
  ActionFieldInput, buildBody, missingField, useCatalog, type ActionField,
} from './ActionFields.tsx';

export interface ActionSpec {
  id: string; label: string; description: string; fields: readonly ActionField[];
}

export function ActionForm({ spec, onDone, onNeedStepUp, lockedCityId, compact }: {
  spec: ActionSpec;
  onDone: () => void;
  onNeedStepUp: () => void;
  lockedCityId?: number;
  compact?: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * ⭐⭐ AKSİYONUN DÖNÜŞÜ (kullanıcı, 2026-08-15) — eskiden ATILIYORDU.
   *
   * ⚠️ Form yalnız *"<aksiyon> — tamam."* yazıyor ve yanıtı çöpe atıyordu. Fire-and-forget
   * aksiyonlar için yeterliydi, ama «Kod fiyat değişimi sonrası yeniden fiyatla» bir
   * ÖNİZLEME döndürüyor: hangi oyuncunun puanı kaça inecek. Kullanıcı «Uygula = hayır»
   * çalıştırdı ve hiçbir şey göremedi — çünkü tablo sunucudan geliyordu ve panel basmıyordu.
   * ⚠️ Genel çözüldü, o aksiyona özel değil: `recompute-score` (önce/sonra puan) ve
   * `move-city` (kimden kime) de aynı sessizlikten muzdaripti.
   */
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const catalog = useCatalog();

  useEffect(() => { setForm({}); setNote(null); setError(null); setResult(null); }, [spec.id, lockedCityId]);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null); setResult(null);
    try {
      const body = buildBody(spec.fields, form);
      if (lockedCityId != null) body['cityId'] = lockedCityId;
      /** ⭐ Zorunlu alan kontrolü İSTEMCİDE de var: sunucuya gidip 400 beklemek gereksiz. */
      const miss = missingField(spec.fields, body);
      if (miss) { setError(new Error(`«${miss}» alanı zorunlu.`)); return; }

      const out = await api<Record<string, unknown>>(
        `/api/v1/admin/actions/${spec.id}`, { method: 'POST', body },
      );
      setNote(`${spec.label} — tamam.`);
      /* ⚠️ `ok` tek başına bilgi taşımıyor; yalnız o varsa tablo çizilmiyor. */
      const rest = Object.fromEntries(Object.entries(out ?? {}).filter(([k]) => k !== 'ok'));
      setResult(Object.keys(rest).length > 0 ? rest : null);
      onDone();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const fields = lockedCityId != null
    ? spec.fields.filter((f) => f.key !== 'cityId')
    : spec.fields;

  return (
    <div className={compact ? 'space-y-2' : 'border-t border-border p-3'}>
      <p className="text-[11px] leading-snug text-muted">{spec.description}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {fields.map((f) => (
          <ActionFieldInput
            key={f.key} field={f} value={form[f.key]} catalog={catalog.data}
            lockedCityId={f.type === 'cityPicker' ? lockedCityId : undefined}
            onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))}
          />
        ))}
      </div>
      <ErrorBox error={error} />
      {note ? <p className="text-xs text-success">{note}</p> : null}
      {result ? <ActionResult data={result} /> : null}
      <Button disabled={busy} onClick={() => void run()}>
        {busy ? 'Çalışıyor…' : spec.label}
      </Button>
    </div>
  );
}

/**
 * Aksiyon dönüşünün okunabilir gösterimi.
 *
 * ⚠️ Ham JSON basmak yerine iki şekil tanınıyor: nesne dizisi → TABLO (yeniden fiyatlamanın
 * oyuncu listesi), diğer her şey → anahtar/değer satırı. Ham JSON, operatörün 30 satırlık
 * bir çıktıda aradığını bulmasını zorlaştırırdı — bu ekranın tamamı zaten "ham SQL yerine
 * adı konmuş aksiyon" fikrinin üzerine kurulu.
 */
function ActionResult({ data }: { data: Record<string, unknown> }): React.ReactElement {
  const rows = Object.entries(data);
  /** `toplamTabanDegisimi` → `toplam taban degisimi`. Sunucu anahtarını değiştirmeden okunur kılar. */
  const label = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
    if (typeof v === 'number') return v.toLocaleString('tr-TR');
    return String(v);
  };

  return (
    <div className="space-y-2 rounded-[var(--radius-sm)] border border-border bg-raised p-2">
      {rows.map(([key, value]) => {
        const list = Array.isArray(value) && value.length > 0
          && typeof value[0] === 'object' && value[0] !== null
          ? (value as Record<string, unknown>[])
          : null;

        if (list) {
          const cols = Object.keys(list[0]!);
          return (
            <div key={key}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">{label(key)}</div>
              {/* ⚠️ Kendi `overflow-x` sarmalayıcısı: sütun sayısı aksiyona göre değişiyor
                  ve panel dar kolonda da açılabiliyor. */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-muted">
                      {cols.map((c) => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {cols.map((c) => (
                          <td key={c} className="whitespace-nowrap px-2 py-1 tabular-nums">{cell(r[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        return (
          <div key={key} className="flex justify-between gap-3 text-[11px]">
            <span className="text-muted">{label(key)}</span>
            <span className="tabular-nums text-ink">
              {Array.isArray(value) ? value.map(cell).join(', ') || '—' : cell(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
