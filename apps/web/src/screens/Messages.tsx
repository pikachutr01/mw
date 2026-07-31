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
import {
  useAllianceDecide, useBattle, useChatConversations, useMarkRead, useMessages,
  type ChatConversation, type MessageRow, type ReportHeroLine,
} from '../lib/queries.ts';
import { useOpenChat } from '../lib/chat-context.tsx';
import { Button, Empty, ErrorBox, Panel, Res } from '../components/ui.tsx';
import { Modal } from '../components/Modal.tsx';
import { MissionIcon } from '../components/ui.tsx';

/**
 * ⭐ RAPOR TÜR KATALOĞU (kullanıcı, 2026-07-30): her rapor türünün kendi ikonu ve satır
 * başlığı var — Ordular sayfasıyla AYNI görev ikonları (yeşil/kırmızı varyantlar ayrı PNG).
 * Anahtar `kind:side`; `subject` artık ikinci satırda ayrıntı olarak yaşıyor.
 * `return_report` yalnız ESKİ kayıtlar için (dönüş artık rapor üretmiyor, bildirim üretiyor).
 */
const REPORT_TYPE: Record<string, { icon: string | null; title: string }> = {
  'battle_report:attacker': { icon: 'attack', title: 'Saldırı Raporu' },
  'battle_report:defender': { icon: 'attack_in', title: 'Saldırı Önleme Raporu' },
  'spy_report:spy': { icon: 'spy_out', title: 'Casusluk Raporu' },
  'spy_report:target': { icon: 'spy_back', title: 'Casusluk Önleme Raporu' },
  'transport_report:receiver': { icon: 'transport_back', title: 'Gelen Nakliye Raporu' },
  'transport_report:sender': { icon: 'transport_out', title: 'Giden Nakliye Raporu' },
  'support_report:receiver': { icon: 'support_out', title: 'Destek Raporu' },
  'found_city_report:owner': { icon: 'found_city', title: 'Şehir Kurma Raporu' },
  'return_report:owner': { icon: 'teleport', title: 'Ordu Döndü' },
  /* İttifak satırları Mesajlar sekmesinde yaşar (doküman: davetler mesaj kutusunda). */
  'alliance_invite:owner': { icon: null, title: 'İttifak Daveti' },
  'alliance_application:owner': { icon: null, title: 'İttifak Başvurusu' },
  'alliance_message:owner': { icon: null, title: 'İttifak Mesajı' },
};

function reportType(m: MessageRow): { icon: string | null; title: string } {
  const hit = REPORT_TYPE[`${m.kind}:${m.side ?? ''}`];
  if (hit) return hit;
  if (m.kind === 'system') return { icon: null, title: 'Sistem' };
  return { icon: null, title: m.subject };
}

type Tab = 'reports' | 'messages';

const isReport = (m: MessageRow): boolean => m.kind.endsWith('_report');

/**
 * ⭐ MESAJLAR SEKMESİ İKİ KAYNAKLI (kullanıcı kararı 2026-07-31): oyun mesajları (`messages`
 * tablosu — ittifak daveti/başvurusu/toplu mesaj/sistem) ile **DM sohbetleri** (`chat_*`)
 * TARİHE GÖRE TEK listede yaşar. Sunucuda birleştirme YOK: DM satırı `messages` tablosuna
 * yazılmaz (rapor kutusunu kirletmemesi için), iki sorgu burada birleşir.
 */
type InboxRow =
  | { kind: 'message'; at: string; unread: boolean; message: MessageRow }
  | { kind: 'chat'; at: string; unread: boolean; chat: ChatConversation };

export function Messages() {
  const messages = useMessages();
  const chats = useChatConversations();
  const markRead = useMarkRead();
  const openChat = useOpenChat();
  // ⭐ Açılışta RAPORLAR seçili (kullanıcı kararı): oyuncunun ilk merak ettiği savaş sonucudur.
  const [tab, setTab] = useState<Tab>('reports');
  const [open, setOpen] = useState<MessageRow | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const all = messages.data?.items ?? [];
  const reports = all.filter(isReport);
  const plain = all.filter((m) => !isReport(m));

  const reportRows: InboxRow[] = reports.map((m) => ({
    kind: 'message', at: m.at, unread: !m.readAt, message: m,
  }));
  const messageRows: InboxRow[] = [
    ...plain.map((m) => ({ kind: 'message' as const, at: m.at, unread: !m.readAt, message: m })),
    ...(chats.data?.items ?? []).map((c) => ({
      kind: 'chat' as const,
      at: c.lastMessageAt ?? new Date(0).toISOString(),
      unread: c.unreadCount > 0,
      chat: c,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const rows = tab === 'reports' ? reportRows : messageRows;

  const unreadIn = (list: InboxRow[]): number => list.filter((r) => r.unread).length;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);

  const openMessage = (m: MessageRow): void => {
    if (!m.readAt) markRead.mutate(m.id);
    setOpen(m);
  };

  return (
    <div className="space-y-3">
      <Panel title="Posta kutusu"
        right={`${(messages.data?.unread ?? 0) + (chats.data?.unread ?? 0)} okunmamış`}>
        <div className="flex gap-1 p-3">
          {([['reports', 'Raporlar', reportRows], ['messages', 'Mesajlar', messageRows]] as const).map(
            ([id, label, list]) => {
              const n = unreadIn(list as InboxRow[]);
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
            {visible.map((row, i) => {
              const alt = i % 2 === 1 ? 'bg-row-alt' : '';
              const shell = `w-full px-3 py-2 text-left hover:bg-raised ${
                row.unread ? 'border-l-2 border-danger bg-danger/5' : 'border-l-2 border-transparent'
              }`;

              /* ⭐ SOHBET SATIRI: tıklayınca pencere açılır (modal DEĞİL). Önizleme karşı
                 tarafın son mesajının satıra sığdığı kadarı (kullanıcı 2026-07-31). */
              if (row.kind === 'chat') {
                const c = row.chat;
                return (
                  <li key={`c${c.channelId}`} className={alt}>
                    <button className={shell} onClick={() => openChat(c.playerId, c.username)}>
                      <div className="flex items-center gap-2.5">
                        <img src="/assets/menu/mesaj.png" alt="" aria-hidden width={26} height={26}
                          className="icon-shadow h-[26px] w-[26px] shrink-0 object-contain" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${
                              row.unread ? 'font-semibold text-ink' : 'text-ink/80'
                            }`}>{c.username}</span>
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                              {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('tr-TR') : ''}
                              {c.unreadCount > 0 ? (
                                <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-on-accent">
                                  {c.unreadCount}
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <div className="truncate text-xs text-muted">
                            {c.lastFromMe ? 'Sen: ' : ''}{c.lastMessage ?? ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              }

              const m = row.message;
              const t = reportType(m);
              return (
                <li key={m.id} className={alt}>
                  {/* ⭐ Tür ikonlu satır (kullanıcı, 2026-07-30). Okunmamış: sol accent şerit
                      + hafif zemin + kalın başlık — eski "kalın + nokta" düzeninden daha net. */}
                  <button className={shell} onClick={() => openMessage(m)}>
                    <div className="flex items-center gap-2.5">
                      {t.icon ? <MissionIcon id={t.icon} size={26} title={t.title} /> : (
                        <span className="inline-flex w-[26px] shrink-0 justify-center text-lg" aria-hidden>⚙</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${
                            row.unread ? 'font-semibold text-ink' : 'text-ink/80'
                          }`}>
                            {t.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                            {new Date(m.at).toLocaleString('tr-TR')}
                            {row.unread ? (
                              <span aria-label="okunmadı"
                                className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
                            ) : null}
                          </span>
                        </div>
                        {/* Ayrıntı satırı: sunucunun subject'i (tür başlığını tekrarlamıyorsa).
                            ⭐ Ganimet/kayıp önizlemesi BİLEREK yok (kullanıcı 2026-07-30):
                            liste tek tip kalır, sayılar detay modalında. */}
                        {m.subject && m.subject !== t.title ? (
                          <div className="truncate text-xs text-muted">{m.subject}</div>
                        ) : null}
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

function MessageModal({ m, onClose }: { m: MessageRow; onClose: () => void }) {
  return (
    <Modal title={m.subject} onClose={onClose} width="lg"
      footer={<Button variant="ghost" onClick={onClose}>Kapat</Button>}>
      <div className="px-3 py-3">
        <div className="mb-2 text-[11px] text-muted">
          {new Date(m.at).toLocaleString('tr-TR')}
        </div>
        {m.battleId ? <BattleReport battleId={m.battleId} /> : <PlainBody m={m} onDone={onClose} />}
      </div>
    </Modal>
  );
}

/**
 * Savaş dışı rapor (dönüş · nakliye · destek · casusluk · şehir kurma · sistem duyurusu).
 *
 * ⚠️ Birim adları **`nameOf` üzerinden** yazılır: ham `id` ekranda İngilizce görünürdü (§13.14).
 */
function PlainBody({ m, onDone }: { m: MessageRow; onDone?: () => void }) {
  const b = m.body ?? {};
  if (m.kind === 'spy_report') {
    return m.side === 'target' ? <SpyDefenseBody body={b} /> : <SpyBody body={b} />;
  }
  if (m.kind === 'alliance_invite' || m.kind === 'alliance_application') {
    return <AllianceRequestBody m={m} onDone={onDone} />;
  }
  if (m.kind === 'alliance_message') {
    return (
      <div className="space-y-1 text-sm">
        <div className="text-xs text-muted">Gönderen: <b className="text-ink">{String(b['from'] ?? '')}</b></div>
        <p className="whitespace-pre-wrap">{String(b['text'] ?? '')}</p>
      </div>
    );
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
/**
 * ⭐ İTTİFAK DAVETİ / BAŞVURUSU — mesaj kutusunda Kabul/Red (orijinal t=8/9 akışı).
 * Karar `alliance_invites` durum makinesine gider; istek çoktan sonuçlandıysa sunucu 409
 * döner ve hata kutusunda görünür. Davet: kabul eden BEN katılırım. Başvuru: ben (yönetici)
 * başvuranı kabul ederim.
 */
function AllianceRequestBody({ m, onDone }: { m: MessageRow; onDone?: () => void }) {
  const b = m.body ?? {};
  const decide = useAllianceDecide();
  const inviteId = Number(b['inviteId'] ?? 0);
  const isInvite = m.kind === 'alliance_invite';
  return (
    <div className="space-y-2 text-sm">
      <p>
        {isInvite ? (
          <><b>{String(b['by'] ?? '')}</b> seni <b>{String(b['allianceName'] ?? '')}</b> ittifağına davet etti.</>
        ) : (
          <><b>{String(b['by'] ?? '')}</b>, <b>{String(b['allianceName'] ?? '')}</b> ittifağına başvuru gönderdi.</>
        )}
      </p>
      <ErrorBox error={decide.error} />
      {/* ⭐ Karar verilince modal KENDİLİĞİNDEN kapanır (kullanıcı 2026-07-30) — sonuç
          zaten listede/ittifak ekranında görünür, "İşlendi." yazısına bakakalmak yok. */}
      <div className="flex gap-2">
        <Button size="sm" disabled={inviteId <= 0 || decide.isPending}
          onClick={() => decide.mutate({ inviteId, accept: true }, { onSuccess: onDone })}>Kabul</Button>
        <Button size="sm" variant="danger" disabled={inviteId <= 0 || decide.isPending}
          onClick={() => decide.mutate({ inviteId, accept: false }, { onSuccess: onDone })}>Red</Button>
      </div>
    </div>
  );
}

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
  const coordText = (x: { k: number; d: number; s: number } | null): string =>
    x ? `${x.k}:${x.d}:${x.s}` : '—';
  const escaped = Object.entries(r.cave?.escaped ?? {}).filter(([, n]) => n > 0);

  return (
    <div>
      {/* Sonuç başlığı — orijinal oyunun kalıbı (k.java): "Kazandınız !" / "Kaybettiniz !" */}
      <div className={`display mb-1 text-base font-bold ${r.won ? 'text-success' : 'text-danger'}`}>
        {r.winner === 'draw' ? 'Berabere' : r.won ? 'Kazandınız !' : 'Kaybettiniz !'}
        <span className="ml-2 text-xs font-normal text-muted">
          {r.turns} tur{r.night ? ' · gece savaşı' : ''}
        </span>
      </div>
      {r.coords ? (
        <div className="tnum mb-3 text-xs text-muted">
          Kaynak: <b className="text-ink">{coordText(r.coords.origin)}</b>
          {' → '}Hedef: <b className="text-ink">{coordText(r.coords.target)}</b>
        </div>
      ) : null}

      {r.sections.map((s) => (
        <div key={s.key} className="mb-3">
          <div className="mb-1 text-xs font-semibold text-muted uppercase">{s.title}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted">
                  <th className="py-0.5 text-left font-normal">Birim</th>
                  <th className="py-0.5 text-right font-normal">Katılan</th>
                  <th aria-hidden />
                  <th className="py-0.5 text-right font-normal">Kalan</th>
                  <th className="py-0.5 text-right font-normal">Ölen</th>
                  <th aria-hidden />
                </tr>
              </thead>
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

      <HeroStrip title="Kahramanların" heroes={r.heroes.mine} />
      <HeroStrip title="Rakip kahramanlar" heroes={r.heroes.enemy} />
      {r.heroes.captured?.mine ? (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-success bg-success/10 px-2.5 py-2">
          <img src="/assets/hero/kahraman.png" alt="" width={34} height={34} />
          <div className="text-xs text-success">
            Savaştan yeni bir kahraman çıktı: <b>{r.heroes.captured.name}</b>!
          </div>
        </div>
      ) : null}

      {r.wall ? (
        <div className="mb-2 rounded-[var(--radius-sm)] border border-border bg-raised px-2.5 py-2 text-xs">
          <b className="text-ink">Sur</b>
          <span className="tnum ml-2 text-muted">seviye {r.wall.level}</span>
          {r.wall.destroyed ? (
            <span className="ml-2 font-semibold text-danger">YIKILDI</span>
          ) : r.wall.integrity != null ? (
            <span className="tnum ml-2 text-muted">· bütünlük %{Math.round(r.wall.integrity * 100)}</span>
          ) : null}
        </div>
      ) : null}

      {r.cave?.present ? (
        <div className="mb-2 rounded-[var(--radius-sm)] border border-border bg-raised px-2.5 py-2 text-xs">
          <b className="text-ink">Mağara</b>
          {r.cave.broken
            ? <span className="ml-2 font-semibold text-danger">YIKILDI</span>
            : <span className="ml-2 text-success">dayandı</span>}
          {/* Saldırana tek işe yarar sayı: bir dahaki sefere kaç cüce gerektiği. */}
          {r.side === 'attacker' && !r.cave.broken && r.cave.reason === 'not_enough_dwarves' ? (
            <span className="tnum ml-2 text-muted">
              (gereken {fmt(r.cave.required)} cüce · sağ kalan {fmt(r.cave.survivingDwarves)})
            </span>
          ) : null}
          {escaped.length > 0 ? (
            <div className="mt-1 text-muted">
              Mağaradaki askerler şehre yola çıktı:{' '}
              <span className="text-ink">
                {escaped.map(([id, n]) => `${fmt(n)} ${nameOf(id)}`).join(', ')}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {r.loot ? (
        <div className="mb-2 space-y-1 text-xs">
          <div className="flex items-center gap-2 text-ink">
            <span>{r.side === 'attacker' ? 'Ganimet:' : 'Yağmalanan:'}</span>
            <Res kind="gold" value={fmt(r.loot.gold)} size={14} />
            <Res kind="food" value={fmt(r.loot.food)} size={14} />
          </div>
          {/* Oyuncu isteği (mesajlar.txt): ortaya çıkan ile taşınabilen ayrı yazılsın. */}
          {r.lootBreakdown ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
              <span>Ortaya çıkan:</span>
              <Res kind="gold" value={fmt(r.lootBreakdown.revealed.gold)} size={13} />
              <Res kind="food" value={fmt(r.lootBreakdown.revealed.food)} size={13} />
              <span>· Taşınan:</span>
              <Res kind="gold" value={fmt(r.lootBreakdown.carried.gold)} size={13} />
              <Res kind="food" value={fmt(r.lootBreakdown.carried.food)} size={13} />
            </div>
          ) : null}
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

/** Kahraman kartları — Tapınak'taki görsel dil: portre + ad + seviye + durum rozeti. */
function HeroStrip({ title, heroes }: { title: string; heroes: ReportHeroLine[] }) {
  if (heroes.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold text-muted uppercase">{title}</div>
      <div className="flex flex-wrap gap-2">
        {heroes.map((h) => (
          <div key={h.name}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-raised px-2 py-1.5">
            <img src="/assets/hero/kahraman.png" alt="" width={34} height={34}
              className={h.alive ? '' : 'grayscale opacity-80'} />
            <div>
              <div className="text-xs font-medium text-ink">
                {h.name} <span className="text-muted">sv {h.level}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                {h.destroyed ? (
                  /* Orijinal kalıp (k.java): "Yok Edildi !" */
                  <span className="font-semibold text-danger">Yok Edildi !</span>
                ) : h.alive ? (
                  <span className="text-success">Sağ</span>
                ) : (
                  <span className="text-warning">Öldü</span>
                )}
                {h.xpGained > 0 ? (
                  <span className="tnum text-muted">+{fmt(h.xpGained)} tecrübe</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
