/**
 * ⭐ AYARLAR EKRANI (Faz 1) — form **şemadan üretilir**, elle yazılmaz.
 *
 * Alanların adı, tipi, aralığı, açıklaması ve etiketi sunucudan (`@mobiwar/settings`) geliyor.
 * Panelde elle bir form yazsaydık yeni bir ayar eklendiğinde iki yeri güncellemek gerekirdi ve
 * biri unutulduğunda ayar ya görünmez ya da sunucunun reddettiği bir alan olurdu.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SettingDef, SettingGroup } from '@mobiwar/settings';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Badge, Button, ErrorBox, Input, Panel } from '../components/ui.tsx';

interface Payload {
  worldId: number;
  groups: SettingGroup[];
  defs: SettingDef[];
  values: Record<string, number | boolean>;
  overridden: string[];
  hash: string;
}

/** ⭐ Etiketler: hangi sayının ölçüm, hangisinin denge düğmesi olduğu (kısıt 1). */
const TAG_BADGE: Record<string, { tone: 'muted' | 'success' | 'warning' | 'danger'; text: string }> = {
  measured: { tone: 'warning', text: 'ölçüldü' },
  design: { tone: 'muted', text: 'tasarım' },
  locked: { tone: 'danger', text: 'kilitli' },
};

export function SettingsScreen({ worldId, onNeedStepUp }: {
  worldId: number; onNeedStepUp: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, number | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const r = await api<Payload>(`/api/v1/admin/settings/${worldId}`);
      setData(r);
      setDraft(r.values);
    } catch (err) {
      setError(err);
    }
  }, [worldId]);

  useEffect(() => { void load(); }, [load]);

  const changed = useMemo(
    () => (data ? Object.keys(draft).filter((k) => draft[k] !== data.values[k]) : []),
    [draft, data],
  );

  const save = async (): Promise<void> => {
    if (!data || changed.length === 0) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const values = Object.fromEntries(changed.map((k) => [k, draft[k]]));
      await api(`/api/v1/admin/settings/${worldId}`, { method: 'PUT', body: { values } });
      setNote(`${changed.length} ayar kaydedildi. Tüm süreçlerde hemen etkin.`);
      await load();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (keys: string[]): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      await api(`/api/v1/admin/settings/${worldId}/reset`, { method: 'POST', body: { keys } });
      setNote('Varsayılana döndürüldü.');
      await load();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <p className="text-sm text-muted">Yükleniyor…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)]
        border border-border bg-surface px-3 py-2">
        <span className="text-xs text-muted">
          Dünya {worldId} · özet <span className="tnum">{data.hash}</span>
          {' · '}{data.overridden.length} ayar varsayılandan farklı
        </span>
        <div className="flex gap-2">
          {changed.length > 0 ? (
            <Button variant="ghost" onClick={() => setDraft(data.values)}>Geri al</Button>
          ) : null}
          <Button disabled={busy || changed.length === 0} onClick={() => void save()}>
            {busy ? 'Kaydediliyor…' : `Kaydet${changed.length > 0 ? ` (${changed.length})` : ''}`}
          </Button>
        </div>
      </div>

      {note ? <p className="text-xs text-success">{note}</p> : null}
      <ErrorBox error={error} />

      {data.groups.map((group) => {
        const defs = data.defs.filter((d) => d.key.startsWith(`${group.id}.`));
        if (defs.length === 0) return null;
        const groupOverridden = defs.filter((d) => data.overridden.includes(d.key)).map((d) => d.key);
        return (
          <Panel
            key={group.id}
            title={group.label}
            right={groupOverridden.length > 0 ? (
              <button type="button" className="underline"
                onClick={() => void reset(groupOverridden)}>
                {groupOverridden.length} değişik — varsayılana dön
              </button>
            ) : null}
          >
            <p className="border-b border-border px-3 py-2 text-xs text-muted">
              {group.description}
            </p>
            <ul className="divide-y divide-border">
              {defs.map((def) => (
                <SettingRow
                  key={def.key}
                  def={def}
                  value={draft[def.key] ?? (def.default as number | boolean)}
                  isOverridden={data.overridden.includes(def.key)}
                  isDirty={draft[def.key] !== data.values[def.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [def.key]: v }))}
                />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function SettingRow({ def, value, isOverridden, isDirty, onChange }: {
  def: SettingDef;
  value: number | boolean;
  isOverridden: boolean;
  isDirty: boolean;
  onChange: (v: number | boolean) => void;
}) {
  const badge = TAG_BADGE[def.tag]!;
  const locked = def.tag === 'locked';

  return (
    <li className={`px-3 py-2.5 ${isDirty ? 'bg-accent/10' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink">{def.label}</span>
            <Badge tone={badge.tone}>{badge.text}</Badge>
            {isOverridden ? <Badge tone="success">değiştirilmiş</Badge> : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{def.description}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            {def.key}
            {def.min != null ? ` · ${def.min}–${def.max ?? '∞'}` : ''}
            {def.env ? ` · env: ${def.env}` : ''}
          </p>
        </div>
        <div className="flex w-40 shrink-0 items-center gap-1.5">
          {def.type === 'boolean' ? (
            <input type="checkbox" checked={Boolean(value)} disabled={locked}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--mw-color-accent)]" />
          ) : (
            <Input
              type="number" disabled={locked}
              min={def.min} max={def.max} step={def.type === 'int' ? 1 : 'any'}
              value={String(value)}
              onChange={(e) => onChange(Number(e.target.value))}
              className="tnum text-right"
            />
          )}
          {def.unit ? <span className="text-[11px] text-muted">{def.unit}</span> : null}
        </div>
      </div>
      {/* ⚠️ Ölçülmüş değerde uyarı: değiştirmek oyunu orijinalden uzaklaştırır (kısıt 1). */}
      {def.tag === 'measured' && isDirty ? (
        <p className="mt-1.5 text-[11px] text-warning">
          ⚠️ Bu sayı binary'den ölçüldü. Değiştirirsen oyun orijinalden sapar ve motor testleri
          bu değere sabitlenmiştir.
        </p>
      ) : null}
    </li>
  );
}
