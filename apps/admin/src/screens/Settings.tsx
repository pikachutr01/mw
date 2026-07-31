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

      {/* ⭐ Önizleme yalnız MOTOR ayarları değiştiğinde anlamlı: sohbet limitini savaşta
          denemenin bir karşılığı yok. */}
      {changed.some((k) => /^(combat|hero|capture|loot)\./.test(k)) ? (
        <CombatPreview
          worldId={worldId}
          values={Object.fromEntries(changed.map((k) => [k, draft[k]]))}
        />
      ) : null}

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
