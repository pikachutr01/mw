/**
 * ⭐ AYARLAR EKRANI (Faz 1) — form **şemadan üretilir**, elle yazılmaz.
 *
 * Alanların adı, tipi, aralığı, açıklaması ve etiketi sunucudan (`@mobiwar/settings`) geliyor.
 * Panelde elle bir form yazsaydık yeni bir ayar eklendiğinde iki yeri güncellemek gerekirdi ve
 * biri unutulduğunda ayar ya görünmez ya da sunucunun reddettiği bir alan olurdu.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { SettingDef, SettingGroup } from '@mobiwar/settings';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import {
  Alert, Badge, Button, Checkbox, ErrorBox, Info, Input, Panel, SearchInput,
} from '../components/ui.tsx';

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
  const [search, setSearch] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);

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

  /**
   * ⚠️ Arama HEM etikette HEM açıklamada HEM anahtarda: yönetici bir ayarı çoğu zaman adıyla
   * değil işleviyle arıyor ("kaynak", "süre", "ban"). Yalnız etikette arasaydık `ops.chatDays`
   * ayarı "sohbet" yazınca çıkmazdı.
   */
  const q = search.trim().toLocaleLowerCase('tr');
  const matches = (d: SettingDef): boolean => {
    if (onlyChanged && !data.overridden.includes(d.key) && draft[d.key] === data.values[d.key]) {
      return false;
    }
    if (!q) return true;
    return `${d.label} ${d.description} ${d.key}`.toLocaleLowerCase('tr').includes(q);
  };
  const visible = data.defs.filter(matches);

  return (
    <div className="space-y-3">
      {/* ⭐ STICKY: 92 ayarın dibindeyken kaydet düğmesi ekran dışında kalıyordu. */}
      <div className="sticky top-12 z-10 space-y-2 rounded-[var(--radius-sm)] border border-border
        bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-48 flex-1">
            <SearchInput
              value={search} onChange={setSearch}
              placeholder="Ayar ara — ad, açıklama ya da anahtar…"
            />
          </span>
          <Checkbox
            label="yalnız değiştirilmişler" checked={onlyChanged} onChange={setOnlyChanged}
          />
          <span className="tnum text-[11px] text-muted">
            {visible.length} / {data.defs.length} ayar
          </span>
        </div>
      </div>

      {note ? <Alert tone="success">{note}</Alert> : null}
      <ErrorBox error={error} />

      {/* ⭐ Önizleme yalnız MOTOR ayarları değiştiğinde anlamlı: sohbet limitini savaşta
          denemenin bir karşılığı yok. */}
      {changed.some((k) => /^(combat|hero|capture|loot)\./.test(k)) ? (
        <CombatPreview
          worldId={worldId}
          values={Object.fromEntries(changed.map((k) => [k, draft[k]]))}
        />
      ) : null}

      {data.groups.map((group) => {
        const defs = visible.filter((d) => d.key.startsWith(`${group.id}.`));
        if (defs.length === 0) return null;
        const groupOverridden = data.defs
          .filter((d) => d.key.startsWith(`${group.id}.`) && data.overridden.includes(d.key))
          .map((d) => d.key);
        return (
          <Panel
            key={group.id}
            title={group.label}
            /**
             * ⭐ Varsayılan KAPALI — ama arama varken açık. Aksi hâlde arama sonucu bulunur
             * ama görünmezdi ve arama işe yaramazdı.
             */
            collapsible
            defaultOpen={q.length > 0 || onlyChanged}
            right={(
              <span className="flex items-center gap-2">
                <span className="tnum">{defs.length}</span>
                {groupOverridden.length > 0 ? (
                  <button type="button" className="underline"
                    onClick={(e) => { e.preventDefault(); void reset(groupOverridden); }}>
                    {groupOverridden.length} değişik — sıfırla
                  </button>
                ) : null}
              </span>
            )}
          >
            <p className="border-b border-border px-3 py-2 text-xs text-muted">
              {group.description}
            </p>
            {defs[0]?.entity ? (
              /* ⭐ 84 ayar düz liste olamazdı: satır = yapı/teknik, sütun = eksen. */
              <SettingMatrix
                worldId={worldId}
                defs={defs}
                values={data.values}
                draft={draft}
                overridden={data.overridden}
                onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
              />
            ) : (
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
            )}
          </Panel>
        );
      })}
    </div>
  );
}

/* ═══ Motor önizlemesi (Faz 4) ══════════════════════════════════════════════ */

/**
 * ⭐ ÖNİZLEME — kaydetmeden önce "bu sabit ne yapar?".
 *
 * Aynı savaş, **aynı seed'le** iki kez çözülür: mevcut ayarlarla ve taslakla. Seed aynı
 * olduğu için aradaki her fark sabitlerden gelir. Bu olmadan bir denge değişikliğini ölçmenin
 * tek yolu kaydedip canlı savaşları izlemekti — yani geri alması zor bir deneme.
 *
 * ⚠️ Savaş kurgusu SABİT ve mütevazı. Amaç "gerçekçi bir savaş" değil, **iki config arasındaki
 * farkı görünür kılmak**; kurguyu düzenlenebilir yapmak ekranı bir simülatör ekranına çevirirdi
 * ve oyunun kendi simülatörü (§0.0) zaten var.
 */
const PREVIEW_BATTLE = {
  attacker: { counts: { dwarf: 4000, elf: 1200, ogre: 300 }, tech: { blacksmith: 5 } },
  defender: {
    counts: { dwarf: 3000, archer_tower: 40, wall: 6, magic_shield: 4 },
    tech: { masonry: 4 },
  },
} as const;

/**
 * ⚠️ Alan adları motorun `SideResult`ından BİREBİR: `lost` / `alive` (`losses`/`survivors`
 * DEĞİL) ve `turns` bir SAYI (dizi değil). İlk yazımda uydurma adlar kullanılmıştı; ekran
 * hata vermeden her satıra 0 yazıyordu — yanlış alan adının en sinsi hâli.
 */
interface SideResultLike {
  alive: number;
  lost: number;
}
interface PreviewResult {
  winner: string;
  turns: number;
  xp: number;
  captureChance: number;
  attacker: SideResultLike;
  defender: SideResultLike;
}
interface PreviewPayload {
  seed: string;
  current: PreviewResult;
  proposed: PreviewResult;
  changed: string[];
  hash: { current: string; proposed: string };
}

function CombatPreview({ worldId, values }: {
  worldId: number; values: Record<string, number | boolean | undefined>;
}) {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [night, setNight] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      setData(await api<PreviewPayload>(`/api/v1/admin/settings/${worldId}/preview`, {
        method: 'POST',
        body: { values, battle: { ...PREVIEW_BATTLE, night }, seed: 'panel-onizleme' },
      }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Önizleme" right={<Badge tone="warning">kaydedilmez</Badge>}>
      <div className="space-y-2 p-3">
        <p className="text-xs text-muted">
          Taslak değerleri <b>aynı savaşta, aynı seed ile</b> dener ve mevcut ayarlarla yan yana
          gösterir. Hiçbir şey kaydedilmez.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)}
              className="h-4 w-4 accent-[var(--mw-color-accent)]" />
            Gece savaşı
          </label>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? 'Çözülüyor…' : 'Savaşı çöz'}
          </Button>
        </div>
        <ErrorBox error={error} />

        {data ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-left font-normal">&nbsp;</th>
                <th className="py-1 text-right font-normal">Mevcut</th>
                <th className="py-1 text-right font-normal">Taslak</th>
                <th className="py-1 text-right font-normal">Fark</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              <Row label="Kazanan" a={data.current.winner} b={data.proposed.winner} />
              <Row label="Tur sayısı" a={data.current.turns} b={data.proposed.turns} />
              <Row label="Saldıran kaybı"
                a={data.current.attacker.lost} b={data.proposed.attacker.lost} />
              <Row label="Savunan kaybı"
                a={data.current.defender.lost} b={data.proposed.defender.lost} />
              <Row label="Saldıran kalan"
                a={data.current.attacker.alive} b={data.proposed.attacker.alive} />
              <Row label="Savunan kalan"
                a={data.current.defender.alive} b={data.proposed.defender.alive} />
              <Row label="Tecrübe" a={data.current.xp} b={data.proposed.xp} />
              <Row label="Kahraman çıkma"
                a={data.current.captureChance} b={data.proposed.captureChance} />
            </tbody>
          </table>
        ) : null}
        {data ? (
          <p className="font-mono text-[10px] text-muted">
            özet {data.hash.current} → {data.hash.proposed} · seed {data.seed}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function Row({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  const same = a === b;
  const delta = typeof a === 'number' && typeof b === 'number' ? b - a : null;
  return (
    <tr className={same ? '' : 'bg-accent/10'}>
      <td className="py-1">{label}</td>
      <td className="tnum py-1 text-right">{a}</td>
      <td className="tnum py-1 text-right">{b}</td>
      <td className={`tnum py-1 text-right ${same ? 'text-muted' : 'text-warning'}`}>
        {/* ⚠️ "aynı" ile "0 fark" AYRI gösteriliyor: kazanan gibi metin alanlarda fark
            sayısal değil ve 0 yazmak yanıltırdı. */}
        {same ? '—' : delta === null ? 'değişti' : `${delta > 0 ? '+' : ''}${delta}`}
      </td>
    </tr>
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

  /**
   * ⭐ DÖRT SATIR METİN → TEK SATIR + ⓘ.
   *
   * Öncesinde her ayar satırı dört satır taşıyordu (etiket+rozet · açıklama · anahtar/aralık ·
   * uyarı) ve 92 ayar ekranda ~370 satır metin ediyordu. **Metin silinmedi**, balona taşındı:
   * `Ctrl+F` hâlâ bulabiliyor (native `<details>`), ama ekran taranabilir hâle geldi.
   */
  return (
    <li className={`px-3 py-1.5 ${isDirty ? 'bg-accent/10' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{def.label}</span>
          <Info label={`${def.label} açıklaması`}>
            <p className="mb-1">{def.description}</p>
            {/* ⭐ Gerekçe AYRI katman: "ne yapar" ile "neden bu sayı" farklı sorular. */}
            {def.note ? (
              <p className="mb-1 border-t border-border pt-1 text-muted">
                <b className="text-ink">Neden bu sayı: </b>{def.note}
              </p>
            ) : null}
            <p className="font-mono text-[10px] text-muted">
              {def.key}
              {def.min != null ? ` · ${def.min}–${def.max ?? '∞'}` : ''}
              {def.env ? ` · env: ${def.env}` : ''}
            </p>
            {def.tag === 'measured' ? (
              <p className="mt-1 text-warning">
                ⚠️ Bu sayı binary'den ölçüldü — tasarım tercihi değil, orijinal oyunun davranışı.
              </p>
            ) : null}
          </Info>
          <Badge tone={badge.tone}>{badge.text}</Badge>
          {isOverridden ? <Badge tone="success">değiştirilmiş</Badge> : null}
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

/* ═══ Katalog matrisi (2. nesil Tur 5) ══════════════════════════════════════ */

const AXES = ['gold', 'food', 'rate', 'timeFactor'] as const;
const AXIS_HEAD: Record<string, string> = {
  gold: 'Altın', food: 'Yemek', rate: 'Oran', timeFactor: 'Süre ×',
};

interface PreviewLevel {
  level: number;
  current: { gold: number; food: number; seconds: number };
  proposed: { gold: number; food: number; seconds: number };
}

const dur = (s: number): string => {
  if (s < 60) return `${s} sn`;
  if (s < 3600) return `${Math.floor(s / 60)} dk`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa`;
  return `${Math.floor(s / 86400)} gün`;
};

/**
 * ⭐ MATRİS — 84 ayar düz liste olarak okunamazdı.
 *
 * Satır = yapı/teknik (Türkçe ad, oyunun kendi sırasıyla), sütun = eksen. Sağda "seviye seviye
 * ne tutar" önizlemesi.
 *
 * ⚠️ **Dokunulmamış hücre DEĞER göstermiyor, `placeholder` gösteriyor.** Şema varsayılanını
 * değer olarak yazsaydık ve yönetici genel oranı 2,2 yapsaydı hücre hâlâ 1,8 derdi — panel
 * yalan söylerdi. Boş hücre = "devralınan"; yazdığın anda o kaleme özel olur.
 */
function SettingMatrix({ worldId, defs, values, draft, overridden, onChange }: {
  worldId: number;
  defs: SettingDef[];
  values: Record<string, number | boolean>;
  draft: Record<string, number | boolean>;
  overridden: string[];
  onChange: (key: string, v: number) => void;
}) {
  const [preview, setPreview] = useState<{ id: string; levels: PreviewLevel[] } | null>(null);
  const [busy, setBusy] = useState(false);

  /** id → eksen → tanım. Panel anahtarı AYRIŞTIRMIYOR; künye sunucudan geliyor. */
  const rows = new Map<string, { name: string; kind: string; byAxis: Record<string, SettingDef> }>();
  for (const d of defs) {
    if (!d.entity) continue;
    const row = rows.get(d.entity.id)
      ?? { name: d.entity.name, kind: d.entity.kind, byAxis: {} };
    row.byAxis[d.entity.axis] = d;
    rows.set(d.entity.id, row);
  }

  const runPreview = async (id: string, kind: string): Promise<void> => {
    setBusy(true);
    try {
      const changed = Object.keys(draft).filter((k) => draft[k] !== values[k]);
      const r = await api<{ levels: PreviewLevel[] }>(
        `/api/v1/admin/settings/${worldId}/catalog-preview`,
        {
          method: 'POST',
          body: { values: Object.fromEntries(changed.map((k) => [k, draft[k]])), kind, id },
        },
      );
      setPreview({ id, levels: r.levels });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted">
          <tr className="text-left">
            <th className="px-3 py-1.5 font-normal">Kalem</th>
            {AXES.map((a) => (
              <th key={a} className="px-2 py-1.5 text-right font-normal">{AXIS_HEAD[a]}</th>
            ))}
            <th className="px-2 py-1.5 font-normal">Seviye seviye</th>
          </tr>
        </thead>
        <tbody className="text-ink">
          {[...rows.entries()].map(([id, row], i) => (
            <Fragment key={id}>
              <tr className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                <td className="px-3 py-1">
                  {row.name}
                  {AXES.some((a) => row.byAxis[a] && overridden.includes(row.byAxis[a]!.key))
                    ? <span className="ml-1 text-success">•</span> : null}
                </td>
                {AXES.map((axis) => {
                  const def = row.byAxis[axis];
                  if (!def) return <td key={axis} />;
                  const isOverridden = overridden.includes(def.key);
                  const dirty = draft[def.key] !== values[def.key];
                  /* Dokunulmamış hücre boş kalır; placeholder devralınan etkin değeri gösterir. */
                  const shown = isOverridden || dirty ? String(draft[def.key] ?? '') : '';
                  return (
                    <td key={axis} className={`px-1 py-1 ${dirty ? 'bg-accent/10' : ''}`}>
                      <input
                        type="number" step={def.type === 'int' ? 1 : 'any'}
                        min={def.min} max={def.max}
                        value={shown}
                        placeholder={String(values[def.key] ?? def.default)}
                        title={def.description}
                        onChange={(e) => onChange(def.key, Number(e.target.value))}
                        className="tnum w-24 rounded-[var(--radius-sm)] border border-border bg-bg
                          px-1.5 py-0.5 text-right text-ink outline-none focus:border-accent"
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1">
                  <button
                    type="button" disabled={busy}
                    className="underline decoration-dotted"
                    onClick={() => void runPreview(id, row.kind)}
                  >
                    {preview?.id === id ? 'gizle' : 'göster'}
                  </button>
                </td>
              </tr>
              {preview?.id === id ? (
                <tr>
                  <td colSpan={AXES.length + 2} className="px-3 pb-2">
                    <div className="flex flex-wrap gap-3 rounded-[var(--radius-sm)] border
                      border-border bg-bg p-2 text-[11px]">
                      {preview.levels.map((l) => {
                        const changedRow = l.current.gold !== l.proposed.gold
                          || l.current.seconds !== l.proposed.seconds;
                        return (
                          <span key={l.level} className={changedRow ? 'text-warning' : 'text-muted'}>
                            <b className="text-ink">sv {l.level}</b>{' '}
                            <span className="tnum">{l.proposed.gold.toLocaleString('tr-TR')}a</span>
                            {' / '}
                            <span className="tnum">{l.proposed.food.toLocaleString('tr-TR')}y</span>
                            {' · '}{dur(l.proposed.seconds)}
                            {changedRow ? (
                              <span className="text-muted">
                                {' '}(şu an {l.current.gold.toLocaleString('tr-TR')}a ·{' '}
                                {dur(l.current.seconds)})
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted">
        ⚠️ Boş hücre = <b>devralınan</b>. İçindeki soluk sayı şu anda geçerli olan değer;
        yazdığın anda o kaleme özel olur. Oranı boş bırakırsan «Ekonomi ve süre» grubundaki
        genel oran geçerli kalır.
      </p>
    </div>
  );
}
