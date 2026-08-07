/**
 * ⭐ TOPLU İŞLEMLER — *"Tüm hesaplara toplu asker ekleme veya silme, savunma ünitesi ekleme
 * silme, sur büyü kalkan seviyesi, akademi tekniği düzenleme."*
 *
 * Ekran **üç adımlı** ve sıra bilinçli:
 *   1. **Kimler** — iki kip: elle seçim ya da filtre + muafiyet
 *   2. **Ne** — işlem ve alanları (birim seçici katalogdan, Türkçe adlarla)
 *   3. **Kuru koşu → onay** — kaç oyuncu, kaç şehir, örnek isimler; sonra ayrı bir kırmızı düğme
 *
 * ⚠️ Kuru koşu **atlanamıyor**: "Uygula" düğmesi ancak önizleme alındıktan sonra beliriyor.
 * Geri alınamaz bir işlemde tek tıkla çalıştırmak, Faz 7'de öğrenilen dersin tekrarı olurdu.
 *
 * ══ 2026-08-07 · SEÇİM ARAYÜZÜ YENİDEN (kullanıcı) ═══════════════════════════════════
 *
 * Kullanıcının iki şikâyeti vardı ve ikisi de aynı tasarım hatasından çıkıyordu — **seçim
 * arayüzü diye bir şey yoktu**, yalnız "filtreye uyan herkes eksi muaflar" modeli vardı:
 *
 * 1️⃣ *"Kimler etkilenecek açılınca tüm oyuncular seçili gelmesin."* Tek kip filtre olduğu
 *    için önizleme kaçınılmaz olarak dünyadaki HERKESİ gösteriyordu. Çözüm: **«Elle seçim»
 *    kipi ve o kip VARSAYILAN** — ekran boş bir seçimle açılıyor, hiç kimse hedefte değil.
 *
 * 2️⃣ *"Bir oyuncuyu çıkarınca ekran kendiliğinden kapanıyor."* Çıkarma `invalidate()`
 *    çağırıyordu, o da `preview`i `null` yapıyordu ve liste önizlemenin İÇİNDE yaşadığı için
 *    tüm liste yok oluyordu. İki düzeltme: seçici artık **1. adımın kalıcı bir parçası**
 *    (önizlemeden bağımsız), ve önizleme listesinden çıkarma paneli kapatmıyor — satırı
 *    düşürüp sayıları YEREL olarak düzeltiyor (`s.cities` bilindiği için sayı tam kalıyor;
 *    uygulama anında sunucu zaten kümeyi baştan çözüyor).
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { num } from '../lib/format.ts';
import {
  Badge, Button, Empty, ErrorBox, Field, Input, Loading, Pagination, Panel, SearchInput,
} from '../components/ui.tsx';
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

/** Seçim listelerinde tutulan asgari künye — çip adı için ikinci bir sorgu gerekmesin. */
interface PlayerLite { id: number; username: string }

interface PlayerPage {
  items: { id: number; username: string; score: number; cities: number; alliance: string | null }[];
  page: number; pageSize: number; total: number;
}

/** `filter` = filtreye uyan herkes (eksi muaflar) · `manual` = yalnız elle seçilenler. */
type Mode = 'filter' | 'manual';

export function BulkScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const [opId, setOpId] = useState<string>('units');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [worldId, setWorldId] = useState('1');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [activeDays, setActiveDays] = useState('');
  /**
   * ⭐ VARSAYILAN `manual` (kullanıcı, 2026-08-07): ekran **boş bir seçimle** açılıyor.
   * `filter` varsayılan olsaydı ilk önizleme yine "dünyadaki herkes" derdi.
   */
  const [mode, setMode] = useState<Mode>('manual');
  const [only, setOnly] = useState<PlayerLite[]>([]);
  const [exclude, setExclude] = useState<PlayerLite[]>([]);
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

  /**
   * ⚠️ İki kip **birbirine karışmıyor**: elle seçimde filtre alanları hiç gönderilmiyor
   * (sunucu `only` varsa filtreyi zaten yok sayıyor), filtre kipinde de `only` gönderilmiyor.
   * Karışık bir yük, panelde görünenle sunucunun yaptığını ayırırdı.
   */
  const target = (): Record<string, unknown> => (mode === 'manual'
    ? { worldId: Number(worldId) || 0, only: only.map((p) => p.id) }
    : {
      worldId: Number(worldId) || 0,
      ...(scoreMin.trim() ? { scoreMin: Number(scoreMin) } : {}),
      ...(scoreMax.trim() ? { scoreMax: Number(scoreMax) } : {}),
      ...(activeDays.trim() ? { activeSinceDays: Number(activeDays) } : {}),
      exclude: exclude.map((p) => p.id),
    });

  /** Elle seçimde hiç kimse seçilmediyse işlem başlatılamaz (sunucu da boş kümeyi kabul eder). */
  const noTarget = mode === 'manual' && only.length === 0;

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
      <Panel title="1 · Kimlere" right={mode === 'manual' ? 'elle seçim' : 'filtre + muafiyet'}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Field label="Dünya">
            <Input type="number" className="w-20" value={worldId}
              onChange={(e) => { setWorldId(e.target.value); invalidate(); }} />
          </Field>
          <span className="flex gap-1 self-end">
            {([
              ['manual', 'Elle seç'],
              ['filter', 'Filtreye uyan herkes'],
            ] as const).map(([id, label]) => (
              <button
                key={id} type="button"
                onClick={() => { setMode(id); invalidate(); }}
                className={`rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs ${
                  mode === id
                    ? 'border-strong bg-accent text-on-accent'
                    : 'border-border bg-surface text-muted hover:bg-raised'
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>

        {mode === 'filter' ? (
          <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-3">
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
        ) : null}

        {/*
          ⭐ SEÇİM ÇİPLERİ — hangi kipte olursak olalım aynı yerde, aynı görünüm. Elle seçimde
          "hedef", filtre kipinde "muaf" listesi; ikisi de tek tıkla geri alınabiliyor.
        */}
        <ChipRow
          tone={mode === 'manual' ? 'accent' : 'warning'}
          label={mode === 'manual' ? 'Seçilen' : 'Muaf tutulan'}
          items={mode === 'manual' ? only : exclude}
          onRemove={(id) => {
            if (mode === 'manual') setOnly((x) => x.filter((p) => p.id !== id));
            else setExclude((x) => x.filter((p) => p.id !== id));
            invalidate();
          }}
          onClear={() => {
            if (mode === 'manual') setOnly([]); else setExclude([]);
            invalidate();
          }}
        />

        {/*
          ⭐ KALICI SEÇİCİ — önizlemeden BAĞIMSIZ. Eski ekranda tek liste önizlemenin içindeydi
          ve bir isim çıkarılınca `invalidate()` onu da götürüyordu (kullanıcının 2. şikâyeti).
        */}
        <PlayerPicker
          worldId={Number(worldId) || 0}
          selected={mode === 'manual' ? only : exclude}
          hint={mode === 'manual'
            ? 'İşaretlediklerin hedeflenir. Hiçbiri seçili değilken işlem başlatılamaz.'
            : 'İşaretlediklerin filtreye uysa bile MUAF tutulur.'}
          onToggle={(p) => {
            const set = mode === 'manual' ? only : exclude;
            const next = set.some((x) => x.id === p.id)
              ? set.filter((x) => x.id !== p.id)
              : [...set, p];
            if (mode === 'manual') setOnly(next); else setExclude(next);
            invalidate();
          }}
        />
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
            variant="ghost" disabled={call.isPending || !op || noTarget}
            onClick={() => call.mutate(false)}
          >
            {call.isPending ? 'hesaplanıyor…' : 'Kimler etkilenecek? (hiçbir şey değişmez)'}
          </Button>
          {noTarget ? (
            <p className="text-[11px] text-muted">
              Önce yukarıdan en az bir oyuncu seç — ya da «Filtreye uyan herkes» kipine geç.
            </p>
          ) : null}

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
                    {/*
                      ⭐ LİSTEDEN ÇIKARMA PANELİ KAPATMIYOR (kullanıcı, 2026-08-07).
                      Eskiden burada `invalidate()` vardı ve önizlemenin tamamı — dolayısıyla bu
                      listenin kendisi — yok oluyordu; ikinci bir ismi çıkarmak için baştan
                      hesaplatmak gerekiyordu.
                      ⚠️ Sayılar YEREL olarak düzeltiliyor ve bu bir tahmin DEĞİL: satırın kaç
                      şehri olduğu (`s.cities`) elimizde. Uygulama anında sunucu kümeyi zaten
                      `target()`ten baştan çözüyor, yani buradaki sayı yalnız gösterim.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        if (mode === 'manual') setOnly((x) => x.filter((p) => p.id !== s.id));
                        else setExclude((x) => [...x, { id: s.id, username: s.username }]);
                        setPreview((p) => (p ? {
                          ...p,
                          players: Math.max(0, p.players - 1),
                          cities: Math.max(0, p.cities - s.cities),
                          sample: p.sample.filter((x) => x.id !== s.id),
                        } : p));
                      }}
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

/**
 * Seçilen / muaf tutulan oyuncuların çip listesi. Boşken **hiç çizilmiyor**: boş bir kutu
 * "burada bir şey olmalıydı" der.
 */
function ChipRow({ items, label, tone, onRemove, onClear }: {
  items: PlayerLite[]; label: string; tone: 'accent' | 'warning';
  onRemove: (id: number) => void; onClear: () => void;
}) {
  if (items.length === 0) return null;
  const cls = tone === 'accent'
    ? 'border-accent text-accent hover:border-danger hover:text-danger'
    : 'border-warning text-warning hover:border-danger hover:text-danger';
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
      <span className="mr-1 text-[11px] text-muted">{label} ({items.length}):</span>
      {items.map((p) => (
        <button
          key={p.id} type="button" onClick={() => onRemove(p.id)} title="çıkar"
          className={`rounded-[var(--radius-sm)] border bg-bg px-1.5 py-0.5 text-[11px] ${cls}`}
        >
          {p.username} ×
        </button>
      ))}
      <button type="button" onClick={onClear}
        className="ml-1 text-[11px] text-muted underline hover:text-ink">hepsini temizle</button>
    </div>
  );
}

/**
 * ⭐ OYUNCU SEÇİCİ — arama + sayfalama, işaret kutularıyla.
 *
 * ⚠️ **Kendi sorgusu var** (`GET /api/v1/admin/players`), toplu işlem ucundan beslenmiyor.
 * Sebep tam da kullanıcının şikâyeti: bu liste seçimden ETKİLENMEMELİ. Kuru koşuya bağlansaydı
 * her işaretleme listeyi yeniden hesaplatır, kutucuklar gözün önünde yer değiştirirdi.
 * ⚠️ Uç yalnız `AdminGuard` istiyor (yükseltme yok) — okuma amaçlı, hiçbir şey değiştirmiyor.
 * ⚠️ Arama `SearchInput` ile gecikmeli: her tuş vuruşunda sorgu atmıyor.
 * ⚠️ Sayfa değişince seçim KORUNUYOR — seçim `id` üzerinden tutuluyor, listeye bağlı değil;
 *    3. sayfadan birini işaretleyip 1. sayfaya dönmek işareti düşürmez.
 */
function PlayerPicker({ worldId, selected, hint, onToggle }: {
  worldId: number; selected: PlayerLite[]; hint: string;
  onToggle: (p: PlayerLite) => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const chosen = new Set(selected.map((p) => p.id));

  const list = useQuery({
    queryKey: ['bulk-players', worldId, q, page],
    queryFn: () => api<PlayerPage>(
      `/api/v1/admin/players?world=${worldId}&q=${encodeURIComponent(q)}&page=${page}`,
    ),
    // Sayfa/arama değişince liste boşalıp zıplamasın — öncekiler yerinde kalır.
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="min-w-40 flex-1">
          <SearchInput value={q} placeholder="Oyuncu ara…"
            onChange={(v) => { setQ(v); setPage(0); }} />
        </span>
        <span className="text-[11px] text-muted">{hint}</span>
      </div>

      {list.isLoading ? <Loading /> : null}
      {list.data && list.data.items.length === 0
        ? <Empty>Bu dünyada eşleşen oyuncu yok.</Empty> : null}

      {list.data && list.data.items.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto border-t border-border">
          {list.data.items.map((p) => {
            const on = chosen.has(p.id);
            return (
              <li key={p.id}>
                <label className={`flex cursor-pointer items-center gap-2 border-b border-border
                  px-3 py-1.5 text-xs last:border-b-0 hover:bg-raised ${on ? 'bg-raised' : ''}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0" checked={on}
                    onChange={() => onToggle({ id: p.id, username: p.username })} />
                  <span className="min-w-0 flex-1 truncate text-ink">{p.username}</span>
                  {p.alliance ? <Badge>{p.alliance}</Badge> : null}
                  <span className="tnum shrink-0 text-muted">{num(p.score)} p</span>
                  <span className="tnum shrink-0 text-muted">{p.cities} şehir</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {list.data ? (
        <Pagination page={list.data.page} pageSize={list.data.pageSize}
          total={list.data.total} onPage={setPage} />
      ) : null}
    </div>
  );
}
