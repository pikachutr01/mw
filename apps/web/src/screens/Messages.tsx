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
import { describeUnits, nameOf } from '../lib/names.ts';
import { useBattle, useMarkRead, useMessages, type MessageRow } from '../lib/queries.ts';
import { Button, Empty, Panel, Res } from '../components/ui.tsx';
import { Modal } from '../components/Modal.tsx';
import { MissionIcon } from '../components/ui.tsx';

/**
 * ⭐ RAPOR TÜR KATALOĞU (kullanıcı, 2026-07-30): her rapor türünün kendi ikonu ve satır
 * başlığı var — Ordular sayfasıyla AYNI görev ikonları (yeşil/kırmızı varyantlar ayrı PNG).
 * Anahtar `kind:side`; `subject` artık ikinci satırda ayrıntı olarak yaşıyor.
 * `return_report` yalnız ESKİ kayıtlar için (dönüş artık rapor üretmiyor, bildirim üretiyor).
 */
const REPORT_TYPE: Record<string, { icon: string; title: string }> = {
  'battle_report:attacker': { icon: 'attack', title: 'Saldırı Raporu' },
  'battle_report:defender': { icon: 'attack_in', title: 'Saldırı Önleme Raporu' },
  'spy_report:spy': { icon: 'spy_out', title: 'Casusluk Raporu' },
  'spy_report:target': { icon: 'spy_back', title: 'Casusluk Önleme Raporu' },
  'transport_report:receiver': { icon: 'transport_back', title: 'Gelen Nakliye Raporu' },
  'transport_report:sender': { icon: 'transport_out', title: 'Giden Nakliye Raporu' },
  'support_report:receiver': { icon: 'support_out', title: 'Destek Raporu' },
  'found_city_report:owner': { icon: 'found_city', title: 'Şehir Kurma Raporu' },
  'return_report:owner': { icon: 'teleport', title: 'Ordu Döndü' },
};

function reportType(m: MessageRow): { icon: string | null; title: string } {
  const hit = REPORT_TYPE[`${m.kind}:${m.side ?? ''}`];
  if (hit) return hit;
  if (m.kind === 'system') return { icon: null, title: 'Sistem' };
  return { icon: null, title: m.subject };
}

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
            {visible.map((m, i) => {
              const t = reportType(m);
              const unread = !m.readAt;
              return (
                <li key={m.id} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                  {/* ⭐ Tür ikonlu satır (kullanıcı, 2026-07-30). Okunmamış: sol accent şerit
                      + hafif zemin + kalın başlık — eski "kalın + nokta" düzeninden daha net. */}
                  <button
                    className={`w-full px-3 py-2 text-left hover:bg-raised ${
                      unread ? 'border-l-2 border-danger bg-danger/5' : 'border-l-2 border-transparent'
                    }`}
                    onClick={() => openMessage(m)}
                  >
                    <div className="flex items-center gap-2.5">
                      {t.icon ? <MissionIcon id={t.icon} size={26} title={t.title} /> : (
                        <span className="inline-flex w-[26px] shrink-0 justify-center text-lg" aria-hidden>⚙</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${
                            unread ? 'font-semibold text-ink' : 'text-ink/80'
                          }`}>
                            {t.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                            {new Date(m.at).toLocaleString('tr-TR')}
                            {unread ? (
                              <span aria-label="okunmadı"
                                className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
                            ) : null}
                          </span>
                        </div>
                        {/* Ayrıntı satırı: sunucunun subject'i (tür başlığını tekrarlamıyorsa) */}
                        {m.subject && m.subject !== t.title ? (
                          <div className="truncate text-xs text-muted">{m.subject}</div>
                        ) : null}
                        <Summary m={m} />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
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

/**
 * Savaş dışı rapor (dönüş · nakliye · destek · casusluk · şehir kurma · sistem duyurusu).
 *
 * ⚠️ Birim adları **`nameOf` üzerinden** yazılır: ham `id` ekranda İngilizce görünürdü (§13.14).
 */
function PlainBody({ m }: { m: MessageRow }) {
  const b = m.body ?? {};
  if (m.kind === 'spy_report') {
    return m.side === 'target' ? <SpyDefenseBody body={b} /> : <SpyBody body={b} />;
  }

  const loot = b['loot'] as { gold: number; food: number } | undefined;
  const cargo = b['cargo'] as { gold: number; food: number } | undefined;
  const units = b['units'] as Record<string, number> | undefined;
  const coords = b['coordinates'] as { k: number; d: number; s: number } | undefined;
  const carried = loot ?? cargo;

  return (
    <div className="space-y-2 text-sm">
      {coords ? (
        <div className="tnum text-ink">Koordinat: {coords.k}:{coords.d}:{coords.s}</div>
      ) : null}
      {units && Object.keys(units).length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Birlikler</div>
          <div className="text-ink">{describeUnits(units, fmt)}</div>
        </div>
      ) : null}
      {carried && (carried.gold > 0 || carried.food > 0) ? (
        <div className="flex items-center gap-2 text-ink">
          <span>{m.kind === 'return_report' ? 'Getirilen:' : 'Taşınan:'}</span>
          <Res kind="gold" value={fmt(carried.gold)} size={14} />
          <Res kind="food" value={fmt(carried.food)} size={14} />
        </div>
      ) : null}
      {b['reason'] === 'slot_taken' ? (
        <div className="text-danger">Ordu varmadan önce oraya başka bir oyuncu şehir kurdu.</div>
      ) : null}
      {b['reason'] === 'city_limit' ? (
        <div className="text-danger">Şehir hakkın dolduğu için kurulamadı; ordu geri dönüyor.</div>
      ) : null}
    </div>
  );
}

/**
 * ⭐ CASUSLUK RAPORU — kademeli. Doküman: fark büyüdükçe daha çok bilgi gelir; bu yüzden
 * **eksik bölümler gösterilmez** (boş kutu değil, hiç yok) — oyuncu neyi göremediğini
 * "daha fazla kuş / daha yüksek Casusluk" mesajından anlar.
 */
/**
 * ⭐ CASUSLUK ÖNLEME RAPORU gövdesi (savunan tarafı) — alanları gönderen raporundan farklı:
 * birdsShot/birdsBlocked/leakedLevel. Savunan HER casuslukta bu raporu alır (2026-07-30).
 */
function SpyDefenseBody({ body }: { body: Record<string, unknown> }) {
  const sent = Number(body['birdsSent'] ?? 0);
  const shot = Number(body['birdsShot'] ?? 0);
  const blocked = Number(body['birdsBlocked'] ?? 0);
  const leaked = body['leakedLevel'] as string | null | undefined;
  const LEAK_LABEL: Record<string, string> = {
    resources: 'kaynak miktarı',
    economy: 'kaynak + Maden/Çiftlik seviyesi',
    armyTotals: '+ toplam savaşçı ve savunma sayısı',
    armyTypes: '+ birim tipleri',
    armyCounts: '+ savaşçıların tek tek sayıları',
    full: 'TAM RAPOR (teknikler + Kale/Sur/Kalkan dahil)',
  };
  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-muted">
        Şehrinin üstünde <b className="tnum text-ink">{fmt(sent)}</b> casus kuş uçtu
        {shot > 0 ? <span className="text-success"> · {fmt(shot)} tanesi vuruldu</span> : null}
        {blocked > 0 ? <span className="text-success"> · {fmt(blocked)} tanesi engellendi</span> : null}
      </div>
      {leaked ? (
        <div className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-2.5 py-2 text-xs text-danger">
          Rakip bilgi SIZDIRDI: {LEAK_LABEL[leaked] ?? leaked}.
        </div>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-success bg-success/10 px-2.5 py-2 text-xs text-success">
          Hiçbir bilgi sızmadı — casusluk tamamen engellendi.
        </div>
      )}
    </div>
  );
}

function SpyBody({ body }: { body: Record<string, unknown> }) {
  const intel = (body['intel'] ?? {}) as Record<string, unknown>;
  const res = intel['resources'] as { gold: number; food: number } | undefined;
  const eco = intel['economy'] as { mine: number; farm: number } | undefined;
  const totals = intel['totals'] as { warriors: number; defenses: number } | undefined;
  const warriors = intel['warriors'] as Record<string, number> | undefined;
  const defenses = intel['defenses'] as Record<string, number> | undefined;
  const wTypes = intel['warriorTypes'] as string[] | undefined;
  const dTypes = intel['defenseTypes'] as string[] | undefined;
  const techs = intel['techs'] as Record<string, number> | undefined;
  const structures = intel['structures'] as Record<string, number> | undefined;
  const lost = Number(body['birdsLost'] ?? 0);
  const sent = Number(body['birdsSent'] ?? 0);

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-muted">
        {fmt(sent)} casus kuş gönderildi
        {lost > 0 ? <span className="text-danger"> · {fmt(lost)} tanesi vuruldu</span> : ' · kayıp yok'}
        {Number(body['birdsBlocked'] ?? 0) > 0
          ? <span className="text-warning"> · {fmt(Number(body['birdsBlocked']))} tanesi engellendi</span> : null}
        {body['diff'] != null ? ` · etkin fark ${String(body['diff'])}` : ''}
      </div>

      {body['level'] == null ? (
        <div className="text-danger">Bilgi alınamadı — kuşlar ya vuruldu ya da rakip kuşlarca engellendi.</div>
      ) : null}

      {res ? (
        <Section title="Kaynak">
          <span className="flex items-center gap-3">
            <Res kind="gold" value={fmt(res.gold)} size={14} />
            <Res kind="food" value={fmt(res.food)} size={14} />
          </span>
        </Section>
      ) : null}

      {eco ? (
        <Section title="Ekonomi">
          <span className="tnum">Maden {eco.mine} · Çiftlik {eco.farm}</span>
        </Section>
      ) : null}

      {totals ? (
        <Section title="Ordu büyüklüğü">
          <span className="tnum">
            {fmt(totals.warriors)} savaşçı · {fmt(totals.defenses)} savunma ünitesi
          </span>
        </Section>
      ) : null}

      {warriors && Object.keys(warriors).length > 0 ? (
        <Section title="Savaşçılar">{describeUnits(warriors, fmt)}</Section>
      ) : wTypes && wTypes.length > 0 ? (
        <Section title="Savaşçı tipleri">{wTypes.map(nameOf).join(' · ')}</Section>
      ) : null}

      {defenses && Object.keys(defenses).length > 0 ? (
        <Section title="Savunma">{describeUnits(defenses, fmt)}</Section>
      ) : dTypes && dTypes.length > 0 ? (
        <Section title="Savunma tipleri">{dTypes.map(nameOf).join(' · ')}</Section>
      ) : null}

      {structures ? (
        <Section title="Yapılar">
          <span className="tnum">
            Kale {structures['castle'] ?? 0} · Sur {structures['wall'] ?? 0} ·
            {' '}Büyü Kalkanı {structures['magic_shield'] ?? 0}
          </span>
        </Section>
      ) : null}

      {techs && Object.keys(techs).length > 0 ? (
        <Section title="Teknikler">
          {Object.entries(techs).map(([id, lv]) => `${nameOf(id)} ${lv}`).join(' · ')}
        </Section>
      ) : null}

      {body['level'] != null && body['level'] !== 'full' ? (
        <div className="rounded-[var(--radius-sm)] border border-border px-2.5 py-2 text-[11px] text-muted">
          Daha fazla bilgi için <b>daha çok casus kuş</b> gönder ya da <b>Casusluk</b> tekniğini
          yükselt. Kuş sayısı ikinin kuvvetiyle sayılır: 8 kuş = +3 seviye, 16 kuş = +4.
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-semibold text-muted uppercase">{title}</div>
      <div className="text-ink">{children}</div>
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
