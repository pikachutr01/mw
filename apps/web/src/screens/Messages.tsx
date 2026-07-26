/**
 * MESAJLAR sekmesi — raporlar + mesajlar, rozet sayacı (§10).
 *
 * ⭐ **Savaş animasyonu YOK** (kullanıcı kararı): rapor bir metin dökümüdür. Metnin kendisi
 * sunucuda `battles.result`'tan üretiliyor; burada yalnız gösteriliyor.
 */
import { useState } from 'react';
import { fmt } from '../lib/hooks.ts';
import { useBattle, useMarkRead, useMessages, type MessageRow } from '../lib/queries.ts';
import { Badge, Button, Card, Empty, SectionTitle } from '../components/ui.tsx';

type Filter = 'all' | 'reports' | 'messages';

export function Messages() {
  const messages = useMessages();
  const markRead = useMarkRead();
  const [filter, setFilter] = useState<Filter>('all');
  const [openBattle, setOpenBattle] = useState<number | null>(null);

  const items = (messages.data?.items ?? []).filter((m) =>
    filter === 'all' ? true
      : filter === 'reports' ? m.kind.endsWith('_report')
        : !m.kind.endsWith('_report'));

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle right={`${messages.data?.unread ?? 0} okunmamış`}>Posta kutusu</SectionTitle>
        <div className="flex gap-1 px-3 pb-3">
          {([['all', 'Hepsi'], ['reports', 'Raporlar'], ['messages', 'Mesajlar']] as const).map(
            ([id, label]) => (
              <button key={id} onClick={() => setFilter(id)}
                className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs ${
                  filter === id ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted'
                }`}>
                {label}
              </button>
            ),
          )}
        </div>
      </Card>

      <Card>
        {items.length === 0 ? (
          <Empty>Hiç mesajın yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((m) => (
              <li key={m.id} className="px-3 py-2">
                <button
                  className="w-full text-left"
                  onClick={() => {
                    if (!m.readAt) markRead.mutate(m.id);
                    if (m.battleId) setOpenBattle(openBattle === m.battleId ? null : m.battleId);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm ${m.readAt ? 'text-muted' : 'font-semibold text-ink'}`}>
                      {m.subject}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {new Date(m.at).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {m.side === 'attacker' ? <Badge tone="warning">saldıran</Badge> : null}
                    {m.side === 'defender' ? <Badge tone="danger">savunan</Badge> : null}
                    {m.kind === 'return_report' ? <Badge tone="success">dönüş</Badge> : null}
                    {!m.readAt ? <Badge tone="danger">yeni</Badge> : null}
                  </div>
                  <Summary m={m} />
                </button>

                {openBattle && m.battleId === openBattle ? (
                  <BattleReport battleId={openBattle} onClose={() => setOpenBattle(null)} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Listede tek satırlık özet — açmadan "ne oldu" sorusunun cevabı. */
function Summary({ m }: { m: MessageRow }) {
  const b = m.body ?? {};
  const loot = b['loot'] as { gold: number; food: number } | undefined;
  const lost = b['lost'] as number | undefined;

  const bits: string[] = [];
  if (typeof lost === 'number') bits.push(`kayıp ${fmt(lost)}`);
  if (loot && (loot.gold > 0 || loot.food > 0)) {
    bits.push(`🪙 ${fmt(loot.gold)} · 🌾 ${fmt(loot.food)}`);
  }
  if (b['armyReturning'] === false) bits.push('ordudan kimse dönmedi');
  if (bits.length === 0) return null;
  return <div className="tnum mt-0.5 text-xs text-muted">{bits.join(' · ')}</div>;
}

function BattleReport({ battleId, onClose }: { battleId: number; onClose: () => void }) {
  const battle = useBattle(battleId);
  if (battle.isLoading) return <div className="py-2 text-xs text-muted">Rapor yükleniyor…</div>;
  if (!battle.data) return null;
  const r = battle.data;

  return (
    <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-sm font-semibold ${r.won ? 'text-success' : 'text-danger'}`}>
          {r.winner === 'draw' ? 'Berabere' : r.won ? 'Kazandın' : 'Kaybettin'} · {r.turns} tur
          {r.night ? ' · gece' : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={onClose}>Kapat</Button>
      </div>

      {r.sections.map((s) => (
        <div key={s.key} className="mb-2">
          <div className="mb-1 text-xs font-semibold text-muted uppercase">{s.title}</div>
          <table className="w-full text-xs">
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-1 text-ink">{l.name}</td>
                  <td className="tnum py-1 text-right text-muted">{fmt(l.before)}</td>
                  <td className="py-1 text-center text-muted">→</td>
                  <td className="tnum py-1 text-right text-ink">{fmt(l.after)}</td>
                  <td className="tnum py-1 text-right text-danger">−{fmt(l.lost)}</td>
                  <td className="tnum py-1 text-right text-success">
                    {l.restoredByFloor ? `taban +${l.restoredByFloor}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {r.loot ? (
        <div className="tnum mb-2 text-xs text-ink">
          {r.side === 'attacker' ? 'Ganimet' : 'Yağmalanan'}: 🪙 {fmt(r.loot.gold)} · 🌾 {fmt(r.loot.food)}
        </div>
      ) : null}

      {r.notes.map((n) => (
        <div key={n} className="text-xs text-muted">• {n}</div>
      ))}

      {/* Determinizm künyesi: "sonuç neden böyle" tartışmasında kanıt oyuncunun elinde (§5). */}
      <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted">
        motor {r.provenance.engineVersion} · katalog {r.provenance.catalogHash} · seed {r.provenance.seed}
      </div>
    </div>
  );
}
