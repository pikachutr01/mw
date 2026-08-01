/**
 * ⭐ TOPLU İŞLEMLER — *"Tüm hesaplara toplu asker ekleme veya silme, savunma ünitesi ekleme
 * silme, sur büyü kalkan seviyesi, akademi tekniği düzenleme."*
 *
 * Ekran **üç adımlı** ve sıra bilinçli:
 *   1. **Kimler** — filtre (dünya · ittifak · puan · aktiflik) + listeden tek tek çıkarma
 *   2. **Ne** — işlem ve alanları (birim seçici katalogdan, Türkçe adlarla)
 *   3. **Kuru koşu → onay** — kaç oyuncu, kaç şehir, örnek isimler; sonra ayrı bir kırmızı düğme
 *
 * ⚠️ Kuru koşu **atlanamıyor**: "Uygula" düğmesi ancak önizleme alındıktan sonra beliriyor.
 * Geri alınamaz bir işlemde tek tıkla çalıştırmak, Faz 7'de öğrenilen dersin tekrarı olurdu.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { num } from '../lib/format.ts';
import { Badge, Button, ErrorBox, Field, Input, Panel } from '../components/ui.tsx';
import {
  ActionFieldInput, buildBody, missingField, useCatalog, type ActionField,
} from '../components/ActionFields.tsx';

interface BulkOp {
  id: string; label: string; description: string; scope: 'city' | 'player';
  fields: readonly ActionField[];
}
interface Preview {
  op: string; players: number; cities: number;
  sample: { id: number; username: string; cities: number }[];
  truncatedSample: boolean;
  ran: boolean; changed: number;
}

export function BulkScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [opId, setOpId] = useState<string>('units');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [worldId, setWorldId] = useState('1');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const [exclude, setExclude] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const catalog = useCatalog();
  const ops = useQuery({
    queryKey: ['bulk-ops'],
    queryFn: () => api<{ ops: BulkOp[] }>('/api/v1/admin/bulk-ops'),
    staleTime: Infinity,
  });
  const op = ops.data?.ops.find((o) => o.id === opId);

  const target = (): Record<string, unknown> => ({
    worldId: Number(worldId) || 0,
    ...(scoreMin.trim() ? { scoreMin: Number(scoreMin) } : {}),
    ...(scoreMax.trim() ? { scoreMax: Number(scoreMax) } : {}),
    ...(activeDays.trim() ? { activeSinceDays: Number(activeDays) } : {}),
    exclude,
  });

  const call = useMutation({
    mutationFn: (confirm: boolean) => {
      const body = buildBody(op!.fields, form);
      const miss = missingField(op!.fields, body);
      if (miss) throw new Error(`«${miss}» alanı zorunlu.`);
      return api<Preview>(`/api/v1/admin/bulk/${opId}`, {
        method: 'POST', body: { ...body, target: target(), confirm },
      });
    },
    onSuccess: (r) => {
      setError(null);
      setPreview(r);
      setNote(r.ran
        ? `Uygulandı — ${num(r.players)} oyuncu, ${num(r.cities)} şehir, ${num(r.changed)} satır.`
        : null);
    },
    onError: (err) => {
      setNote(null); setPreview(null);
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    },
  });

  /** Filtre ya da işlem değişince önizleme **geçersiz** — eski sayıyla onaylanmasın. */
  const invalidate = (): void => { setPreview(null); setNote(null); };

  return (
    <div className="space-y-3">
      <Panel title="1 · Kimlere" right="filtre + listeden çıkarma">
        <div className="grid gap-2 p-3 sm:grid-cols-4">
          <Field label="Dünya">
            <Input type="number" value={worldId}
              onChange={(e) => { setWorldId(e.target.value); invalidate(); }} />
          </Field>
          <Field label="En az puan" hint="boş = sınırsız">
            <Input type="number" value={scoreMin}
              onChange={(e) => { setScoreMin(e.target.value); invalidate(); }} />
          </Field>
          <Field label="En çok puan" hint="boş = sınırsız">
            <Input type="number" value={scoreMax}
              onChange={(e) => { setScoreMax(e.target.value); invalidate(); }} />
          </Field>
          <Field label="Son N günde görülmüş" hint="boş = hepsi">
            <Input type="number" value={activeDays}
              onChange={(e) => { setActiveDays(e.target.value); invalidate(); }} />
          </Field>
        </div>
        {exclude.length > 0 ? (
          <p className="border-t border-border px-3 py-2 text-[11px] text-warning">
            {exclude.length} oyuncu muaf tutuldu.{' '}
            <button type="button" className="underline"
              onClick={() => { setExclude([]); invalidate(); }}>hepsini geri al</button>
          </p>
        ) : null}
      </Panel>

      <Panel title="2 · Ne yapılacak">
        <div className="flex flex-wrap gap-1 p-3">
          {ops.data?.ops.map((o) => (
            <button
              key={o.id} type="button"
              onClick={() => { setOpId(o.id); setForm({}); invalidate(); }}
              className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] ${
                opId === o.id
                  ? 'border-strong bg-accent text-on-accent'
                  : 'border-border bg-surface text-muted hover:bg-raised'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {op ? (
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-[11px] leading-snug text-muted">
              {op.description}
              {' '}
              <Badge>{op.scope === 'city' ? 'her şehre' : 'her oyuncuya'}</Badge>
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {op.fields.map((f) => (
                <ActionFieldInput
                  key={f.key} field={f} value={form[f.key]} catalog={catalog.data}
                  onChange={(v) => { setForm((s) => ({ ...s, [f.key]: v })); invalidate(); }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title="3 · Önce göster, sonra uygula" right="kuru koşu atlanamaz">
        <div className="space-y-2 p-3">
          <ErrorBox error={error} />
          {note ? <p className="text-xs text-success">{note}</p> : null}

          <Button
            variant="ghost" disabled={call.isPending || !op}
            onClick={() => call.mutate(false)}
          >
            {call.isPending ? 'hesaplanıyor…' : 'Kimler etkilenecek? (hiçbir şey değişmez)'}
          </Button>

          {preview && !preview.ran ? (
            <div className="space-y-2 rounded-[var(--radius-sm)] border border-warning
              bg-warning/10 p-2">
              <p className="text-xs text-ink">
                <b>{num(preview.players)}</b> oyuncu · <b>{num(preview.cities)}</b> şehir
                etkilenecek.
              </p>
              <ul className="flex flex-wrap gap-1">
                {preview.sample.map((s) => (
                  <li key={s.id}>
                    {/* Tek tık muafiyet: "herkese ver ama şuna verme" filtreyle ifade edilemez. */}
                    <button
                      type="button"
                      onClick={() => { setExclude((x) => [...x, s.id]); invalidate(); }}
                      className="rounded-[var(--radius-sm)] border border-border bg-bg px-1.5
                        py-0.5 text-[11px] text-ink hover:border-danger hover:text-danger"
                      title="listeden çıkar"
                    >
                      {s.username} <span className="text-muted">×</span>
                    </button>
                  </li>
                ))}
              </ul>
              {preview.truncatedSample ? (
                <p className="text-[11px] text-muted">…ve dahası (ilk 20 gösteriliyor).</p>
              ) : null}
              <Button
                variant="danger" disabled={call.isPending || preview.players === 0}
                onClick={() => call.mutate(true)}
              >
                {call.isPending
                  ? 'uygulanıyor…'
                  : `${num(preview.players)} oyuncuya UYGULA — geri alınamaz`}
              </Button>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
