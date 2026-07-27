/**
 * DÜNYA sekmesi — **harita değil, DİYAR LİSTESİ** (§13.16.2).
 *
 * Bir diyarda tam 10 yuva vardır; boş yuva `-` ile geçer. **Her yuva tıklanabilir** — dolu olan
 * görev seçeneklerini, boş olan "Şehir Kur"u açar. Doküman (DÜNYA): *"tüm görev seçenekleri
 * yalnızca dünya menüsünden yapılabilir"* → modalın içeriği `screens/world-modal.tsx`'te.
 *
 * ⚠️ **Gizlilik (§13.16.5):** liste asker ve kaynak GÖSTERMEZ — bunu öğrenmenin yolu casusluktur.
 */
import { useState } from 'react';
import { fmt } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCity, useWorld, type WorldSlot } from '../lib/queries.ts';
import { Button, Input, Panel } from '../components/ui.tsx';
import { SlotBadges, TargetModal } from './world-modal.tsx';

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
    <div className="space-y-2">
      {/* ⭐ Seçici TEK SATIR ve küçük (kullanıcı kararı): diyar listesi sayfa kaydırmadan ekrana
          sığmalı. Önceden ayrı bir panel + iki satır etiket, tek başına listenin yarısı kadar
          yer kaplıyordu. */}
      <Panel title="Dünya" right={`${k}:${d}`}>
        <div className="flex items-center gap-1.5 px-2 py-2">
          <span className="shrink-0 text-[11px] text-muted">Kıta</span>
          <select value={k} onChange={(e) => setK(Number(e.target.value))}
            className="tnum shrink-0 rounded-[var(--radius-sm)] border border-border bg-raised px-1.5 py-1 text-sm text-ink">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="ml-1 shrink-0 text-[11px] text-muted">Diyar</span>
          <Button size="sm" variant="ghost" onClick={() => setD(Math.max(1, d - 1))}>−</Button>
          {/* Genişlik inline: `Input` kendi `w-full`'ünü taşıyor, sınıfla ezmek Tailwind'in
              sıralamasına bağlı kalırdı. */}
          <Input type="number" min={1} max={500} value={d} style={{ width: '4.5rem' }}
            className="tnum py-1 text-center"
            onChange={(e) => setD(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          <Button size="sm" variant="ghost" onClick={() => setD(Math.min(500, d + 1))}>+</Button>
          {home ? (
            <Button size="sm" variant="ghost" className="ml-auto" title="Kendi diyarıma dön"
              onClick={() => { setK(home.k); setD(home.d); }}>
              🏰
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Diyar listesi" right="10 yuva">
        {/* Liste TAŞARSA sayfa değil listenin kendisi kayar → seçici ve başlık hep ekranda kalır. */}
        <ul className="max-h-[calc(100svh-19rem)] divide-y divide-border overflow-y-auto lg:max-h-[calc(100svh-15rem)]">
          {(world.data?.slots ?? []).map((slot, i) => (
            <li key={slot.s}>
              {/* ⭐ BOŞ YUVA DA TIKLANABİLİR: şehir kurmanın tek yolu burası (doküman: DÜNYA). */}
              <button
                onClick={() => setTarget(slot)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-raised ${
                  i % 2 === 1 ? 'bg-row-alt' : ''
                }`}
              >
                <span className="tnum w-5 shrink-0 text-xs text-muted">{slot.s}</span>
                {slot.city ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm leading-tight text-ink">
                        {slot.city.name}
                        {slot.city.isCapital ? ' ★' : ''}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-muted">
                        {slot.city.username} · skor {fmt(slot.city.score)}
                      </span>
                    </span>
                    <SlotBadges slot={slot} />
                  </>
                ) : (
                  <span className="flex-1 text-sm text-muted">— <span className="text-[11px]">iskâna açık</span></span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3 py-1 text-[11px] text-muted">
          Bu liste asker ve kaynak göstermez; öğrenmenin yolu casusluktur.
        </div>
      </Panel>

      {target ? (
        <TargetModal slot={target} coords={{ k, d }} onClose={() => setTarget(null)} />
      ) : null}
    </div>
  );
}
