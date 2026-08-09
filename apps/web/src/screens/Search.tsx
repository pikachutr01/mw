/**
 * ⭐ ARAMA — Komuta Merkezi'nin dördüncü sekmesi (§13.18, orijinal ekran 107).
 *
 * Orijinalde Arama menüsü **iki maddeden** ibaretti (`g.java:2048-2054`): *Oyuncu Ara* ve
 * *İttifak Ara*. Oyuncu araması ayrıca **iki kipliydi** (`m.java:413-416`): ada göre ya da
 * koordinata göre. İkisi de burada.
 *
 * ⭐ Sonuç satırına tıklayınca **Dünya ekranının `TargetModal`'ı** açılıyor — orijinalde de
 * arama sonucunun menüsü, dünya haritası satırının menüsünün AYNISIYDI (`i.java:542`).
 * Böylece Saldırı/Casusluk/Nakliye/Destek/Mesaj/Davet aksiyonlarının hepsi bedava geliyor;
 * ikinci bir menü yazılmadı.
 *
 * ⚠️ **Arama yalnız BAŞKENT verir** (§13.16.5) — sunucu tarafında zorlanıyor.
 */
import { useState } from 'react';
import { USERNAME_MAX } from '@mobilwar/catalog';
import {
  useAllianceSearchTab, usePlayerSearch, type SearchAllianceRow, type SearchPlayerRow,
} from '../lib/queries.ts';
import { useDebounced } from '../lib/hooks.ts';
import { Button, Empty, Field, Input, Panel, Skeleton, Td, Th } from '../components/ui.tsx';
import { AllianceModal } from '../components/AllianceModal.tsx';
import { TargetModal } from './world-modal.tsx';

type Kind = 'player' | 'alliance';
type Mode = 'name' | 'coords';

export function SearchScreen(): React.ReactElement {
  const [kind, setKind] = useState<Kind>('player');

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {([['player', 'Oyuncu Ara'], ['alliance', 'İttifak Ara']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setKind(id)}
            className={`flex-1 rounded-[var(--radius-sm)] border-2 px-2 py-1.5 text-xs ${
              kind === id
                ? 'border-strong bg-accent text-on-accent'
                : 'border-border bg-surface text-muted hover:bg-raised'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {kind === 'player' ? <PlayerSearch /> : <AllianceSearch />}
    </div>
  );
}

/* ── Oyuncu ─────────────────────────────────────────────────────────────────── */

function PlayerSearch(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('name');
  const [name, setName] = useState('');
  const [k, setK] = useState('');
  const [d, setD] = useState('');
  const [s, setS] = useState('');
  const [target, setTarget] = useState<SearchPlayerRow | null>(null);

  /* ⚠️ Debounce + en az 2 karakter: eskiden ittifak aramasında ikisi de yoktu ve hızlı yazan
     oyuncu her tuşta bir HTTP isteği atıyordu. */
  const debouncedName = useDebounced(name, 300);
  const coordsReady = mode === 'coords' && k.trim() !== '' && d.trim() !== '';

  const q = usePlayerSearch(
    mode === 'name'
      ? { name: debouncedName }
      : { k: k.trim(), d: d.trim(), s: s.trim() },
    mode === 'name' ? debouncedName.trim().length >= 2 : coordsReady,
  );

  const rows = q.data?.items ?? [];

  return (
    <>
      <Panel
        title="Oyuncu Ara"
        right={
          <button className="text-[11px] underline hover:text-ink"
            onClick={() => setMode(mode === 'name' ? 'coords' : 'name')}>
            {mode === 'name' ? 'koordinata göre ara' : 'ada göre ara'}
          </button>
        }
      >
        <div className="p-3">
          {mode === 'name' ? (
            <Field label="Oyuncu adı (en az 2 karakter)">
              <Input value={name} maxLength={USERNAME_MAX} placeholder="Adın başlangıcı…"
                onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : (
            /* Orijinaldeki üç kutu: Kıta · Diyar · Üs (`g.java:1521-1523`). Üs boş bırakılırsa
               o diyarın dolu yerlerinin hepsi gelir. */
            <div className="flex gap-2">
              <Field label="Kıta"><Input value={k} inputMode="numeric" maxLength={2}
                onChange={(e) => setK(e.target.value)} /></Field>
              <Field label="Diyar"><Input value={d} inputMode="numeric" maxLength={3}
                onChange={(e) => setD(e.target.value)} /></Field>
              <Field label="Üs (boş = hepsi)"><Input value={s} inputMode="numeric" maxLength={2}
                onChange={(e) => setS(e.target.value)} /></Field>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Sonuçlar" right={q.data?.truncated ? 'İlk 20 kayıt gösteriliyor !' : undefined}>
        {q.isFetching ? <div className="p-3"><Skeleton w="12rem" /></div>
          : rows.length === 0 ? (
            <Empty>
              {mode === 'name'
                ? (debouncedName.trim().length < 2
                  ? 'Aramak için en az iki harf yaz.'
                  : 'Aramanla eşleşen oyuncu bulunamadı.')
                : (coordsReady ? 'Bu koordinatta şehir yok.' : 'Kıta ve diyar gir.')}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><Th>Sıra</Th><Th>Oyuncu</Th><Th>İttifak</Th><Th>Koordinat</Th><Th>{''}</Th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.k}:${r.d}:${r.s}`} className="border-t border-border">
                      <Td>{r.rank ?? '-'}</Td>
                      <Td>{r.username}{r.isOwn ? ' (sen)' : ''}</Td>
                      <Td>{r.alliance ?? '-'}</Td>
                      <Td className="tnum">{r.k}:{r.d}:{r.s}</Td>
                      <Td>
                        <Button variant="ghost" onClick={() => setTarget(r)}>Seç</Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      {/* ⭐ Dünya ekranının modalı: yedi aksiyon (saldırı/casusluk/nakliye/destek/mesaj/davet)
          buradan da bedava geliyor. */}
      {target ? (
        <TargetModal
          slot={{ s: target.s, city: target }}
          coords={{ k: target.k, d: target.d }}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

/* ── İttifak ────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ İttifak araması eskiden `Alliance.tsx`'te, YALNIZ ittifaksız oyuncuya görünüyordu
 * (`OutsiderView` içindeydi). Orijinalde herkes arayabiliyordu (`g.java:2051` — Arama menüsü
 * ittifak üyeliğine bakmıyor). Buraya taşınınca üye de arayabiliyor.
 *
 * ⭐ **Satır artık tıklanabilir** (2026-08-09): künye modalı açılıyor — metin, lider, üye
 * sayısı ve (uygunsa) BAŞVUR düğmesi. Eski *"İttifak ekranı"* düğmesi kaldırıldı: oyuncuyu
 * kendi ittifak sayfasına götürüyordu, yani aradığı ittifak hakkında hiçbir şey göstermiyordu.
 */
function AllianceSearch(): React.ReactElement {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const debounced = useDebounced(name, 300);
  const q = useAllianceSearchTab(debounced, debounced.trim().length >= 2);
  const rows: SearchAllianceRow[] = q.data?.items ?? [];

  return (
    <>
      <Panel title="İttifak Ara">
        <div className="p-3">
          <Field label="İttifak adı (en az 2 karakter)">
            <Input value={name} maxLength={USERNAME_MAX} placeholder="Adın başlangıcı…"
              onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Sonuçlar" right={q.data?.truncated ? 'İlk 20 kayıt gösteriliyor !' : undefined}>
        {q.isFetching ? <div className="p-3"><Skeleton w="12rem" /></div>
          : rows.length === 0 ? (
            <Empty>
              {debounced.trim().length < 2
                ? 'Aramak için en az iki harf yaz.'
                : 'Aramanla eşleşen ittifak bulunamadı.'}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><Th>Sıra</Th><Th>İttifak</Th><Th>Puan</Th><Th>Üye</Th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setPicked(r.id)}
                      className="cursor-pointer border-t border-border hover:bg-raised">
                      <Td>{r.rank ?? '-'}</Td>
                      <Td>{r.name}</Td>
                      <Td className="tnum">{r.score.toLocaleString('tr-TR')}</Td>
                      <Td className="tnum">{r.memberCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      {picked != null ? (
        <AllianceModal id={picked} onClose={() => setPicked(null)} />
      ) : null}
    </>
  );
}
