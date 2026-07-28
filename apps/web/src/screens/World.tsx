/**
 * DÜNYA sekmesi — **harita değil, DİYAR LİSTESİ** (§13.16.2), referans `images/scr_web03`.
 *
 * Tablo altı sütun: **No · Şehir · Oyuncu · İttifak · Sıra · Görev**. Boş yuva da dolu yuva da
 * **aynı yükseklikte** satır alır — orijinalde de öyle ve göz sütunları kaydırmadan tarıyor.
 *
 * ⭐ **Görev sütunu bir kısayoldur:** simgeye tıklamak modalı doğrudan o görevin formunda açar.
 * Simgeler istemcide hedefin türünden türetiliyor (ucuz, 10 satır için 10 istek atmamak lazım);
 * **yetki kararı yine sunucunun** — modal açılınca `GET /missions/options` doğrulamayı yapar.
 *
 * **Mobilde Görev sütunu gizlenir** (sığmıyor): satıra tıklamak seçenek listesini açar.
 *
 * ⚠️ **Gizlilik (§13.16.5):** liste asker ve kaynak GÖSTERMEZ — bunu öğrenmenin yolu casusluktur.
 */
import { useState } from 'react';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCity, useWorld, type WorldSlot } from '../lib/queries.ts';
import { Button, Input, MissionIcon, Panel, Skeleton, Td, Th } from '../components/ui.tsx';
import { TargetModal } from './world-modal.tsx';

/**
 * Hedefin türüne göre gösterilecek görev simgeleri (yalnız GÖSTERİM — yetki sunucuda).
 *
 * ⚠️ Rakip şehirde **kırmızı** varyantlar kullanılıyor (`attack_in`, `spy_back`): orijinal
 * ekranda düşmana yapılan saldırı/casusluk kırmızı kılıç ve kırmızı kuşla gösteriliyor
 * (`images/scr_web03`). Dosyalar zaten elimizde; renk filtresi uydurmaya gerek yok.
 */
function shortcutsFor(slot: WorldSlot, activeCityId: number | null): { type: string; icon: string; label: string }[] {
  if (!slot.city) return [{ type: 'found_city', icon: 'found_city', label: 'Şehir Kur' }];
  if (slot.city.isOwn) {
    // Aktif şehrin kendisine görev gönderilemez → sütun boş kalır.
    if (slot.city.id === activeCityId) return [];
    return [
      { type: 'transport', icon: 'transport_out', label: 'Nakliye' },
      { type: 'support', icon: 'support_out', label: 'Destek' },
      { type: 'teleport', icon: 'teleport', label: 'Teleport' },
    ];
  }
  return [
    { type: 'attack', icon: 'attack_in', label: 'Saldırı' },
    { type: 'spy', icon: 'spy_back', label: 'Casusluk' },
    { type: 'transport', icon: 'transport_out', label: 'Nakliye' },
  ];
}

/**
 * Şehir adından **" şehri"** ekini atar (kullanıcı kararı: sütunda yalnız ad görünsün).
 * Kayıtta üretilen ad `"<oyuncu> şehri"` biçimindeydi; yeni kayıtlarda ek artık üretilmiyor,
 * bu yardımcı **eski satırlar** için duruyor.
 */
const cityLabel = (name: string): string => name.replace(/\s+şehri$/i, '');

export function World() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const [k, setK] = useState(1);
  const [d, setD] = useState(1);
  const [target, setTarget] = useState<{ slot: WorldSlot; type?: string } | null>(null);
  const world = useWorld(k, d);

  const home = city.data?.coordinates;
  const slots = world.data?.slots ?? [];

  return (
    <div className="space-y-2">
      {/* Seçici TEK SATIR ve küçük: diyar listesi sayfa kaydırmadan ekrana sığmalı. */}
      <Panel title="Dünya" right={`${k}:${d}`}>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="shrink-0 text-[11px] text-muted">Kıta</span>
          <select value={k} onChange={(e) => setK(Number(e.target.value))}
            className="tnum shrink-0 rounded-[var(--radius-sm)] border border-border bg-raised px-1.5 py-1 text-sm text-ink">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="ml-1 shrink-0 text-[11px] text-muted">Diyar</span>
          <Button size="sm" variant="ghost" onClick={() => setD(Math.max(1, d - 1))}>−</Button>
          <Input type="number" min={1} max={500} value={d} style={{ width: '4.5rem' }}
            className="tnum py-1 text-center"
            onChange={(e) => setD(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          <Button size="sm" variant="ghost" onClick={() => setD(Math.min(500, d + 1))}>+</Button>
          {home ? (
            <Button size="sm" variant="ghost" className="ml-auto px-1.5 py-0.5"
              title="Kendi diyarıma dön"
              onClick={() => { setK(home.k); setD(home.d); }}>
              <img src="/assets/buildings/city.png" alt="" width={22} height={22}
                className="icon-shadow h-[22px] w-auto object-contain" />
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Diyar listesi" right="10 yuva">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="tex-header border-b-2 border-strong bg-panel-header text-on-panel-header">
                <Th className="w-8 text-center">#</Th>
                <Th>Şehir</Th>
                <Th>Oyuncu</Th>
                <Th className="hidden sm:table-cell">İttifak</Th>
                <Th className="w-12 text-center">Sıra</Th>
                {/* Mobilde sığmıyor → gizli; satıra tıklayınca seçenek listesi açılıyor. */}
                <Th className="hidden w-32 text-center sm:table-cell">Görev</Th>
              </tr>
            </thead>
            <tbody>
              {/* ⭐ İSKELET: diyar değişince veri gelene kadar AYNI yükseklikte 10 gri satır
                  çizilir. Önceden tablo boşalıp yeniden doluyordu ve ekran zıplıyordu. */}
              {slots.length === 0
                ? Array.from({ length: 10 }, (_, i) => (
                  <tr key={`sk${i}`} className={`h-9 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                    <Td className="tnum text-center text-muted">{i + 1}</Td>
                    <Td><Skeleton w="7rem" /></Td>
                    <Td><Skeleton w="5rem" /></Td>
                    <Td className="hidden sm:table-cell"><Skeleton w="4rem" /></Td>
                    <Td className="text-center"><Skeleton w="1.5rem" /></Td>
                    <Td className="hidden sm:table-cell"><Skeleton w="5rem" /></Td>
                  </tr>
                ))
                : null}
              {slots.map((slot, i) => {
                const c = slot.city;
                const shortcuts = shortcutsFor(slot, cityId);
                return (
                  <tr
                    key={slot.s}
                    onClick={() => setTarget({ slot })}
                    /* ⭐ Tüm satırlar EŞİT yükseklikte (`h-9`): boş yuva da dolu yuva kadar yer
                       kaplar, böylece 10 satır her ekranda aynı yüksekliği tutar. */
                    className={`h-9 cursor-pointer border-b border-border transition-colors hover:bg-raised ${
                      i % 2 === 1 ? 'bg-row-alt' : ''
                    } ${c?.isOwn ? 'text-accent' : 'text-ink'}`}
                  >
                    <Td className="tnum text-center text-muted">{slot.s}</Td>
                    <Td className="max-w-[9rem] truncate font-medium">
                      {c ? `${cityLabel(c.name)}${c.isCapital ? ' ★' : ''}` : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="max-w-[8rem] truncate">
                      {c ? c.username : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="hidden max-w-[8rem] truncate text-muted sm:table-cell">
                      {c?.alliance ?? '—'}
                    </Td>
                    <Td className="tnum text-center text-muted">{c?.rank ?? '—'}</Td>
                    <Td className="hidden sm:table-cell">
                      <span className="flex items-center justify-center gap-1">
                        {shortcuts.map((s) => (
                          <button
                            key={s.type}
                            title={s.label}
                            onClick={(e) => { e.stopPropagation(); setTarget({ slot, type: s.type }); }}
                            className="rounded-[var(--radius-sm)] p-0.5 transition-[filter] hover:brightness-125"
                          >
                            <MissionIcon id={s.icon} size={22} title={s.label} />
                          </button>
                        ))}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {target ? (
        <TargetModal
          slot={target.slot}
          coords={{ k, d }}
          initialType={target.type}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}
