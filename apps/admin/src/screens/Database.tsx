/**
 * ⭐ VERİ TABANI EKRANI (Faz 7) — tarayıcı + küratörlü aksiyonlar + ham kip.
 *
 * ⚠️ **Ham kip VARSAYILAN OLARAK KAPALI** ve açıldığında kırmızı şerit çıkıyor (kullanıcı
 * kararı). Sebebi ekranda da yazıyor: bu tabloların bir kısmında elle yazmak **sessizce
 * yanlış** — `cities.gold` yazılır, tutmaz; `players.score` yazılır, ilk puan hareketinde
 * silinir. Doğru yol küratörlü aksiyon.
 *
 * ⚠️ Tablo listesi, kolonlar, filtreler ve uyarılar **sunucudan** geliyor (`db-registry.ts`).
 * Panelde elle bir liste tutsaydık yeni bir tablo eklendiğinde iki yer güncellenmek zorunda
 * kalır ve biri unutulduğunda ekran ya boş ya yanlış olurdu.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import {
  Badge, Button, DataTable, ErrorBox, Field, Info, Input, Pagination, Panel, SearchInput,
} from '../components/ui.tsx';
import { ActionForm, type ActionSpec } from '../components/ActionForm.tsx';

interface TableInfo {
  name: string; label: string; policy: 'readonly' | 'edit' | 'action';
  columns: string[]; editable: string[]; filters: string[]; warning: string | null;
}
interface RowsPayload {
  table: string; label: string; policy: TableInfo['policy'];
  columns: string[]; editable: string[]; filters: string[]; warning: string | null;
  page: number; pageSize: number; total: number;
  rows: Record<string, unknown>[];
}

const POLICY: Record<string, { tone: 'muted' | 'danger' | 'warning'; text: string }> = {
  readonly: { tone: 'muted', text: 'salt-okunur' },
  edit: { tone: 'warning', text: 'ham düzenlenebilir' },
  action: { tone: 'danger', text: 'yalnız aksiyon' },
};

const cell = (v: unknown): string => {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  const s = String(v);
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
};

export function DatabaseScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [meta, setMeta] = useState<{ tables: TableInfo[]; actions: ActionSpec[] } | null>(null);
  const [table, setTable] = useState<string>('cities');
  const [data, setData] = useState<RowsPayload | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [rawMode, setRawMode] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<{ tables: TableInfo[]; actions: ActionSpec[] }>('/api/v1/admin/db/tables')
      .then(setMeta).catch(setError);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const qs = new URLSearchParams({ page: String(page) });
    for (const [k, v] of Object.entries(filters)) if (v.trim()) qs.set(k, v.trim());
    try {
      setData(await api<RowsPayload>(`/api/v1/admin/db/tables/${table}?${qs}`));
    } catch (err) {
      setError(err);
    }
  }, [table, page, filters]);

  useEffect(() => { void load(); }, [load]);

  if (!meta) return <ErrorBox error={error} />;

  return (
    <div className="space-y-3">
      {/* ⚠️ Ham kip şeridi: açıkken ekranın tepesinde ve kırmızı. */}
      {rawMode ? (
        <div className="rounded-[var(--radius-sm)] border-2 border-strong bg-danger px-3 py-2
          text-[13px] font-semibold text-on-accent">
          ⚠️ HAM DÜZENLEME AÇIK — doğrulama yok, oyun kuralları uygulanmaz. Her yazma
          `audit_log`a eski hâliyle birlikte kaydedilir.
        </div>
      ) : null}

      <Panel title="Tablolar" right={
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--mw-color-accent)]" />
          ham kip
        </label>
      }>
        <div className="flex flex-wrap gap-1 p-3">
          {meta.tables.map((t) => (
            <button key={t.name} type="button"
              onClick={() => { setTable(t.name); setFilters({}); setPage(0); }}
              className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] ${
                table === t.name
                  ? 'border-strong bg-accent text-on-accent'
                  : 'border-border bg-surface text-muted hover:bg-raised'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </Panel>

      {data ? (
        <Panel
          title={`${data.label} · ${data.total} satır`}
          right={(
            <span className="flex items-center gap-2">
              {/*
                ⭐ Uyarı sunucudan gelir ve tuzağı ANLATIR — "dokunma" demekle yetinmez.
                ⚠️ Metin SİLİNMEDİ, balona taşındı: bazıları dört satır ve tablonun üstünde
                sürekli durmaları ekranı okunmaz yapıyordu. Balon `<details>` olduğu için
                Ctrl+F hâlâ içeriği bulabiliyor.
              */}
              {data.warning ? <Info label="tablo uyarısı">{data.warning}</Info> : null}
              <Badge tone={POLICY[data.policy]!.tone}>{POLICY[data.policy]!.text}</Badge>
            </span>
          )}
        >

          {data.filters.length > 0 ? (
            <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-4">
              {data.filters.map((f) => (
                <Field key={f} label={f}>
                  {/* ⚠️ Debounce: öncesinde HER tuş vuruşu bir sorgu atıyordu. */}
                  <SearchInput
                    value={filters[f] ?? ''}
                    onChange={(v) => { setPage(0); setFilters((st) => ({ ...st, [f]: v })); }}
                  />
                </Field>
              ))}
            </div>
          ) : null}

          <ErrorBox error={error} />

          <DataTable
            columns={data.columns.map((c) => ({
              key: c,
              label: (
                <span className="whitespace-nowrap">
                  {c}
                  {data.editable.includes(c) && rawMode
                    ? <span className="ml-1 text-warning">✎</span> : null}
                </span>
              ),
              render: (row: Record<string, unknown>) => (
                /* Tam değer `title`da: hücre 48 karakterde kesiliyor ama bilgi kaybolmuyor. */
                <span className="whitespace-nowrap font-mono" title={String(row[c] ?? '')}>
                  {cell(row[c])}
                </span>
              ),
            }))}
            rows={data.rows}
            keyOf={(_r, i) => i}
          />

          <Pagination
            page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}
          />

          {rawMode && data.policy === 'edit' ? (
            <RawEdit table={data} onDone={load} onNeedStepUp={onNeedStepUp} />
          ) : null}
        </Panel>
      ) : null}

      <ActionsPanel actions={meta.actions} onNeedStepUp={onNeedStepUp} onDone={load} />
    </div>
  );
}

/* ═══ Ham düzenleme ═════════════════════════════════════════════════════════ */

/**
 * ⚠️ Form iki JSON kutusu: `where` (satır seçimi) ve `values` (yeni değerler). Satır satır
 * düzenlenebilir bir tablo yapmak daha şık olurdu ama bileşik anahtarlı tablolarda (buildings,
 * units, techs…) "hangi satır" sorusunun tek bir kimliği yok. Açık `where`, ne yaptığını
 * gösteriyor — ham kipte bu bir özellik.
 */
function RawEdit({ table, onDone, onNeedStepUp }: {
  table: RowsPayload; onDone: () => void; onNeedStepUp: () => void;
}) {
  const [where, setWhere] = useState('{ "id": 1 }');
  const [values, setValues] = useState('{ }');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const body = { where: JSON.parse(where), values: JSON.parse(values) };
      const r = await api<{ updated: number }>(`/api/v1/admin/db/tables/${table.table}`, {
        method: 'PATCH', body,
      });
      setNote(`${r.updated} satır güncellendi. Eski hâli audit_log'a yazıldı.`);
      onDone();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t-2 border-strong bg-danger/10 p-3">
      <p className="mb-2 text-xs text-ink">
        <b>Ham düzenleme.</b> Yalnız şu kolonlar: <b>{table.editable.join(', ') || '—'}</b>.
        Satır seçimi yalnız: <b>{[...table.filters, 'id'].join(', ')}</b>.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Satır seçimi (where)">
          <Input type="text" value={where} className="font-mono"
            onChange={(e) => setWhere(e.target.value)} />
        </Field>
        <Field label="Yeni değerler">
          <Input type="text" value={values} className="font-mono"
            placeholder={`{ "${table.editable[0] ?? 'kolon'}": null }`}
            onChange={(e) => setValues(e.target.value)} />
        </Field>
      </div>
      <ErrorBox error={error} />
      {note ? <p className="mt-2 text-xs text-success">{note}</p> : null}
      <Button variant="danger" className="mt-2" disabled={busy} onClick={() => void run()}>
        {busy ? 'Yazılıyor…' : 'Yaz'}
      </Button>
    </div>
  );
}

/* ═══ Küratörlü aksiyonlar ══════════════════════════════════════════════════ */

/**
 * ⭐ Formlar **aksiyon künyesinden üretiliyor** (`ADMIN_ACTIONS`, sunucuda). Yeni bir aksiyon
 * eklemek panelde tek satır iş çıkarmıyor — Faz 1'deki ayar formuyla aynı gerekçe.
 */
function ActionsPanel({ actions, onDone, onNeedStepUp }: {
  actions: ActionSpec[]; onDone: () => void; onNeedStepUp: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const spec = actions.find((a) => a.id === open);

  return (
    <Panel title="Küratörlü aksiyonlar" right={<Badge tone="success">güvenli yol</Badge>}>
      <p className="border-b border-border px-3 py-2 text-[11px] leading-snug text-muted">
        Bu işlemler doğru servisten geçer: kaynak eklerken önce çıpa şimdiye çekilir, kuyruk
        iptalinde bitiş görevi de kapanır, birim kimliği katalogdan doğrulanır. Ham SQL bunların
        hiçbirini yapmaz.
      </p>
      <div className="flex flex-wrap gap-1 p-3">
        {actions.map((a) => (
          <button key={a.id} type="button"
            onClick={() => setOpen(open === a.id ? null : a.id)}
            className={`rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] ${
              open === a.id
                ? 'border-strong bg-accent text-on-accent'
                : 'border-border bg-surface text-muted hover:bg-raised'
            }`}>
            {a.label}
          </button>
        ))}
      </div>
      {spec ? <ActionForm spec={spec} onDone={onDone} onNeedStepUp={onNeedStepUp} /> : null}
    </Panel>
  );
}
