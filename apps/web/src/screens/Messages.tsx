/**
 * MESAJLAR — raporlar + mesajlar, rozet sayacı (§10).
 *
 * ⭐ **Savaş animasyonu YOK** (kullanıcı kararı): rapor bir metin dökümüdür. Metnin kendisi
 * sunucuda `battles.result`'tan üretiliyor; burada yalnız gösteriliyor.
 *
 * ⭐ Rapor **modal**da açılır (kullanıcı kararı, açılır-kapanır liste değil) ve verisi
 * **her açılışta sunucudan** gelir — rapor bir savaşın kanıtı, bayat gösterilmemeli.
 *
 * ⭐ Okunmamış sayacı **iyimser** düşer: mesaja tıklandığı anda sol paneldeki rozet azalır,
 * sunucu yanıtı beklenmez (bkz. `useMarkRead`).
 */
import { useState } from 'react';
import { fmt } from '../lib/hooks.ts';
import { useBattle, useMarkRead, useMessages, type MessageRow } from '../lib/queries.ts';
import { Badge, Button, Empty, Panel, Res } from '../components/ui.tsx';
import { Modal } from '../components/Modal.tsx';

type Tab = 'reports' | 'messages';

const isReport = (m: MessageRow): boolean => m.kind.endsWith('_report');

export function Messages() {
  const messages = useMessages();
  const markRead = useMarkRead();
  // ⭐ Açılışta RAPORLAR seçili (kullanıcı kararı): oyuncunun ilk merak ettiği savaş sonucudur.
  const [tab, setTab] = useState<Tab>('reports');
  const [open, setOpen] = useState<MessageRow | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const all = messages.data?.items ?? [];
  const reports = all.filter(isReport);
  const plain = all.filter((m) => !isReport(m));
  const rows = tab === 'reports' ? reports : plain;

  const unreadIn = (list: MessageRow[]): number => list.filter((m) => !m.readAt).length;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);

  const openMessage = (m: MessageRow): void => {
    if (!m.readAt) markRead.mutate(m.id);
    setOpen(m);
  };

  return (
    <div className="space-y-3">
      <Panel title="Posta kutusu" right={`${messages.data?.unread ?? 0} okunmamış`}>
        <div className="flex gap-1 p-3">
          {([['reports', 'Raporlar', reports], ['messages', 'Mesajlar', plain]] as const).map(
            ([id, label, list]) => {
              const n = unreadIn(list as MessageRow[]);
              return (
                <button key={id} onClick={() => { setTab(id); setPage(0); }}
                  className={`relative flex-1 rounded-[var(--radius-sm)] border-2 px-2 py-1.5 text-xs ${
                    tab === id
                      ? 'border-strong bg-accent text-on-accent'
                      : 'border-border bg-surface text-muted hover:bg-raised'
                  }`}>
                  {label}
                  {n > 0 ? (
                    <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
                      {n}
                    </span>
                  ) : null}
                </button>
              );
            },
          )}
        </div>
      </Panel>

      <Panel title={tab === 'reports' ? 'Raporlar' : 'Mesajlar'}
        right={rows.length > 0 ? `${rows.length} kayıt` : undefined}>
        {visible.length === 0 ? (
          <Empty>{tab === 'reports' ? 'Hiç raporun yok.' : 'Hiç mesajın yok.'}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m, i) => (
              <li key={m.id} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                <button className="w-full px-3 py-2 text-left hover:bg-raised"
                  onClick={() => openMessage(m)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-1.5 text-sm ${
                      m.readAt ? 'text-muted' : 'font-semibold text-ink'
                    }`}>
                      {/* Okunmamış olan ilk bakışta belli olmalı: kalın + nokta. */}
                      {!m.readAt ? (
                        <span aria-label="okunmadı"
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                      ) : null}
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
                  </div>
                  <Summary m={m} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={current} pageCount={pageCount} pageSize={pageSize}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }}
        />
      </Panel>

      {open ? <MessageModal m={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** Sayfa başına kayıt sayısı DEĞİŞTİRİLEBİLİR (kullanıcı isteği); varsayılan 10. */
function Pagination({
  page, pageCount, pageSize, onPage, onPageSize,
}: {
  page: number; pageCount: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹</Button>
        <span className="tnum text-muted">{page + 1} / {pageCount}</span>
        <Button size="sm" variant="ghost" disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}>›</Button>
      </div>
      <label className="flex items-center gap-1 text-muted">
        Sayfa başına
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-[var(--radius-sm)] border border-border bg-raised px-1 py-0.5 text-xs text-ink">
          {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Listede tek satırlık özet — açmadan "ne oldu" sorusunun cevabı. */
function Summary({ m }: { m: MessageRow }) {
  const b = m.body ?? {};
  const loot = b['loot'] as { gold: number; food: number } | undefined;
  const lost = b['lost'] as number | undefined;

  const hasLoot = !!loot && (loot.gold > 0 || loot.food > 0);
  const bits: string[] = [];
  if (typeof lost === 'number') bits.push(`kayıp ${fmt(lost)}`);
  if (b['armyReturning'] === false) bits.push('ordudan kimse dönmedi');
  if (bits.length === 0 && !hasLoot) return null;

  return (
    <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
      {bits.map((t) => <span key={t}>{t}</span>)}
      {hasLoot ? (
        <>
          <Res kind="gold" value={fmt(loot!.gold)} size={13} />
          <Res kind="food" value={fmt(loot!.food)} size={13} />
        </>
      ) : null}
    </div>
  );
}

function MessageModal({ m, onClose }: { m: MessageRow; onClose: () => void }) {
  return (
    <Modal title={m.subject} onClose={onClose} width="lg"
      footer={<Button variant="ghost" onClick={onClose}>Kapat</Button>}>
      <div className="px-3 py-3">
        <div className="mb-2 text-[11px] text-muted">
          {new Date(m.at).toLocaleString('tr-TR')}
        </div>
        {m.battleId ? <BattleReport battleId={m.battleId} /> : <PlainBody m={m} />}
      </div>
    </Modal>
  );
}

/** Savaş dışı mesaj (dönüş raporu, sistem duyurusu). */
function PlainBody({ m }: { m: MessageRow }) {
  const b = m.body ?? {};
  const loot = b['loot'] as { gold: number; food: number } | undefined;
  const units = b['units'] as Record<string, number> | undefined;

  return (
    <div className="space-y-2 text-sm">
      {units && Object.keys(units).length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Dönen birlikler</div>
          <div className="text-ink">
            {Object.entries(units).map(([id, n]) => `${id} ${fmt(n)}`).join(' · ')}
          </div>
        </div>
      ) : null}
      {loot && (loot.gold > 0 || loot.food > 0) ? (
        <div className="flex items-center gap-2 text-ink">
          <span>Getirilen:</span>
          <Res kind="gold" value={fmt(loot.gold)} size={14} />
          <Res kind="food" value={fmt(loot.food)} size={14} />
        </div>
      ) : null}
    </div>
  );
}

function BattleReport({ battleId }: { battleId: number }) {
  const battle = useBattle(battleId);
  if (battle.isLoading) return <div className="py-2 text-xs text-muted">Rapor yükleniyor…</div>;
  if (battle.isError) return <div className="py-2 text-xs text-danger">Rapor okunamadı.</div>;
  if (!battle.data) return null;
  const r = battle.data;

  return (
    <div>
      <div className={`mb-3 text-sm font-semibold ${r.won ? 'text-success' : 'text-danger'}`}>
        {r.winner === 'draw' ? 'Berabere' : r.won ? 'Kazandın' : 'Kaybettin'} · {r.turns} tur
        {r.night ? ' · gece savaşı' : ''}
      </div>

      {r.sections.map((s) => (
        <div key={s.key} className="mb-3">
          <div className="mb-1 text-xs font-semibold text-muted uppercase">{s.title}</div>
          <div className="overflow-x-auto">
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
        </div>
      ))}

      {r.loot ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink">
          <span>{r.side === 'attacker' ? 'Ganimet:' : 'Yağmalanan:'}</span>
          <Res kind="gold" value={fmt(r.loot.gold)} size={14} />
          <Res kind="food" value={fmt(r.loot.food)} size={14} />
        </div>
      ) : null}

      {r.notes.map((n) => (
        <div key={n} className="text-xs text-muted">• {n}</div>
      ))}

      {/* Determinizm künyesi: "sonuç neden böyle" tartışmasında kanıt oyuncunun elinde (§5). */}
      <div className="mt-3 border-t border-border pt-2 text-[10px] text-muted">
        motor {r.provenance.engineVersion} · katalog {r.provenance.catalogHash} · seed {r.provenance.seed}
      </div>
    </div>
  );
}
