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
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fmt } from '../lib/hooks.ts';
import { describeUnits, nameOf } from '../lib/names.ts';
import {
  useAllianceDecide, useBattle, useChatConversations, useCity, useClearConversation,
  useDeleteMessages, useMarkRead, useMessageBody, useMessages, useTemple,
  type ChatConversation, type MessageRow, type ReportHeroLine,
} from '../lib/queries.ts';
import { useOpenChat } from '../lib/chat-context.tsx';
import { useActiveCity } from '../lib/city-context.tsx';
import { HERO_SKILLS } from '../lib/hero-skills.ts';
import {
  intelIsTransferable, sideFromCity, sideFromIntel, writeSimPrefill, WARRIORS, type SpyHero,
} from '../lib/sim-prefill.ts';
import { Button, CatalogIcon, Empty, ErrorBox, Panel, Res } from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';
import { MissionIcon } from '../components/ui.tsx';
import { formatGameTime } from '@mobilwar/contracts';

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


/**
 * ⭐ MESAJLAR SEKMESİ İKİ KAYNAKLI (kullanıcı kararı 2026-07-31): oyun mesajları (`messages`
 * tablosu — ittifak daveti/başvurusu/toplu mesaj/sistem) ile **DM sohbetleri** (`chat_*`)
 * TARİHE GÖRE TEK listede yaşar. Sunucuda birleştirme YOK: DM satırı `messages` tablosuna
 * yazılmaz (rapor kutusunu kirletmemesi için), iki sorgu burada birleşir.
 */
type InboxRow =
  | { kind: 'message'; at: string; unread: boolean; message: MessageRow }
  | { kind: 'chat'; at: string; unread: boolean; chat: ChatConversation };

/** Seçim anahtarı — mesaj ve sohbet satırları aynı kümede yaşadığı için ön ek şart. */
const rowKey = (r: InboxRow): string =>
  (r.kind === 'chat' ? `c${r.chat.channelId}` : `m${r.message.id}`);

export function Messages() {
  // ⭐ Açılışta RAPORLAR seçili (kullanıcı kararı): oyuncunun ilk merak ettiği savaş sonucudur.
  const [tab, setTab] = useState<Tab>('reports');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // ⚠️ Sorgu sekmeye ve sayfaya BAĞLI: değişince gerçekten yeni bir istek gider (§sunucu sayfalama).
  const messages = useMessages({ kind: tab, page, pageSize });
  const chats = useChatConversations();
  const markRead = useMarkRead();
  const deleteMessages = useDeleteMessages();
  const clearConversation = useClearConversation();
  const openChat = useOpenChat();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<MessageRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /**
   * ⭐ SATIRLAR ARTIK SUNUCUDAN SAYFALI GELİYOR (kullanıcı, 2026-08-01).
   *
   * ⚠️ Sohbetler (`chat_*`) ayrı bir tablodan geliyor ve sayfalanmıyor — **bilerek**: DM
   * listesi doğası gereği kısa (aktif konuşmalar) ve iki kaynağı sunucuda birleştirmek
   * `messages ∪ chat_channels` gibi bir birleşim sorgusu ister; kazanç yok, karmaşa çok.
   * Sohbetler mesaj sekmesinde **ilk sayfada** listenin başına ekleniyor.
   */
  const serverRows: InboxRow[] = (messages.data?.items ?? []).map((m) => ({
    kind: 'message' as const, at: m.at, unread: !m.readAt, message: m,
  }));
  const chatRows: InboxRow[] = tab === 'messages' && page === 0
    ? (chats.data?.items ?? []).map((c) => ({
      kind: 'chat' as const,
      at: c.lastMessageAt ?? new Date(0).toISOString(),
      unread: c.unreadCount > 0,
      chat: c,
    }))
    : [];

  const visible = [...chatRows, ...serverRows]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const counts = messages.data?.counts;
  const total = messages.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);

  /**
   * ⚠️ Sayfa numarası aralık DIŞINA düşebiliyor: sunucudan gelen toplam küçülünce (arka planda
   * gelen bir tazeleme, başka sekmede silinen kayıtlar) son sayfada duran oyuncu boş listeye
   * bakıyor — sayfalayıcı `current` ile kelepçelenmiş bir sayı gösterirken sorgu hâlâ ham
   * `page`'i istiyordu. Durumu da geri çekiyoruz ki gösterilen sayfa ile getirilen sayfa
   * daima aynı olsun. (Silme sonrası zaten 0'a dönülüyor; bu, o yolun dışındaki hâller için.)
   */
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const openMessage = (m: MessageRow): void => {
    if (!m.readAt) markRead.mutate(m.id);
    setOpen(m);
  };

  /* ── Seçim ve silme (§1.1 "Sil" + "Hepsini Seç", `slMsj.do`) ─────────────────
   *
   * ⭐ Satırda ayrı bir çöp kutusu düğmesi YOK, kutucuk + tek "Sil" var. Sebep: satırın
   * kendisi tıklanabilir (rapor açılıyor) ve yanına yıkıcı bir düğme koymak yanlış tıklamayı
   * davet ederdi — üstelik silme geri alınamaz. Orijinalin modeli de bu ("Hepsini Seç" + Sil).
   *
   * ⚠️ **"Hepsini Seç" artık YALNIZ GÖRÜNEN SAYFAYI seçer** (kullanıcı, 2026-08-01). Eskiden
   * sekmenin tamamını seçiyordu ve bu, istemci bütün listeyi elinde tuttuğu için mümkündü.
   * Sayfalama sunucuya inince o kolaylık kayboldu — elimizde yalnız bu sayfa var. Kullanıcının
   * isteği de bu yönde: *"sadece ekranda görünen kayıtlar üzerinde seçsin"*. Silince eski
   * kayıtlar kendiliğinden bu sayfaya yükseliyor (sorgu tazeleniyor). */
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(rowKey(r)));

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(visible.map(rowKey)));
  };

  const removeSelected = async (): Promise<void> => {
    const picked = visible.filter((r) => selected.has(rowKey(r)));
    if (picked.length === 0) return;
    const messageIds = picked.filter((r) => r.kind === 'message').map((r) => r.message.id);
    const channelIds = picked.filter((r) => r.kind === 'chat').map((r) => r.chat.channelId);

    const ok = await confirm({
      title: `${picked.length} kayıt silinsin mi?`,
      danger: true,
      confirmLabel: 'Sil',
      body: (
        <div className="space-y-2">
          <p>Seçtiğin kayıtlar posta kutundan <b>kalıcı olarak</b> silinir.</p>
          {channelIds.length > 0 ? (
            <p className="text-muted">
              Sohbetler yalnız <b>senden</b> silinir; karşı tarafta aynen durur.
            </p>
          ) : null}
        </div>
      ),
    });
    if (!ok) return;

    if (messageIds.length > 0) await deleteMessages.mutateAsync(messageIds);
    for (const id of channelIds) await clearConversation.mutateAsync(id);
    setSelected(new Set());
    setPage(0);
  };

  /**
   * ⭐ DERİN BAĞLANTI `/messages?dm=<playerId>` (§7.2). Bildirim kataloğu DM bildirimlerine bu
   * adresi koyuyor; hem toast tıklaması hem işletim sistemi push'u AYNI yere düşsün diye.
   *
   * Sohbet penceresi ad ister ama bildirimden yalnız kimlik geliyor → ad, sohbet listesinden
   * çözülür. Bu yüzden liste yüklenene kadar beklenir. Adres, pencere açılınca temizlenir:
   * kalırsa oyuncu sekmeyi kapattığında pencere kendini tekrar tekrar açardı.
   */
  const dmParam = params.get('dm');
  useEffect(() => {
    if (!dmParam) return;
    const playerId = Number(dmParam);
    const known = (chats.data?.items ?? []).find((c) => c.playerId === playerId);
    if (!chats.data) return;                   // liste henüz gelmedi; gelince tekrar denenir
    setTab('messages');
    if (known) openChat(known.playerId, known.username);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('dm');
      return next;
    }, { replace: true });
  }, [dmParam, chats.data, openChat, setParams]);

  return (
    <div className="space-y-3">
      <Panel title="Posta kutusu"
        right={`${(messages.data?.unread ?? 0) + (chats.data?.unread ?? 0)} okunmamış`}>
        <div className="flex gap-1 p-3">
          {/* ⚠️ Rozet sayıları SUNUCUDAN (`counts`): sayfalama sunucuya inince istemcinin
              elinde artık tüm liste yok, "okunmamışları say" istemcide yapılamaz. Sohbetlerin
              okunmamışı ayrıca ekleniyor — o kaynak `messages` tablosunda değil. */}
          {([
            ['reports', 'Raporlar', counts?.unreadReports ?? 0],
            ['messages', 'Mesajlar', (counts?.unreadMessages ?? 0) + (chats.data?.unread ?? 0)],
          ] as const).map(
            ([id, label, n]) => {
              return (
                <button key={id} onClick={() => { setTab(id); setPage(0); setSelected(new Set()); }}
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
        right={total > 0 ? `${total} kayıt` : undefined}>
        {visible.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                className="h-4 w-4 accent-[var(--mw-color-accent)]" />
              Hepsini Seç
            </label>
            <Button size="sm" variant="danger"
              disabled={selected.size === 0 || deleteMessages.isPending}
              onClick={() => void removeSelected()}>
              {deleteMessages.isPending ? 'Siliniyor…' : `Sil${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <Empty>{tab === 'reports' ? 'Hiç raporun yok.' : 'Hiç mesajın yok.'}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((row, i) => {
              const key = rowKey(row);
              /**
               * ⭐ SATIR TEK PARÇA (kullanıcı, 2026-08-02). Üç ayrı kusur birlikte giderildi:
               *
               * ⚠️ 1. **Hover kutucuğu kapsamıyordu.** `hover:bg-raised` `<button>`deydi, kutucuk
               *    ise onun KARDEŞİ → soldaki ~28px (kenarlık + `ml-2.5` + kutucuk) hiçbir zaman
               *    zemin değiştirmiyordu; üstelik tam kutucuğun üstündeyken satır hiç tepki
               *    vermiyordu. Dolgu ve hover `<li>`ye taşındı, `<button>` dolgusuz kaldı.
               *
               * ⚠️ 2. **Karanlık temada hover görünmüyordu.** `--mw-color-row-alt` ile
               *    `--mw-color-surface-raised` karanlıkta AYNI renk (#2A2218) → tek satırlarda
               *    `hover:bg-raised` hiçbir şey yapmıyordu. Yarı saydam `bg-accent/10` altındaki
               *    zeminin üstüne biniyor, iki temada ve iki bantta da görünüyor.
               *
               * ⚠️ 3. **İki zemin sınıfı çakışıyordu.** Okunmamış + tek satırda `bg-row-alt` ve
               *    `bg-danger/5` aynı ögedeydi; kazanan Tailwind'in çıktı sırasıydı, yazım sırası
               *    değil. Artık tek zemin: okunmamışsa kırmızı ton, değilse bant.
               *
               * ⚠️ Kutucuk `<button>`ün DIŞINDA kalmaya devam ediyor: iç içe düğme geçersiz HTML
               * ve kutucuğa basınca raporun açılmaması gerekiyor.
               */
              const alt = `flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-accent/10 ${
                row.unread
                  ? 'border-l-2 border-danger bg-danger/5'
                  : `border-l-2 border-transparent ${i % 2 === 1 ? 'bg-row-alt' : ''}`
              }`;
              const shell = 'min-w-0 flex-1 text-left';
              const check = (
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)}
                  aria-label="Seç"
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--mw-color-accent)]" />
              );

              /* ⭐ SOHBET SATIRI: tıklayınca pencere açılır (modal DEĞİL). Önizleme karşı
                 tarafın son mesajının satıra sığdığı kadarı (kullanıcı 2026-07-31). */
              if (row.kind === 'chat') {
                const c = row.chat;
                return (
                  <li key={key} className={alt}>
                    {check}
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
                              {c.lastMessageAt ? formatGameTime(c.lastMessageAt) : ''}
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
                <li key={key} className={alt}>
                  {check}
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
                            {formatGameTime(m.at)}
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
          onPage={(p) => { setPage(p); setSelected(new Set()); }}
          onPageSize={(n) => { setPageSize(n); setPage(0); setSelected(new Set()); }}
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

/**
 * ⚠️ Gövde artık LİSTEDEN gelmiyor, modal açılınca ayrı çekiliyor (`useMessageBody`,
 * 2026-08-03). Sebep: liste ucu 60 saniyede bir dönüyordu ve gövdeleri de taşıyordu —
 * bir savaş raporunun ganimet/mağara dökümleri hiç kullanılmadan her dakika geliyordu.
 * Savaş raporu zaten böyle çalışıyordu (`useBattle`); diğer türler ona katıldı.
 */
function MessageModal({ m, onClose }: { m: MessageRow; onClose: () => void }) {
  // Savaş raporunun gövdesi `battles` kaydından geliyor; onda bu isteğe gerek yok.
  const detail = useMessageBody(m.battleId ? null : m.id);
  const body = detail.data?.body ?? null;
  const route = (body?.['route'] ?? null) as { origin?: Coord; target?: Coord } | null;

  /**
   * ⭐ SİMÜLATÖRE AKTAR (kullanıcı, 2026-08-07) — casusluk raporuna özel.
   *
   * Rakibin öğrenilen verisi SAVUNAN sütununa, oyuncunun kendi aktif şehri SALDIRAN sütununa
   * yazılır; iki taraf da tek tıkla dolar. Kendi tarafı olmadan aktarım yarım kalırdı —
   * kullanıcının şartı açıkça ikisini birden istiyor.
   *
   * ⚠️ Düğme neden gövdede değil FOOTER'da: bu bir **ekran değiştiren** eylem, raporun içeriği
   * değil. İttifak Kabul/Red düğmeleri gövdede çünkü raporun konusuyla ilgili — ayrım bu.
   * ⚠️ `Modal` footer'ı `justify-end gap-2`, yani bu düğme «Kapat»ın SOLUNA düşüyor.
   */
  const nav = useNavigate();
  const { cityId } = useActiveCity();
  const cityQ = useCity(cityId);
  const templeQ = useTemple(cityId);
  const intel = (body?.['intel'] ?? null) as Record<string, unknown> | null;
  const canTransfer = m.kind === 'spy_report' && m.side !== 'target'
    && intel != null && intelIsTransferable(intel);

  const toSimulator = (): void => {
    if (!intel) return;
    writeSimPrefill({
      v: 1,
      defender: sideFromIntel(intel),
      ...(cityQ.data && templeQ.data
        ? { attacker: sideFromCity(cityQ.data, templeQ.data, 'attacker') }
        : {}),
    });
    // ⚠️ ÖNCE KAPAT, SONRA GİT — oyuncu nereye düştüğünü görsün (`Command.tsx`'te yazılı kural).
    onClose();
    nav('/simulate');
  };

  return (
    <Modal title={m.subject} onClose={onClose} width="lg"
      footer={(
        <>
          {canTransfer ? (
            <Button size="sm" onClick={toSimulator}>Simülatöre Aktar</Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>Kapat</Button>
        </>
      )}>
      <div className="px-3 py-3">
        <div className="mb-2 text-[11px] text-muted">
          {formatGameTime(m.at)}
        </div>
        {/*
          Güzergâh TÜM raporlarda ve tek yerde — gövde tipine göre tekrarlanmıyor.
          ⚠️ Savaş raporu kendi koordinatını `battles` kaydından ayrıca alıyor (eski kayıtlarda
          `route` yok); orası `BattleReport` içinde degrade ediyor.
        */}
        {!m.battleId ? (
          <RouteLine origin={route?.origin} target={route?.target} onNavigate={onClose} />
        ) : null}

        {m.battleId ? (
          <BattleReport battleId={m.battleId} onNavigate={onClose} />
        ) : detail.isLoading ? (
          <div className="py-2 text-xs text-muted">Yükleniyor…</div>
        ) : detail.isError ? (
          <div className="py-2 text-xs text-danger">Mesaj okunamadı.</div>
        ) : (
          <PlainBody m={m} body={body ?? {}} onDone={onClose} />
        )}
      </div>
    </Modal>
  );
}

interface Coord { k: number; d: number; s: number; name?: string; owner?: string }

/**
 * ⭐ RAPOR GÜZERGÂHI — «kaynak → hedef», iki uç da TIKLANABİLİR (kullanıcı, 2026-08-02).
 *
 * Tıklayınca o diyar Dünya ekranında açılır (`/world/:k/:d`) ve **modal kapanır**: raporu
 * okuyup "peki bu nerede?" diye soran oyuncunun bir sonraki adımı zaten haritaya bakmak.
 * Modal açık kalsaydı altındaki ekranın değiştiğini görmezdi.
 *
 * ⚠️ Şehir NUMARASI (`s`) rotada yok — Dünya ekranı diyar listesi, şehir değil (§13.16).
 * Koordinatın tamamı yine yazılıyor, yalnız hedef bağlantı diyar düzeyinde.
 *
 * ⭐ OYUNCU ADI koordinatın yanında (kullanıcı, 2026-08-07) ve **düğmenin İÇİNDE**: ad ile
 * koordinat aynı şeyi işaret ediyor, ikisini ayırıp yalnız birini tıklanabilir yapmak
 * gereksiz bir ayrım olurdu.
 *
 * ⚠️ **Şehir adının yerini aldı.** 2026-08-04'ten 08-07'ye kadar burada `name` (şehir adı)
 * yazıyordu; kullanıcı raporu okuyan kişinin *"hangi şehir"* değil **"kim"** sorusunu
 * sorduğunu söyledi. Şehir adı sunucu tarafında `route.name` olarak hâlâ donduruluyor ve
 * `owner` YOKSA (o tarihten eski raporlar) ekran ona düşüyor — geçmiş raporlar adsız kalmıyor.
 * ⚠️ İkisi de olayın anına donmuş; boş koordinata şehir kurmada ikisi de yok, satır yalnız
 * koordinatı yazıyor.
 */
function RouteLine({ origin, target, onNavigate }: {
  origin?: Coord | null; target?: Coord | null; onNavigate?: () => void;
}) {
  const nav = useNavigate();
  if (!origin && !target) return null;

  const go = (c: Coord): void => {
    onNavigate?.();
    nav(`/world/${c.k}/${c.d}`);
  };

  const Part = ({ c }: { c: Coord | null | undefined }): React.ReactElement => (
    c ? (
      <button type="button" onClick={() => go(c)}
        title="Dünya'da göster"
        className="rounded-[var(--radius-sm)] px-1 font-semibold text-ink underline
          decoration-dotted underline-offset-2 transition-colors hover:bg-raised hover:text-accent">
        <span className="tnum">{c.k}:{c.d}:{c.s}</span>
        {/* ⚠️ `tnum` yalnız koordinatta: tablo rakamları ada uygulanınca harfler seyreliyor. */}
        {c.owner ?? c.name
          ? <span className="ml-1 font-normal">{c.owner ?? c.name}</span> : null}
      </button>
    ) : <span className="text-muted">—</span>
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
      <Part c={origin} />
      <span aria-hidden>→</span>
      <Part c={target} />
    </div>
  );
}

/**
 * Savaş dışı rapor (dönüş · nakliye · destek · casusluk · şehir kurma · sistem duyurusu).
 *
 * ⚠️ Birim adları **`nameOf` üzerinden** yazılır: ham `id` ekranda İngilizce görünürdü (§13.14).
 */
function PlainBody({ m, body, onDone }: {
  m: MessageRow; body: Record<string, unknown>; onDone?: () => void;
}) {
  const b = body;
  if (m.kind === 'spy_report') {
    return m.side === 'target' ? <SpyDefenseBody body={b} /> : <SpyBody body={b} />;
  }
  if (m.kind === 'alliance_invite' || m.kind === 'alliance_application') {
    return <AllianceRequestBody m={m} body={b} onDone={onDone} />;
  }
  if (m.kind === 'alliance_message') {
    return (
      <div className="space-y-1 text-sm">
        <div className="text-xs text-muted">Gönderen: <b className="text-ink">{String(b['from'] ?? '')}</b></div>
        <p className="whitespace-pre-wrap">{String(b['text'] ?? '')}</p>
      </div>
    );
  }
  /**
   * ⭐ SİSTEM DUYURUSU — yöneticiden gelen bildirim (kullanıcı isteği).
   *
   * ⚠️⚠️ **KOŞUL `kind` DEĞİL `text`.** `kind = 'system'` ZATEN kullanımda: ittifaktan
   * çıkarılma, liderlik devri, mağara girişinin iptali… Bu satırlar gövdelerinde metin
   * taşımıyor (`{allianceId, reason}` gibi yapısal alanlar taşıyorlar) ve türe bakan bir koşul
   * hepsini BOŞ bir kutuya çevirirdi. Tarayıcıda görüldü: dev kutusunda "İttifak başvurun
   * kabul edildi" satırı tam da bu duruma düşüyordu. Metni olan buraya girer, olmayan aşağıdaki
   * genel gövdeye devam eder.
   *
   * ⚠️ Gönderen **yazılmıyor**: kullanıcının şartı *"sistem tarafından gönderilmiş
   * gözükürler"*. Hangi yöneticinin yazdığı `audit_log`'ta duruyor, oyuncunun ekranında değil —
   * bir yönetici adının duyuruya iliştirilmesi onu kişisel bir mesaj gibi gösterirdi.
   *
   * ⚠️ Metin `whitespace-pre-wrap` ile ham yazılıyor: React zaten kaçırıyor, yani duyuruya
   * gömülü bir `<script>` metin olarak görünür. Markdown/HTML yorumlamak, panelden oyuncu
   * ekranına biçimlendirme enjekte edilebilen bir kanal açardı — duyuru için kazancı yok.
   */
  if (m.kind === 'system' && typeof b['text'] === 'string' && b['text'].trim() !== '') {
    return (
      <div className="rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2.5">
        <p className="whitespace-pre-wrap text-sm text-ink">{b['text']}</p>
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
          <UnitChips units={units} />
        </div>
      ) : null}
      {/* ⭐ Kahramanlar (kullanıcı, 2026-08-03): rapor yalnız birimleri yazıyordu — «9 casus
          kuş» görünüyor, kahramandan hiç söz edilmiyordu. Ayrı satır, çünkü kahraman bir
          "birim adedi" değil. */}
      {Array.isArray(b['heroes']) && (b['heroes'] as string[]).length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Kahraman</div>
          <div className="flex flex-wrap gap-1.5">
            {(b['heroes'] as string[]).map((name, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-[var(--radius-sm)]
                border border-border bg-raised px-1.5 py-1">
                <img src="/assets/hero/kahraman.png" alt="Kahraman" width={28} height={28}
                  className="icon-shadow shrink-0 object-contain" />
                <span className="truncate text-xs text-accent">{name}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {/*
        ⭐ TAŞINAN KAYNAK HEP YAZILIR (kullanıcı, 2026-08-07) — sıfır olsa bile.
        Eskiden koşul `gold > 0 || food > 0` idi ve kaynak götürmeyen bir destek raporunda satır
        HİÇ çıkmıyordu: oyuncu "kaynak da göndermiş miydim?" sorusuna raporda cevap bulamıyordu.
        ⚠️ Koşul artık ALANIN VARLIĞI: `cargo`/`loot` taşımayan gövdeler (ittifak daveti,
        sistem duyurusu) yine hiçbir şey çizmiyor — "0 altın 0 yemek" onlarda anlamsız olurdu.
      */}
      {carried ? (
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
function AllianceRequestBody({ m, body, onDone }: {
  m: MessageRow; body: Record<string, unknown>; onDone?: () => void;
}) {
  const b = body;
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
  /**
   * ⚠️ Bu etiketler `gatherIntel`in kademeleriyle AYNI ŞEYİ anlatmak zorunda: kapsam büyüyüp
   * etiket olduğu yerde kalırsa savunan "ne sızdı" sorusuna yanlış cevap alır. Kahraman ve
   * Teleport 2026-08-07'de eklendi ve buraya da yazıldı.
   */
  const LEAK_LABEL: Record<string, string> = {
    resources: 'kaynak miktarı',
    economy: 'kaynak + Maden/Çiftlik seviyesi',
    armyTotals: '+ toplam savaşçı ve savunma sayısı',
    armyTypes: '+ birim tipleri ve kahraman sayısı',
    armyCounts: '+ savaşçıların tek tek sayıları, kahramanların seviye ve yetenekleri',
    full: 'TAM RAPOR (teknikler + Kale/Sur/Kalkan/Mağara/Teleport seviyesi dahil)',
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
  const heroes = intel['heroes'] as SpyHero[] | undefined;
  const heroCount = intel['heroCount'] as number | undefined;
  const lost = Number(body['birdsLost'] ?? 0);
  const sent = Number(body['birdsSent'] ?? 0);

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-muted">
        {fmt(sent)} casus kuş gönderildi
        {lost > 0 ? <span className="text-danger"> · {fmt(lost)} tanesi vuruldu</span> : ' · kayıp yok'}
        {Number(body['birdsBlocked'] ?? 0) > 0
          ? <span className="text-warning"> · {fmt(Number(body['birdsBlocked']))} tanesi engellendi</span> : null}
        {/* ⚠️ «etkin fark» sayısı 2026-08-02'de kaldırıldı (kullanıcı): iç hesabın ara
            değeriydi, oyuncuya hiçbir şey anlatmıyordu. Sunucu `diff`i göndermeye devam
            ediyor — dengelemede işimize yarıyor, yalnız ekranda yazmıyor. */}
      </div>

      {/* ⚠️ Sebep AÇIKLANMIYOR (kullanıcı, 2026-08-03). Metin *"kuşlar ya vuruldu ya da rakip
          kuşlarca engellendi"* diyordu; zaten üstteki satırda kaç kuşun vurulduğu ve kaçının
          engellendiği yazıyor — tekrarın ötesinde, hangi ihtimalin gerçekleştiğini bilmediğimiz
          için cümle de belirsizdi. */}
      {body['level'] == null ? (
        <div className="text-danger">Bilgi alınamadı.</div>
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

      {/*
        ⭐ KAHRAMANLAR (§13.11.6, kullanıcı 2026-08-07) — iki kademeye yayılıyor:
        `armyCounts`ta her kahramanın seviyesi ve dört yeteneği, bir alt kademede yalnız SAYI.
        ⚠️ **Kahraman YOKSA bölüm hiç çizilmiyor** (kullanıcı, 2026-08-07): kısa bir süre
           «Kahraman yok» yazılıyordu, kullanıcı raporu kalabalıklaştırdığı için kaldırttı.
           Bu, casusluk raporunun genel kuralına da uyuyor — eksik bölüm boş kutu değil, YOK.
        ⚠️ Eski raporlarda bu anahtarlar hiç yok → yine hiçbir şey çizilmez, göç gerekmiyor.
      */}
      {heroes && heroes.length > 0 ? (
        <Section title="Kahramanlar">
          <div className="space-y-1">
            {heroes.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{h.name}</span>
                <span className="text-xs text-muted">Seviye {h.level}</span>
                {HERO_SKILLS.map((s) => (
                  <span key={s.key} className="flex items-center gap-1" title={s.label}>
                    <img src={`/assets/hero/${s.icon}.png`} alt={s.label} width={16} height={16} />
                    <span className="text-xs tnum">{h.skills?.[s.key] ?? 0}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Section>
      ) : typeof heroCount === 'number' && heroCount > 0 ? (
        <Section title="Kahramanlar">{fmt(heroCount)} kahraman</Section>
      ) : null}

      {structures ? (
        <Section title="Yapılar">
          <span className="tnum">
            Kale {structures['castle'] ?? 0} · Sur {structures['wall'] ?? 0} ·
            {' '}Büyü Kalkanı {structures['magic_shield'] ?? 0} ·
            {/* ⚠️ Yalnız SEVİYE. Mağaranın içindeki askerler casusa GÖRÜNMEZ — mağaranın
                bütün varlık sebebi orduyu saklamak (`mission.handlers.ts` gatherIntel). */}
            {' '}Mağara {structures['cave'] ?? 0}
            {/* ⚠️ Teleport 0 iken YAZILMAZ: ön şartı Kale 12 + Mimar Okulu 12 + Büyücülük 12,
                yani oyuncuların ezici çoğunluğunda yok ve her rapora «Teleport 0» eklemek
                gürültü olurdu. Diğerleri koşulsuz yazılıyor — onlar herkeste var. */}
            {Number(structures['teleport'] ?? 0) > 0
              ? <> · Teleport {structures['teleport']}</> : null}
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

/**
 * ⭐ BİRİM KARTLARI (kullanıcı, 2026-08-07) — rapor gövdesinde «Cüce 120 · Elf 30» yerine
 * her birim kendi görseliyle bir kart.
 *
 * Kullanıcının şikâyeti destek raporundaydı: noktayla ayrılmış düz metin, oyunun her yerinde
 * görseliyle görünen birimleri raporda anonim bir listeye çeviriyordu.
 *
 * ⚠️ **Sıra katalogtan** (`WARRIORS` → `WARRIOR_ORDER`), `Object.entries`in rastgele sırası
 * değil: Baraka ve Ordular ekranı da aynı sırayı kullanıyor, rapor onlardan ayrışmamalı.
 * Katalogda olmayan bir id (eski kayıt) sona düşer, gizlenmez.
 * ⚠️ `flex-wrap` + `min-w-0`+`truncate`: dar telefonda kartlar alt satıra iniyor, uzun bir ad
 * kartı taşırmıyor. Sabit sütunlu bir ızgara 320 px'te taşardı.
 */
function UnitChips({ units }: { units: Record<string, number> }) {
  const order = new Map(WARRIORS.map((u, i) => [u.id as string, i]));
  const rows = Object.entries(units)
    .filter(([, n]) => n > 0)
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999));
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map(([id, n]) => (
        <span key={id} className="flex items-center gap-1.5 rounded-[var(--radius-sm)]
          border border-border bg-raised px-1.5 py-1">
          <CatalogIcon kind="units" id={id} size={28} alt={nameOf(id)} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] leading-tight text-muted">{nameOf(id)}</span>
            <span className="tnum block text-xs leading-tight font-semibold text-ink">{fmt(n)}</span>
          </span>
        </span>
      ))}
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

function BattleReport({ battleId, onNavigate }: { battleId: number; onNavigate?: () => void }) {
  const battle = useBattle(battleId);
  if (battle.isLoading) return <div className="py-2 text-xs text-muted">Rapor yükleniyor…</div>;
  if (battle.isError) return <div className="py-2 text-xs text-danger">Rapor okunamadı.</div>;
  if (!battle.data) return null;
  const r = battle.data;
  const escaped =Object.entries(r.cave?.escaped ?? {}).filter(([, n]) => n > 0);

  return (
    <div>
      {/* Sonuç başlığı — orijinal oyunun kalıbı (k.java): "Kazandınız !" / "Kaybettiniz !" */}
      <div className={`display mb-1 text-base font-bold ${r.won ? 'text-success' : 'text-danger'}`}>
        {r.winner === 'draw' ? 'Berabere' : r.won ? 'Kazandınız !' : 'Kaybettiniz !'}
        {/*
          ⭐ GECE = YALNIZ AY SİMGESİ (kullanıcı, 2026-08-05): *"Sadece kazanan veya kaybeden
          yazısının yanında ay simgesi olması yeterli, tooltip çıkmasına da gerek yok."*
          Önceden burada "· gece savaşı", notlarda da "vuruş gücü düştü (Gece Görüşü etkili)"
          yazıyordu — ikisi de kalktı.
          ⚠️ `title` bilerek YOK; kullanıcı tooltip de istemiyor. Simge yine de ekran
          okuyucuya sessiz kalmasın diye `aria-label` taşıyor.
        */}
        {r.night ? <span className="ml-1.5" aria-label="gece savaşı">🌙</span> : null}
        <span className="ml-2 text-xs font-normal text-muted">{r.turns} tur</span>
      </div>
      {/* Diğer raporlarla aynı görünüm ve aynı davranış: tıklanınca Dünya'da açılır. */}
      <RouteLine origin={r.coords?.origin} target={r.coords?.target} onNavigate={onNavigate} />

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

      {/*
        Determinizm künyesi: "sonuç neden böyle" tartışmasında kanıt oyuncunun elinde (§5).
        ⚠️ Etiketler (motor/katalog/seed) 2026-08-02'de kaldırıldı: oyuncunun bu değerleri
        OKUMASI gerekmiyor, yalnız **bize iletebilmesi** gerekiyor. O yüzden künye artık
        sağa yaslı, küçük ve tek tıkla kopyalanıyor.
      */}
      <ProvenanceLine p={r.provenance} />
    </div>
  );
}

/**
 * Determinizm künyesi — motor sürümü · katalog hash'i · RNG tohumu.
 *
 * ⚠️ Etiketsiz ve küçük: oyuncu bu değerleri anlamak zorunda değil, yalnız bir tartışmada
 * bize **iletebilmeli**. Bu yüzden asıl işlev kopyalama; okunabilirlik ikincil.
 *
 * ⚠️ `navigator.clipboard` güvenli olmayan kökende (düz `http://`, `localhost` hariç)
 * TANIMSIZDIR — bu yüzden çağrı korumalı ve hata yutuluyor: kopyalanamaması raporu
 * bozmamalı.
 */
function ProvenanceLine({ p }: { p: { seed: number; engineVersion: string; catalogHash: string } }) {
  const [copied, setCopied] = useState(false);
  const text = `${p.engineVersion} · ${p.catalogHash} · ${p.seed}`;

  const copy = (): void => {
    void navigator.clipboard?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => { /* kopyalanamadı — sessiz geç */ });
  };

  return (
    <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border pt-2
      text-[9px] leading-none text-muted/70">
      <span className="tnum truncate">{text}</span>
      <button type="button" onClick={copy}
        title={copied ? 'Kopyalandı' : 'Kopyala'} aria-label="Rapor künyesini kopyala"
        className="shrink-0 rounded-[var(--radius-sm)] p-0.5 transition-colors hover:bg-raised
          hover:text-ink">
        {copied ? (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
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
                {!h.alive ? (
                  /* Orijinal kalıp (k.java): "Yok Edildi !" — 2026-08-01'den beri ölen her
                     kahramanın tek etiketi (ordusu sağ kalsa da kalmasa da eve dönüyor). */
                  <span className="font-semibold text-danger">Yok Edildi !</span>
                ) : (
                  <span className="text-success">Sağ</span>
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
