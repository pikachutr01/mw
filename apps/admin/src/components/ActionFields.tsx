/**
 * ⭐ AKSİYON FORMU ALANLARI — kullanıcının en somut şikâyetinin cevabı:
 *
 * > *"Bir kullanıcıya asker eklemek için onun şehir kimliğini bulup sonra askerleri de json
 * > formatında bir de İngilizce adları ile yazarak yapmam gerekiyor."*
 *
 * Artık `{"dwarf": 500}` yazılmıyor: **Cüce** yazan bir satıra sayı giriliyor, şehir bir
 * açılır listeden seçiliyor.
 *
 * ⚠️ Seçenekler **sunucudan** (`GET /admin/catalog`, `GET /admin/players`): panelde sabit bir
 * liste tutsaydık katalog büyüdüğünde iki yer güncellenmek zorunda kalır, biri unutulunca
 * seçici sessizce eksik kalırdı. Alanın hangi listeyi kullanacağını da sunucu söylüyor
 * (`field.source`).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { num } from '../lib/format.ts';
import { Badge, Field, Input } from './ui.tsx';

export interface CatalogItem { id: string; name: string; gold?: number; food?: number; area?: number }
export interface Catalog {
  warriors: CatalogItem[]; defenses: CatalogItem[]; structures: CatalogItem[];
  buildings: (CatalogItem & { maxLevel: number })[]; techs: CatalogItem[];
}
export interface ActionField {
  key: string; label: string; type: string;
  options?: readonly string[]; optionLabels?: readonly string[];
  source?: string; placeholder?: string;
  min?: number; max?: number; required?: boolean;
  default?: string | number; minLength?: number; maxLength?: number;
}

/** Katalog süreç ömrü boyunca sabit → sonsuz `staleTime`, tek istek. */
export const useCatalog = () => useQuery({
  queryKey: ['catalog'],
  queryFn: () => api<Catalog>('/api/v1/admin/catalog'),
  staleTime: Infinity,
});

interface PlayerLite { id: number; username: string; worldId: number; cities: number }

const usePlayers = (enabled: boolean) => useQuery({
  queryKey: ['players', 'picker'],
  queryFn: () => api<{ items: PlayerLite[] }>('/api/v1/admin/players?page=0&status=all'),
  enabled,
  staleTime: 30_000,
});

const useCities = (playerId: number | null) => useQuery({
  queryKey: ['cities', 'picker', playerId],
  queryFn: () => api<{ cities: { id: number; name: string; coordinates: string }[] }>(
    `/api/v1/admin/players/${playerId}/empire`,
  ),
  enabled: playerId != null,
});

const selectClass = `w-full rounded-[var(--radius-sm)] border border-border bg-surface
  px-2 py-1 text-sm text-ink`;

/**
 * ⭐ BİRİM SEÇİCİ — satır satır, Türkçe adla.
 *
 * ⚠️ Yalnız **sıfırdan farklı** satırlar gövdeye giriyor. Hepsini göndersek `{dwarf: 0,
 * elf: 0, …}` olur ve `set` kipinde bu **21 satırı birden silmek** demektir — yönetici
 * yalnız cüce yazmak isterken tüm orduyu uçururdu.
 */
function UnitPicker({ items, value, onChange }: {
  items: CatalogItem[];
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = filter.trim()
    ? items.filter((i) => i.name.toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr')))
    : items;
  const picked = Object.entries(value).filter(([, n]) => n !== 0);

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="Birim ara…" value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[var(--radius-sm)]
        border border-border p-1">
        {shown.map((u) => (
          <label key={u.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-raised">
            <span className="flex-1 text-xs text-ink" title={u.id}>{u.name}</span>
            {u.gold != null ? (
              <span className="tnum text-[10px] text-muted">{num(u.gold)}a/{num(u.food ?? 0)}y</span>
            ) : null}
            <input
              type="number" inputMode="numeric"
              className="w-24 rounded-[var(--radius-sm)] border border-border bg-bg px-1.5 py-0.5
                text-right text-xs text-ink outline-none focus:border-accent"
              value={value[u.id] ?? ''}
              onChange={(e) => {
                const next = { ...value };
                if (e.target.value === '') delete next[u.id];
                else next[u.id] = Number(e.target.value);
                onChange(next);
              }}
            />
          </label>
        ))}
        {shown.length === 0 ? <p className="p-1 text-[11px] text-muted">Eşleşme yok.</p> : null}
      </div>
      {picked.length > 0 ? (
        <p className="text-[11px] text-muted">
          {picked.length} satır:{' '}
          {picked.map(([id, n]) => `${items.find((i) => i.id === id)?.name ?? id} ${num(n)}`).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tek alanı çizer. `value` string ya da birim haritası olabilir; dönüşümü çağıran yapmıyor,
 * `buildBody()` yapıyor — form durumu tek tipte kalsın diye.
 */
export function ActionFieldInput({ field, value, onChange, catalog, lockedCityId }: {
  field: ActionField;
  value: unknown;
  onChange: (v: unknown) => void;
  catalog: Catalog | undefined;
  /** Şehir bağlamı sabitse (İmparatorluk ekranından gelindiğinde) seçici gösterilmez. */
  lockedCityId?: number;
}) {
  const [pickerPlayer, setPickerPlayer] = useState<number | null>(null);
  const needPlayers = field.type === 'playerPicker' || (field.type === 'cityPicker' && !lockedCityId);
  const players = usePlayers(needPlayers);
  const citiesOf = useCities(field.type === 'cityPicker' && !lockedCityId ? pickerPlayer : null);

  const hint = field.min != null || field.max != null
    ? `${field.min ?? '−∞'} … ${field.max ?? '∞'}`
    : undefined;

  if (field.type === 'unitPicker') {
    const items = (catalog?.[field.source as keyof Catalog] ?? []) as CatalogItem[];
    return (
      <div className="sm:col-span-3">
        <Field label={field.label}>
          <UnitPicker
            items={items}
            value={(value as Record<string, number>) ?? {}}
            onChange={onChange}
          />
        </Field>
      </div>
    );
  }

  if (field.type === 'cityPicker' && lockedCityId) {
    // ⭐ İmparatorluk ekranından gelindiğinde şehir zaten belli — kimlik elle aranmıyor.
    return (
      <Field label={field.label}>
        <p className="rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5 text-sm text-ink">
          #{lockedCityId} <Badge tone="success">seçili</Badge>
        </p>
      </Field>
    );
  }

  if (field.type === 'cityPicker') {
    return (
      <>
        <Field label="Oyuncu">
          <select
            className={selectClass}
            value={pickerPlayer ?? ''}
            onChange={(e) => { setPickerPlayer(Number(e.target.value) || null); onChange(''); }}
          >
            <option value="">— seç —</option>
            {players.data?.items.map((p) => (
              <option key={p.id} value={p.id}>{p.username} (D{p.worldId} · {p.cities} şehir)</option>
            ))}
          </select>
        </Field>
        <Field label={field.label}>
          <select
            className={selectClass} value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— seç —</option>
            {citiesOf.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.coordinates})</option>
            ))}
          </select>
        </Field>
      </>
    );
  }

  if (field.type === 'playerPicker') {
    return (
      <Field label={field.label}>
        <select
          className={selectClass} value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— seç —</option>
          {players.data?.items.map((p) => (
            <option key={p.id} value={p.id}>{p.username} (D{p.worldId})</option>
          ))}
        </select>
      </Field>
    );
  }

  if (['buildingPicker', 'techPicker', 'structurePicker'].includes(field.type)) {
    const list = field.type === 'buildingPicker' ? catalog?.buildings
      : field.type === 'techPicker' ? catalog?.techs : catalog?.structures;
    return (
      <Field label={field.label}>
        <select
          className={selectClass} value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— seç —</option>
          {list?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
    );
  }

  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <select
          className={selectClass}
          value={String(value ?? field.default ?? field.options?.[0] ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((o, i) => (
            <option key={o} value={o}>{field.optionLabels?.[i] ?? o}</option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    // ⭐ min/max artık formda görünüyor: öncesinde sınırlar yalnız Zod'daydı ve yönetici
    // "seviye en fazla kaç" sorusunun cevabını ancak 400 alarak öğreniyordu.
    <Field label={field.label + (field.required ? ' *' : '')} hint={hint}>
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        min={field.min} max={field.max}
        maxLength={field.maxLength}
        value={String(value ?? field.default ?? '')}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** Form durumunu istek gövdesine çevirir; boş alanlar atlanır. */
export function buildBody(fields: readonly ActionField[], form: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = form[f.key] ?? f.default;
    if (raw == null || raw === '') continue;
    if (f.type === 'unitPicker') {
      // ⚠️ Sıfırlar elenir — bkz. `UnitPicker` yorumu (tüm orduyu silme tuzağı).
      const entries = Object.entries(raw as Record<string, number>).filter(([, n]) => n !== 0);
      if (entries.length === 0) continue;
      body[f.key] = Object.fromEntries(entries);
      continue;
    }
    body[f.key] = f.type === 'number' || f.type === 'cityPicker' || f.type === 'playerPicker'
      ? Number(raw)
      : String(raw).trim();
  }
  return body;
}

/** Zorunlu alan eksikse adını döndürür — sunucuya gitmeden söylenebilsin. */
export function missingField(
  fields: readonly ActionField[], body: Record<string, unknown>,
): string | null {
  const miss = fields.find((f) => f.required && body[f.key] === undefined);
  return miss ? miss.label : null;
}
