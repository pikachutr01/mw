/**
 * DÜNYA sekmesi — **harita değil, DİYAR LİSTESİ** (§13.16.2).
 *
 * Bir diyarda tam 10 yuva vardır; boş yuva `-` ile geçer. Dolu yuvaya tıklamak **modal** açar:
 * mesafe/süre önizlemesi + saldırı formu.
 *
 * ⚠️ **Gizlilik (§13.16.5):** liste asker ve kaynak GÖSTERMEZ — bunu öğrenmenin yolu casusluktur.
 */
import { useState } from 'react';
import { armySpeed, distance, travelSeconds } from '@mobiwar/engine';
import { fmt, formatDuration } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import {
  useCatalog, useCity, useSendAttack, useWorld, type WorldSlot,
} from '../lib/queries.ts';
import { Badge, Button, Empty, ErrorBox, Input, Panel } from '../components/ui.tsx';
import { Modal } from '../components/Modal.tsx';

export function World() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const [k, setK] = useState(1);
  const [d, setD] = useState(1);
  const [target, setTarget] = useState<WorldSlot | null>(null);
  const world = useWorld(k, d);

  // Oyuncunun kendi diyarına atlaması en sık istenen hareket.
  const home = city.data?.coordinates;

  return (
    <div className="space-y-3">
      <Panel title="Dünya" right="10 kıta × 500 diyar × 10 şehir">
        <div className="flex items-end gap-2 px-3 py-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">Kıta</span>
            <select value={k} onChange={(e) => setK(Number(e.target.value))}
              className="w-full rounded-[var(--radius-sm)] border border-border bg-raised px-2 py-2 text-sm text-ink">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted">Diyar (1-500)</span>
            <Input type="number" min={1} max={500} value={d} className="tnum"
              onChange={(e) => setD(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </label>
          <Button variant="ghost" onClick={() => setD(Math.max(1, d - 1))}>−</Button>
          <Button variant="ghost" onClick={() => setD(Math.min(500, d + 1))}>+</Button>
          {home ? (
            <Button variant="ghost" title="Kendi diyarıma dön"
              onClick={() => { setK(home.k); setD(home.d); }}>
              🏰
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Diyar listesi" right={`${k}:${d}`}>
        <ul className="divide-y divide-border">
          {(world.data?.slots ?? []).map((slot, i) => (
            <li key={slot.s}>
              <button
                disabled={!slot.city}
                onClick={() => setTarget(slot)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  i % 2 === 1 ? 'bg-row-alt' : ''
                } ${slot.city ? 'hover:bg-raised' : 'cursor-default'}`}
              >
                <span className="tnum w-6 shrink-0 text-xs text-muted">{slot.s}</span>
                {slot.city ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {slot.city.name}
                        {slot.city.isCapital ? ' ★' : ''}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {slot.city.username} · skor {fmt(slot.city.score)}
                      </span>
                    </span>
                    {slot.city.isOwn ? <Badge tone="success">senin</Badge> : null}
                    {slot.city.protection === 'beginner' ? <Badge>acemi koruması</Badge> : null}
                    {slot.city.protection === 'vacation' ? <Badge>tatilde</Badge> : null}
                  </>
                ) : (
                  <span className="flex-1 text-sm text-muted">—</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
          Bu liste asker ve kaynak göstermez; öğrenmenin yolu casusluktur.
        </div>
      </Panel>

      {target?.city ? (
        <CityModal slot={target} coords={{ k, d }} onClose={() => setTarget(null)} />
      ) : null}
    </div>
  );
}

/**
 * Şehir modalı: mesafe/süre önizlemesi + saldırı formu.
 * (Alt sayfa yerine MODAL — kullanıcı kararı, oyunun genel modal diline uyuyor.)
 */
function CityModal({
  slot, coords, onClose,
}: {
  slot: WorldSlot;
  coords: { k: number; d: number };
  onClose: () => void;
}) {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const catalog = useCatalog(cityId);
  const send = useSendAttack();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const target = { k: coords.k, d: coords.d, s: slot.s };
  const origin = city.data?.coordinates;

  const units: Record<string, number> = {};
  for (const [id, raw] of Object.entries(picked)) {
    const n = Math.trunc(Number(raw) || 0);
    if (n > 0) units[id] = n;
  }
  const hasUnits = Object.keys(units).length > 0;

  // ⭐ Önizleme motorun AYNI fonksiyonuyla hesaplanır (`packages/engine/travel.ts`); otorite yine
  //    sunucudur, bu yalnız oyuncunun karar vermesi için. İkisi ayrı formül olsaydı kaçınılmaz
  //    olarak birbirinden kayarlardı.
  const D = origin ? distance(origin, target) : 0;
  const speed = hasUnits ? armySpeed(units) : null;
  const cartography = city.data?.techs['cartography'] ?? 0;
  const eta = speed ? travelSeconds({ distance: D, speed, cartography }) : null;

  const own = slot.city?.isOwn === true;
  const protectedTarget = slot.city?.protection != null;

  return (
    <Modal
      title={`${slot.city?.name ?? '—'} (${target.k}:${target.d}:${target.s})`}
      onClose={onClose}
      width="lg"
      footer={<Button variant="ghost" onClick={onClose}>Kapat</Button>}
    >
      <div>
        <div className="border-b border-border px-3 py-1.5 text-xs text-muted">
          Oyuncu: <b className="text-ink">{slot.city?.username}</b>
          {slot.city?.isCapital ? ' · başkent' : ''}
        </div>

        <div className="space-y-3 p-3">
          <div className="tnum grid grid-cols-3 gap-2 text-xs">
            <Stat label="Mesafe" value={fmt(D)} />
            <Stat label="Ordu hızı" value={speed ? String(speed) : '—'} />
            <Stat label="Tahmini süre" value={eta ? formatDuration(eta) : '—'} />
          </div>

          {own ? (
            <div className="rounded-[var(--radius-sm)] border border-border px-3 py-2 text-sm text-muted">
              Bu senin şehrin — kendi şehrine saldıramazsın.
            </div>
          ) : protectedTarget ? (
            <div className="rounded-[var(--radius-sm)] border border-warning px-3 py-2 text-sm text-warning">
              Bu oyuncu {slot.city?.protection === 'beginner' ? 'acemi koruması' : 'tatil modu'} altında —
              saldırıya kapalı.
            </div>
          ) : (
            <>
              <div className="text-xs text-muted">
                Ordunun hızı <b>en yavaş birimin</b> hızıdır. Birlikler yola çıktığı anda şehirden düşer.
              </div>

              <ul className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
                {(catalog.data?.units ?? []).map((u) => {
                  const have = city.data?.units[u.id] ?? 0;
                  if (have <= 0) return null;
                  return (
                    <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-sm text-ink">
                        {u.name}
                        <span className="ml-1 text-xs text-muted">
                          {fmt(have)} hazır · hız {u.speed}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Input type="number" min={0} max={have} inputMode="numeric"
                          className="w-24 tnum" placeholder="0"
                          value={picked[u.id] ?? ''}
                          onChange={(e) => setPicked({ ...picked, [u.id]: e.target.value })} />
                        <Button size="sm" variant="ghost"
                          onClick={() => setPicked({ ...picked, [u.id]: String(have) })}>
                          hepsi
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {Object.values(city.data?.units ?? {}).every((n) => n <= 0) ? (
                <Empty>Şehrinde savaşçı yok. Önce Baraka'dan üret.</Empty>
              ) : null}

              <ErrorBox error={send.error} />

              <Button
                className="w-full"
                disabled={!hasUnits || send.isPending || cityId == null}
                onClick={() => {
                  send.mutate(
                    { originCityId: cityId!, target, units },
                    { onSuccess: () => { setPicked({}); onClose(); } },
                  );
                }}
              >
                {send.isPending ? 'Gönderiliyor…' : 'Saldırıya gönder'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border px-2 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}
