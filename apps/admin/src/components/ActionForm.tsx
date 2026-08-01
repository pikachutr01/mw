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
  const catalog = useCatalog();

  useEffect(() => { setForm({}); setNote(null); setError(null); }, [spec.id, lockedCityId]);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const body = buildBody(spec.fields, form);
      if (lockedCityId != null) body['cityId'] = lockedCityId;
      /** ⭐ Zorunlu alan kontrolü İSTEMCİDE de var: sunucuya gidip 400 beklemek gereksiz. */
      const miss = missingField(spec.fields, body);
      if (miss) { setError(new Error(`«${miss}» alanı zorunlu.`)); return; }

      await api<Record<string, unknown>>(`/api/v1/admin/actions/${spec.id}`, { method: 'POST', body });
      setNote(`${spec.label} — tamam.`);
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
      <Button disabled={busy} onClick={() => void run()}>
        {busy ? 'Çalışıyor…' : spec.label}
      </Button>
    </div>
  );
}
