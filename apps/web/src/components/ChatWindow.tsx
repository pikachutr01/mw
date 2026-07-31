/**
 * ⭐ SOHBET PENCERESİ (§13.12, kullanıcı tarifi 2026-07-31).
 *
 * Masaüstünde **sağ alt köşe penceresi** (Facebook tarzı), mobilde **bottom sheet**.
 * Aynı anda YALNIZ tek kişiyle sohbet edilir — sunucu da bunu zorlar (`chat:open` önce eski
 * kanaldan çıkar).
 *
 * ⚠️ `Modal` KULLANILMAZ, yalnız iskeleti taklit edilir. Sebep: `Modal` `body.overflow`u
 * kilitliyor ve dışarı tıklamada kapanıyor — sohbet **modeless** olmalı, oyuncu pencere
 * açıkken oyununu oynayabilmeli (geri sayımlar akmaya devam etmeli).
 *
 * ⚠️ Odak tuzağı: efektlerin bağımlılığı `[channelId]` — `onClose`/`open` gibi her render'da
 * kimliği değişen değerler KONMAZ. `Modal.tsx:29-40`'taki hata (yazarken imlecin kaybolması)
 * tam olarak buydu.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmt } from '../lib/hooks.ts';
import {
  closeChatChannel, onSocketEvent, openChatChannel, sendTyping,
} from '../lib/realtime.ts';
import {
  useBlockPlayer, useChatHistory, useClearConversation, useMarkChatRead, useReportChat,
  useSendChatMessage, type ChatMessage,
} from '../lib/queries.ts';
import { Button, ErrorBox, TextArea } from './ui.tsx';
import { useConfirm } from './Modal.tsx';

export interface ChatTarget {
  channelId: number;
  playerId: number;
  username: string;
  /** Bu oyuncuyu BEN engelledim mi? Liste sorgusundan gelir. */
  blocked?: boolean;
}

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** Sunucu hata kodu → oyuncuya gösterilecek metin. */
function messageForError(err: unknown): string {
  const code = (err as { body?: { code?: string } } | null)?.body?.code
    ?? (err as { code?: string } | null)?.code;
  switch (code) {
    /* ⚠️ Engellenen tarafa SEBEP söylenmez (kullanıcı kararı): bir şeyin ters gittiği anlaşılır
       ama "seni engelledi" bilgisi doğrulanmaz. */
    case 'blocked': return 'Mesajınız iletilemedi!';
    case 'blocked_by_me': return 'Bu oyuncuyu engelledin. Mesaj göndermek için engeli kaldır.';
    case 'rate_limited': return 'Çok hızlı yazıyorsun, birkaç saniye bekle.';
    case 'duplicate_message': return 'Aynı mesajı az önce gönderdin.';
    case 'dm_new_player_restricted':
      return (err as { body?: { message?: string } } | null)?.body?.message
        ?? 'Yeni konuşma başlatman için biraz beklemelisin.';
    default:
      return (err as Error | null)?.message ?? 'Mesaj gönderilemedi.';
  }
}

export function ChatWindow({ target, myId, onClose }: {
  target: ChatTarget;
  myId: number;
  onClose: () => void;
}) {
  const { channelId } = target;
  const history = useChatHistory(channelId);
  const send = useSendChatMessage(channelId);
  const markRead = useMarkChatRead();
  const clear = useClearConversation();
  const block = useBlockPlayer();
  const report = useReportChat();
  const confirm = useConfirm();

  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  /** Ters kaydırmada konum korumak için: eski sayfa eklenmeden önceki yükseklik. */
  const prevHeight = useRef(0);
  const lastTypingSent = useRef(0);

  /* Sunucu en YENİ mesajı önce döndürüyor; ekranda eskiden yeniye çizmek için ters çeviriyoruz. */
  const messages: ChatMessage[] = (history.data?.pages ?? [])
    .flatMap((p) => p.items)
    .slice()
    .reverse();

  /* ── Oda katılımı: pencere açıkken "yazıyor…" bu odadan akar ─────────────── */
  useEffect(() => {
    openChatChannel(channelId);
    return () => closeChatChannel();
  }, [channelId]);

  /* ── "yazıyor…" — kanal odasından gelen tek olay ─────────────────────────── */
  useEffect(() => {
    const off = onSocketEvent('chat:typing', (payload) => {
      if (Number(payload['channelId']) !== channelId) return;
      setPeerTyping(true);
      window.setTimeout(() => setPeerTyping(false), 3000);
    });
    return off;
  }, [channelId]);

  /**
   * ⭐ OKUNDU İŞARETİ — mesaj listesinin kendisine bağlı (2026-07-31).
   *
   * Önce WS aboneliğine bağlanmıştı ama bu, olayın iki kez (abonelik + `INVALIDATES`)
   * işlenmesine ve abonelik zamanlaması kaçtığında rozetin **sessizce** asılı kalmasına yol
   * açıyordu — canlı denemede tam olarak bu oldu. Şimdi tek ölçüt var: pencere açık, sekme
   * görünür ve listede yeni mesaj belirdi → okundu.
   *
   * ⚠️ Sunucunun "odada mı" diye bakmaması bilinçli: arka plandaki sekme de odadadır ama
   * oyuncu mesajı görmemiştir; okundu saymak mesajı sessizce kaybettirirdi.
   */
  const lastId = messages.length > 0 ? messages[messages.length - 1]!.id : 0;
  useEffect(() => {
    if (document.visibilityState !== 'visible') return;
    markRead.mutate(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, lastId]);

  /* ── Kaydırma: yeni mesajda dibe in, ESKİ sayfa eklenince konumu KORU ────── */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current > 0 && el.scrollHeight > prevHeight.current && el.scrollTop < 60) {
      // Yukarı kaydırıp eski sayfa yükledik → içerik büyüdü, kullanıcı aynı satırda kalsın.
      el.scrollTop = el.scrollHeight - prevHeight.current;
    } else {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
  }, [messages.length]);

  const onScroll = (): void => {
    const el = scroller.current;
    if (!el || el.scrollTop > 40) return;
    if (history.hasNextPage && !history.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      void history.fetchNextPage();
    }
  };

  const submit = (): void => {
    const body = draft.trim();
    if (body.length === 0 || send.isPending) return;
    send.mutate({ body, clientMsgId: crypto.randomUUID() }, { onSuccess: () => setDraft('') });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const onDraftChange = (v: string): void => {
    setDraft(v);
    const now = Date.now();
    if (now - lastTypingSent.current > 2500) {   // istemcide kısılır, sunucuyu yormaz
      lastTypingSent.current = now;
      sendTyping(channelId);
    }
  };

  return (
    /* Mobil: alta yapışık sayfa (dvh — URL çubuğu composer'ı kırpmasın).
       sm: sağ alt köşe penceresi. z-30: alt bar (20) üstünde, modal (40) altında. */
    <div
      role="dialog"
      aria-label={`${target.username} ile sohbet`}
      className="tex bevel fixed inset-x-0 bottom-0 z-30 flex h-[80dvh] flex-col overflow-hidden
        rounded-t-[var(--radius-lg)] border-2 border-strong bg-surface
        sm:inset-x-auto sm:right-3 sm:bottom-3 sm:h-[28rem] sm:w-80 sm:rounded-[var(--radius-md)]
        xl:right-[16.5rem]"
      style={{ boxShadow: 'var(--mw-shadow-md)' }}
    >
      <header className="tex-header flex shrink-0 items-center gap-2 border-b-2 border-strong
        bg-panel-header px-3 py-2 text-on-panel-header">
        <span className="display min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">
          {target.username}
        </span>
        <button type="button" aria-label="Sohbet menüsü" onClick={() => setMenuOpen((v) => !v)}
          className="px-1 text-lg leading-none hover:opacity-80">⋮</button>
        <button type="button" aria-label="Kapat" onClick={onClose}
          className="px-1 text-lg leading-none hover:opacity-80">×</button>
      </header>

      {menuOpen ? (
        <div className="shrink-0 border-b border-border bg-raised px-2 py-1.5 text-xs">
          <button type="button" className="block w-full px-1 py-1 text-left hover:text-accent"
            onClick={() => {
              setMenuOpen(false);
              void confirm({
                title: target.blocked ? 'Engeli kaldır' : 'Oyuncuyu engelle',
                body: target.blocked
                  ? `${target.username} sana yeniden mesaj gönderebilecek. Emin misiniz!`
                  : `${target.username} sana mesaj gönderemeyecek. Emin misiniz!`,
              }).then((ok) => {
                if (ok) block.mutate({ playerId: target.playerId, blocked: !target.blocked });
              });
            }}>
            {target.blocked ? 'Engeli kaldır' : 'Oyuncuyu engelle'}
          </button>
          <button type="button" className="block w-full px-1 py-1 text-left hover:text-accent"
            onClick={() => {
              setMenuOpen(false);
              void confirm({
                title: 'Şikayet Et',
                body: 'Bu sohbet MobiWar yöneticilerine şikayet edilecek. Emin misiniz!',
              }).then((ok) => { if (ok) report.mutate({ channelId, reason: 'abuse' }); });
            }}>Şikayet Et</button>
          <button type="button" className="block w-full px-1 py-1 text-left text-danger hover:opacity-80"
            onClick={() => {
              setMenuOpen(false);
              void confirm({
                title: 'Sohbeti sil',
                danger: true,
                body: 'Bu sohbet YALNIZ senin için silinecek; karşı tarafta görünmeye devam eder. Emin misiniz!',
              }).then((ok) => { if (ok) clear.mutate(channelId, { onSuccess: onClose }); });
            }}>Sohbeti sil</button>
        </div>
      ) : null}

      {/* ⚠️ `overscroll-contain`: gövde `overscroll-behavior:none` olduğu için, iç kaydırma
          sonuna gelince arkadaki sayfanın kaymaya başlamasını engeller. */}
      <div ref={scroller} onScroll={onScroll}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-2">
        {history.isFetchingNextPage ? (
          <div className="py-1 text-center text-[11px] text-muted">eski mesajlar yükleniyor…</div>
        ) : null}
        {history.isLoading ? (
          <div className="py-4 text-center text-xs text-muted">yükleniyor…</div>
        ) : messages.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            Henüz mesaj yok. İlk mesajı sen yaz.
          </div>
        ) : null}

        {messages.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm ${
                mine ? 'bg-accent text-on-accent' : 'border border-border bg-raised text-ink'
              }`}>
                <div className="break-words whitespace-pre-wrap">{m.body}</div>
                <div className={`mt-0.5 text-right text-[10px] ${mine ? 'opacity-75' : 'text-muted'}`}>
                  {timeOf(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}

        {peerTyping ? (
          <div className="text-[11px] text-muted">{target.username} yazıyor…</div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-1 border-t-2 border-strong bg-raised px-2.5 py-2">
        {send.isError ? (
          <ErrorBox error={new Error(messageForError(send.error))} />
        ) : null}
        {target.blocked ? (
          <div className="rounded-[var(--radius-sm)] border border-warning bg-warning/10 px-2 py-1 text-[11px] text-warning">
            Bu oyuncuyu engelledin. Mesaj göndermek için engeli kaldır.
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <TextArea
            value={draft} rows={1} maxLength={500} placeholder="Mesaj yaz…"
            aria-label="Mesaj"
            disabled={target.blocked}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="max-h-24 min-h-[2.25rem] resize-none"
          />
          <Button size="sm" disabled={draft.trim().length === 0 || send.isPending || target.blocked}
            onClick={submit}>Gönder</Button>
        </div>
        {draft.length > 400 ? (
          <div className="tnum text-right text-[10px] text-muted">{fmt(draft.length)}/500</div>
        ) : null}
      </div>
    </div>
  );
}
