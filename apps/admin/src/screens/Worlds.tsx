/**
 * ⭐ DÜNYA EKRANI (Faz 1) — hız çarpanları, sıralama tetiği, künye.
 *
 * ⚠️ Hız çarpanları `settings` tablosunda DEĞİL, `worlds` kolonlarında. Sebep: oyun kodu onları
 * zaten her sorguda oradan okuyor (`city.service`, `queue.service`, `cave.handlers`); ayarlara
 * kopyalamak ikinci bir doğruluk kaynağı yaratırdı. Panel ikisini tek ekranda gösteriyor,
 * sunucu ikisini ayrı tutuyor.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Badge, Button, ErrorBox, Field, Input, Panel } from '../components/ui.tsx';

interface World {
  id: number;
  name: string;
  state: string;
  paused: boolean;
  pausedAt: string | null;
  gameNow: string;
  clockOffsetMs: number;
  startedAt: string;
  multipliers: Record<string, number>;
  counts: { players: number; cities: number };
  lastRankingAt: string | null;
  settingsHash: string;
}

const MULTIPLIER_LABELS: [key: string, label: string, hint: string][] = [
  ['speedMultiplier', 'Sefer hızı', 'Sefer sürelerini böler (mağara kaçış dönüşü dâhil).'],
  ['resourceMultiplier', 'Kaynak', 'Çiftlik ve Maden üretimini çarpar.'],
  ['trainingMultiplier', 'Eğitim', 'Baraka ve savunma BİRİMİ üretim sürelerini böler.'],
  ['constructionMultiplier', 'İnşaat', 'Bina, Sur/Kalkan seviyesi ve Akademi tekniği sürelerini böler.'],
];

export function WorldsScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const r = await api<{ worlds: World[] }>('/api/v1/admin/worlds');
      setWorlds(r.worlds);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorBox error={error} />;
  if (!worlds) return <p className="text-sm text-muted">Yükleniyor…</p>;

  return (
    <div className="space-y-3">
      {worlds.map((w) => (
        <WorldCard key={w.id} world={w} onChanged={load} onNeedStepUp={onNeedStepUp} />
      ))}
    </div>
  );
}

function WorldCard({ world, onChanged, onNeedStepUp }: {
  world: World; onChanged: () => void; onNeedStepUp: () => void;
}) {
  const [draft, setDraft] = useState(world.multipliers);
  const [busy, setBusy] = useState<null | 'save' | 'ranking'>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { setDraft(world.multipliers); }, [world.multipliers]);

  const dirty = MULTIPLIER_LABELS.some(([k]) => draft[k] !== world.multipliers[k]);

  const run = async (kind: 'save' | 'ranking'): Promise<void> => {
    setBusy(kind); setError(null); setNote(null);
    try {
      if (kind === 'save') {
        await api(`/api/v1/admin/worlds/${world.id}/multipliers`, { method: 'PUT', body: draft });
        setNote('Çarpanlar kaydedildi.');
      } else {
        const r = await api<{ missionId: number }>(
          `/api/v1/admin/worlds/${world.id}/ranking-run`, { method: 'POST' });
        setNote(`Sıralama görevi kuyruğa alındı (#${r.missionId}). Birkaç saniye içinde işlenir.`);
      }
      onChanged();
    } catch (err) {
      // ⭐ Yükseltme gerekiyorsa diyaloğu ÜST ŞERİT açar — her ekran kendi kopyasını taşımasın.
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(null);
    }
  };

  const time = (iso: string | null): string =>
    (iso ? new Date(iso).toLocaleString('tr-TR') : '—');

  return (
    <Panel
      title={`Dünya ${world.id} · ${world.name}`}
      right={world.paused ? <Badge tone="warning">bakımda</Badge> : <Badge tone="success">çalışıyor</Badge>}
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-3 text-xs sm:grid-cols-4">
        <Stat label="Oyuncu" value={String(world.counts.players)} />
        <Stat label="Şehir" value={String(world.counts.cities)} />
        {/* ⚠️ OYUN SAATİ, gerçek saat değil: bakımda DONAR. Farkı görebilmek panelde önemli. */}
        <Stat label="Oyun saati" value={time(world.gameNow)} />
        <Stat label="Son sıralama" value={time(world.lastRankingAt)} />
      </dl>

      <div className="border-t border-border px-3 py-3">
        <div className="mb-2 text-xs text-muted">
          Hız çarpanları — hepsi <b>1</b> iken klasik tempo.
          {' '}⚠️ <b>Süren işleri geriye dönük etkilemez</b>: kuyruk bitiş anı ve sefer varış anı
          girerken hesaplanıp yazılıyor. Çarpan yalnız bundan sonraki işleri etkiler.
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {MULTIPLIER_LABELS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <Input
                type="number" min={1} max={1000} step={1}
                value={draft[key] ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
        {note ? <p className="mt-2 text-xs text-success">{note}</p> : null}
        <ErrorBox error={error} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={!dirty || busy !== null} onClick={() => void run('save')}>
            {busy === 'save' ? 'Kaydediliyor…' : 'Çarpanları kaydet'}
          </Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(world.multipliers)}>
            Geri al
          </Button>
          {/* ⭐ Sıralama normalde 00/08/16'da donuyor; bu düğme aradaki bir anda elle aldırır. */}
          <Button variant="ghost" disabled={busy !== null} onClick={() => void run('ranking')}>
            {busy === 'ranking' ? 'Kuyruğa alınıyor…' : 'Sıralamayı şimdi güncelle'}
          </Button>
        </div>
      </div>

      <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
        Ayar özeti <span className="tnum">{world.settingsHash}</span>
        {' · '}kuruluş {time(world.startedAt)}
        {world.clockOffsetMs > 0
          ? ` · toplam duraklama ${Math.round(world.clockOffsetMs / 60_000)} dk` : ''}
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}
