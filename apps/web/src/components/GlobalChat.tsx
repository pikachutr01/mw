/**
 * ⭐ GENEL SOHBET (§13.12, kullanıcı tarifi 2026-08-10) — **tek bileşen, iki kabuk.**
 *
 * `variant="card"` → masaüstünde sağ sütundaki panel (≥1280 px).
 * `variant="sheet"` → mobil/dar ekranda alttan açılan sayfa (`AllianceChatSheet` iskeleti).
 *
 * ⚠️⚠️ **İKİ AYRI BİLEŞEN YAZILMADI ve bu en önemli karar.** Mesaj listesi, ters kaydırma
 * sayfalaması, `@` önerisi, «yazıyor» şeridi, composer ve yönetici menüsü tamamen ortak;
 * ayrıştırsaydık ikisi kaçınılmaz olarak farklı davranmaya başlardı (bu kod tabanında aynı
 * hatanın izleri var: `CityStrip`/`InfoBar` font kararı iki kez öğrenildi). Değişen tek şey
 * dış kutu ve balon genişliği.
 *
 * ⚠️ **BAĞLIYKEN MOUNT, KOPUKKEN DEĞİL.** Bileşen yalnız bağlantı açıkken çiziliyor
 * (`global-chat-context.tsx`); söküldüğünde `global:chat:close` gidiyor → WS odası terk
 * ediliyor → hiçbir mesaj olayı gelmiyor, hiçbir sorgu dönmüyor. Yani *"bağlantıyı
 * kopardığında"* sessizlik bir bayrağa değil **yaşam döngüsüne** bağlı.
 * `variant="card"` bunun tek istisnası: kart kabuğu bağlı değilken de çiziliyor ama içi
 * yalnız yer tutucu ve «Sohbete Bağlan» düğmesi — hiçbir sorgu açmıyor.
 *
 * ⚠️ Efekt bağımlılıkları **yalnız `[channelId]`** — her render'da kimliği değişen değerler
 * KONMAZ (`Modal.tsx`teki odak-çalma hatası tam olarak buydu).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSession } from '../lib/api.ts';
import { useGlobalChatConnection } from '../lib/global-chat-context.tsx';
import { useDebounced, useTick } from '../lib/hooks.ts';
import { useAutoGrow } from '../lib/auto-grow.ts';
import { activeMentionQuery, applyMention, splitMentions } from '../lib/mentions.ts';
import {
  closeGlobalChat, onSocketEvent, openGlobalChat, sendGlobalTyping,
} from '../lib/realtime.ts';
import {
  useDeleteGlobalChatMessage, useGlobalChat, useGlobalChatHistory, useGlobalChatMute,
  useGlobalMentionSuggest, useSendGlobalChatMessage,
  type AllianceChatMessage,
} from '../lib/queries.ts';
import { MentionAutocomplete, type MentionItem } from './MentionAutocomplete.tsx';
import { useConfirm } from './Modal.tsx';
import { Button, ErrorBox, Panel, TextArea, TimeAgo } from './ui.tsx';

/** «Yazıyor» kaydının ömrü — `ChatWindow` ile aynı sayı (istemci 2,5 sn'de bir yayınlıyor). */
const TYPING_TTL_MS = 3000;

/** Sunucu hata kodu → oyuncuya gösterilecek metin (`AllianceChatSheet.messageForError` kalıbı). */
function messageForError(err: unknown): string {
  const body = (err as { body?: { code?: string; message?: string } } | null)?.body;
  switch (body?.code) {
    case 'rate_limited': return 'Çok hızlı yazıyorsun, birkaç saniye bekle.';
    case 'duplicate_message': return 'Aynı mesajı az önce gönderdin.';
    case 'slow_mode':
    case 'chat_banned':
    case 'global_account_too_new':
      /* ⚠️ Bu üçünde sunucu metni SÜRE taşıyor ("14 dakika daha…"); istemcide yeniden
         yazmak o bilgiyi kaybettirirdi. */
      return body.message ?? 'Mesaj gönderilemedi.';
    case 'global_disabled': return 'Genel sohbet şu an kapalı.';
    default:
      return (err as Error | null)?.message ?? 'Mesaj gönderilemedi.';
  }
}

export function GlobalChat({ variant }: { variant: 'card' | 'sheet' }) {
  const { connected, connect, disconnect } = useGlobalChatConnection();

  /* Kart kabuğu bağlı değilken de çizilir; sheet zaten yalnız bağlıyken mount oluyor. */
  if (variant === 'card' && !connected) {
    return (
      <Panel title="Genel Sohbet">
        <div className="space-y-2 p-3">
          <p className="text-xs leading-relaxed text-muted">
            Sohbet çevrimdışı. Bağlandığında son mesajlar yüklenir ve yeni mesajlar anında düşer.
          </p>
          <Button size="sm" className="w-full" onClick={connect}>Sohbete Bağlan</Button>
        </div>
      </Panel>
    );
  }

  return <Live variant={variant} onClose={disconnect} />;
}

/**
 * Bağlıyken çizilen gövde — **bütün sorgular ve WS odası burada**.
 *
 * ⚠️ Ayrı bir bileşen olması şart: kart kabuğunda `connected === false` iken bu ağaç hiç
 * mount olmamalı. Aynı bileşende `enabled` bayraklarıyla yönetseydik açılış paketi sorgusu
 * kapalıyken de kurulmuş (ve her bağlantı durumunda yeniden değerlendirilen) bir kanca olurdu.
 */
function Live({ variant, onClose }: { variant: 'card' | 'sheet'; onClose: () => void }) {
  /* ⭐ «12 dakika önce» damgalarının tazelenmesi için TEK zamanlayıcı (bkz. `TimeAgo`). */
  useTick();
  const packet = useGlobalChat(true);
  const channelId = packet.data?.channelId ?? null;
  const history = useGlobalChatHistory(channelId);
  const send = useSendGlobalChatMessage();
  const mute = useGlobalChatMute();
  const remove = useDeleteGlobalChatMessage();
  const confirm = useConfirm();

  const myId = getSession()?.playerId ?? 0;
  const isStaff = packet.data?.isStaff ?? false;
  const canWrite = packet.data?.canWrite ?? false;

  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [online, setOnline] = useState(0);
  /** playerId → { username, expires }. Süresi geçen kendiliğinden düşer (aşağıdaki tik). */
  const [typers, setTypers] = useState<Record<number, { username: string; at: number }>>({});

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  /** Ters kaydırmada konum korumak için: eski sayfa eklenmeden önceki yükseklik. */
  const prevHeight = useRef(0);
  const lastTypingSent = useRef(0);

  /* ⭐ Kutu içerikle birlikte yukarı doğru büyür (kullanıcı, 2026-08-11). */
  useAutoGrow(input, draft, scroller);

  /* Sunucu en YENİ mesajı önce döndürüyor; ekranda eskiden yeniye çizmek için ters çeviriyoruz. */
  const messages: AllianceChatMessage[] = (history.data?.pages ?? [])
    .flatMap((p) => p.items)
    .slice()
    .reverse();

  /* ── Oda katılımı: mesajlar YALNIZ bu oda açıkken akar ───────────────────── */
  useEffect(() => {
    if (channelId == null) return undefined;
    openGlobalChat(channelId);
    return () => closeGlobalChat();
  }, [channelId]);

  /* ── Kaç kişi bağlı — sunucu yalnız katılma/ayrılma anında yayınlıyor ─────── */
  useEffect(() => onSocketEvent('global:chat:presence', (payload) => {
    setOnline(Number(payload['count'] ?? 0));
  }), []);

  /**
   * ── «Kimler yazıyor» ──────────────────────────────────────────────────────
   *
   * ⚠️ Zamanlayıcı **kişi başına değil tek**: `ChatWindow`da her olay kendi 3 sn'lik
   * zamanlayıcısını kuruyordu ve hiçbiri iptal edilmiyordu — gösterge yanıp sönüyordu.
   * Burada kayıtların zaman damgası tutuluyor ve tek bir tik süresi geçenleri düşürüyor;
   * çok kişili bir odada bu, N zamanlayıcı kurmaktan hem doğru hem ucuz.
   */
  useEffect(() => onSocketEvent('global:chat:typing', (payload) => {
    const id = Number(payload['playerId'] ?? 0);
    const username = String(payload['username'] ?? '');
    if (!id || username === '') return;
    setTypers((prev) => ({ ...prev, [id]: { username, at: Date.now() } }));
  }), []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypers((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, v]) => now - v.at < TYPING_TTL_MS),
        );
        /* ⚠️ Değişiklik yoksa AYNI nesne döndürülüyor: her saniye yeni bir nesne üretmek,
           hiçbir şey yazılmıyorken bile bileşeni saniyede bir yeniden çizerdi. */
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  /* ── Kaydırma: yeni mesajda dibe in, ESKİ sayfa eklenince konumu KORU ────── */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current > 0 && el.scrollHeight > prevHeight.current && el.scrollTop < 60) {
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

  /* ── @ önerisi — DEBOUNCE'LU SUNUCU ARAMASI (kullanıcı şartı) ────────────── */
  const query = activeMentionQuery(draft, caret);
  /**
   * ⚠️ Gecikme sorgu ANAHTARINDA, isteğin kendisinde değil: `useDebounced` her tuşta değil
   * 250 ms sessizlikten sonra yeni bir `q` üretiyor, TanStack de aynı `q` için sonucu
   * önbellekte tutuyor. Böylece geri silip yeniden yazmak hiç istek üretmiyor.
   */
  const debouncedQuery = useDebounced(query?.text ?? '', 250);
  const suggest = useGlobalMentionSuggest(debouncedQuery, query != null);
  const suggestions: MentionItem[] = query == null ? [] : (suggest.data?.items ?? []);
  const suggestOpen = query != null && suggestions.length > 0;

  const pickMention = (m: MentionItem): void => {
    if (!query) return;
    const next = applyMention(draft, query, m.username);
    setDraft(next.value);
    setSuggestIndex(0);
    /* İmleci eklenen adın sonuna al — `setSelectionRange` render'dan SONRA çalışmalı. */
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  /**
   * ⭐ «YANITLA» — kullanıcı tarifi: *"bu ikona tıklayınca otomatik mention yapılır"*.
   *
   * ⚠️ Ayrı bir "yanıt" VERİ MODELİ yok: bu bir kısayol, yeni bir mesaj türü değil. Mention
   * zaten bildirimi de üretiyor, yani *"yazılan mesaj o kişiye sohbete bağlı değilse bildirim
   * olarak gider"* şartı ek kod olmadan sağlanıyor.
   * ⚠️ Ad taslağın BAŞINA ekleniyor ve zaten yazılmışsa tekrar edilmiyor.
   */
  const replyTo = (username: string | null): void => {
    if (username == null) return;
    const tag = `@${username} `;
    setDraft((prev) => (prev.startsWith(tag) ? prev : `${tag}${prev}`));
    requestAnimationFrame(() => {
      input.current?.focus();
      const end = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(end, end);
      setCaret(end);
    });
  };

  const submit = (): void => {
    const body = draft.trim();
    if (body.length === 0 || send.isPending || !canWrite) return;
    send.mutate({ body, clientMsgId: crypto.randomUUID() }, { onSuccess: () => setDraft('') });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    /* ⚠️ ÖNERİ AÇIKKEN `Enter` SEÇER, GÖNDERMEZ — sıra bozulursa yarım ad gönderilir. */
    if (suggestOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(suggestions[suggestIndex] ?? suggestions[0]!);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setCaret(-1); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const syncCaret = (el: HTMLTextAreaElement): void => setCaret(el.selectionStart ?? 0);

  const onDraftChange = (v: string, el: HTMLTextAreaElement): void => {
    setDraft(v);
    syncCaret(el);
    const now = Date.now();
    if (now - lastTypingSent.current > 2500) {   // istemcide kısılır, sunucuyu yormaz
      lastTypingSent.current = now;
      sendGlobalTyping();
    }
  };

  /* ── Yönetici aksiyonları ────────────────────────────────────────────────── */

  const doMute = (m: AllianceChatMessage): void => {
    setMenuFor(null);
    if (m.senderId == null) return;
    void confirm({
      title: 'Sohbette sustur',
      danger: true,
      body: `${m.senderName ?? 'Bu oyuncu'} genel sohbete bir daha yazamayacak. `
        + 'Susturmayı yönetim panelinden kaldırabilirsin. Emin misiniz!',
    }).then((ok) => {
      /* ⚠️ `minutes: null` = KALICI. Süreli susturma paneldeki «sohbet yasağı» formunda; oyun
         içindeki hızlı karar tek düğme olmalı, süre sormak akışı kesip anı kaçırırdı. */
      if (ok) mute.mutate({ playerId: m.senderId!, minutes: null, reason: 'Genel sohbet' });
    });
  };

  const doDelete = (m: AllianceChatMessage): void => {
    setMenuFor(null);
    void confirm({
      title: 'Mesajı kaldır',
      danger: true,
      body: 'Bu mesaj sohbetten kaldırılacak. Kayıt sunucuda kalır. Emin misiniz!',
    }).then((ok) => { if (ok) remove.mutate(m.id); });
  };

  /* ── Çizim ───────────────────────────────────────────────────────────────── */

  const blockedText = packet.data?.blockedText ?? null;
  const card = variant === 'card';
  const typing = Object.entries(typers)
    .filter(([id]) => Number(id) !== myId)
    .map(([, v]) => v.username);
  const typingText = typing.length === 0 ? ''
    : typing.length === 1 ? `${typing[0]} yazıyor…`
      : typing.length === 2 ? `${typing[0]} ve ${typing[1]} yazıyor…`
        : `${typing.length} kişi yazıyor…`;

  const body = (
    <>
      <div ref={scroller} onScroll={onScroll}
        className={`min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2.5 py-2 ${
          card ? 'max-h-72' : ''}`}>
        {history.isFetchingNextPage ? (
          <div className="py-1 text-center text-[11px] text-muted">eski mesajlar yükleniyor…</div>
        ) : null}
        {packet.isLoading || history.isLoading ? (
          <div className="py-4 text-center text-xs text-muted">yükleniyor…</div>
        ) : packet.isError ? (
          <ErrorBox error={new Error(messageForError(packet.error))} />
        ) : messages.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            Henüz mesaj yok. İlk sözü sen söyle.
          </div>
        ) : null}

        {messages.map((m, i) => {
          const mine = m.senderId === myId;
          const prev = messages[i - 1];
          /* WhatsApp grup mantığı: ardışık aynı gönderende başlık tekrarlanmaz. */
          const sameAsPrev = prev != null && prev.senderId === m.senderId;
          /* ⭐ Bana yapılan bahsetme balonun kendisini de vurgular — kalabalık bir odada
             kendini bulmak zor, kalın yazı tek başına yetmiyor. */
          const mentionsMe = m.mentions.some((x) => x.id === myId);

          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm ${
                card ? 'max-w-full' : 'max-w-[85%]'
              } ${
                mine
                  ? 'bg-accent text-on-accent'
                  : mentionsMe
                    ? 'border-2 border-accent bg-raised text-ink'
                    : 'border border-border bg-raised text-ink'
              } ${sameAsPrev ? 'mt-0' : 'mt-1.5'}`}>
                {!mine && !sameAsPrev ? (
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${
                      m.senderName ? 'text-accent' : 'text-muted'
                    }`}>
                      {/* ⚠️ Ekranda ham `id` ASLA görünmez (§13.14). */}
                      {m.senderName ?? 'kaldırılmış oyuncu'}
                    </span>
                    {m.senderName ? (
                      <button type="button" aria-label={`${m.senderName} kişisine yanıt ver`}
                        title="Yanıtla" onClick={() => replyTo(m.senderName)}
                        className="shrink-0 px-0.5 text-xs leading-none text-muted hover:text-accent">↩</button>
                    ) : null}
                  </div>
                ) : null}

                <div className="break-words whitespace-pre-wrap">
                  {/* ⚠️ PARSE YOK — sunucunun verdiği aralıklardan dilim alınıyor.
                      `dangerouslySetInnerHTML` kullanılmıyor, React kaçırıyor. */}
                  {splitMentions(m.body, m.mentions).map((part, k) => (
                    part.mentionId != null
                      ? (
                        <b key={k} className={part.mentionId === myId && !mine ? 'text-accent' : ''}>
                          {part.text}
                        </b>
                      )
                      : <span key={k}>{part.text}</span>
                  ))}
                </div>

                {/**
                  * ⭐⭐ `⋮` HER BALONDA, SAAT ŞERİDİNDE (kullanıcı bildirimi, 2026-08-11).
                  *
                  * ⚠️ Düğme 2026-08-09'a kadar gönderen adı başlığının İÇİNDEydi ve o başlık
                  * ardışık mesajlarda çizilmiyor (WhatsApp grup mantığı) — yani peş peşe yazan
                  * bir oyuncunun yalnız İLK mesajı kaldırılabiliyordu, sonrakilere hiç
                  * ulaşılamıyordu. Sunucu uçtan beri tek tek silebiliyordu; kilit yalnız buradaydı.
                  *
                  * ⚠️ Saat şeridi seçildi çünkü **koşulsuz çizilen tek satır** o: başlık `!mine`
                  * ve `!sameAsPrev` ister, gövde metne bağlı. Böylece kendi mesajını da
                  * kaldırabiliyorsun (sunucu zaten izin veriyordu, ekran vermiyordu).
                  * ⚠️ `opacity` ile soluyor, renkle DEĞİL: kendi balonun `bg-accent` üstünde
                  * `text-muted` okunmaz olurdu.
                  */}
                <div className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${
                  mine ? 'opacity-75' : 'text-muted'}`}>
                  {isStaff ? (
                    <button type="button" aria-label="Sohbet yönetimi" title="Sohbet yönetimi"
                      onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      className="-my-1 shrink-0 px-1 py-1 text-xs leading-none opacity-70 hover:opacity-100">
                      ⋮
                    </button>
                  ) : null}
                  <TimeAgo at={m.createdAt} />
                </div>

                {menuFor === m.id ? (
                  <div className="mt-1 rounded-[var(--radius-sm)] border border-border bg-surface px-1 py-1">
                    <button type="button" onClick={() => doDelete(m)}
                      className="block w-full px-1.5 py-0.5 text-left text-xs text-ink hover:text-accent">
                      Mesajı kaldır
                    </button>
                    {m.senderId != null && m.senderId !== myId ? (
                      <button type="button" onClick={() => doMute(m)}
                        className="block w-full px-1.5 py-0.5 text-left text-xs text-danger hover:opacity-80">
                        Sohbette sustur
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/**
        * ⭐ «YAZIYOR…» KENDİ ŞERİDİNDE, KAYDIRMA ALANININ DIŞINDA — `ChatWindow`da öğrenilen
        * kural (kullanıcı, 2026-08-09): satır mesajların arasındayken belirip kaybolması
        * dipteki son mesajı zıplatıyordu. Şerit **koşulsuz** çiziliyor, yalnız metni gidip
        * geliyor; yer daima ayrılı.
        */}
      <div aria-live="polite"
        className="h-4 shrink-0 truncate px-2.5 text-[11px] leading-4 text-muted">
        {typingText}
      </div>

      <div className="shrink-0 space-y-1 border-t-2 border-strong bg-raised px-2.5 py-2">
        {send.isError ? <ErrorBox error={new Error(messageForError(send.error))} /> : null}
        {mute.isError ? <ErrorBox error={new Error(messageForError(mute.error))} /> : null}
        {remove.isError ? <ErrorBox error={new Error(messageForError(remove.error))} /> : null}

        {/* ⚠️ Yazamama sebebi ÖNCEDEN söyleniyor. Kutuyu kapatmak, oyuncunun mesajı yazıp
            gönderdikten SONRA reddedilmesinden dürüst (`ChatWindow` ilkesi). */}
        {!canWrite && blockedText ? (
          <div className="rounded-[var(--radius-sm)] border border-warning bg-warning/10 px-2 py-1
            text-[11px] leading-relaxed text-warning">
            {blockedText}
          </div>
        ) : null}

        {suggestOpen ? (
          <MentionAutocomplete
            items={suggestions}
            active={suggestIndex}
            onActive={setSuggestIndex}
            onPick={pickMention}
            truncated={false}
          />
        ) : null}

        <div className="flex items-end gap-1.5">
          <TextArea
            ref={input}
            value={draft}
            rows={1}
            maxLength={500}
            placeholder={canWrite ? 'Mesaj yaz…  (@ ile etiketle)' : 'Şu an yazamazsın'}
            aria-label="Genel sohbet mesajı"
            disabled={!canWrite}
            onChange={(e) => onDraftChange(e.target.value, e.currentTarget)}
            onKeyUp={(e) => syncCaret(e.currentTarget)}
            onClick={(e) => syncCaret(e.currentTarget)}
            onKeyDown={onKeyDown}
            /* ⚠️ `max-h-24` emniyet ağı: `useAutoGrow` da aynı tavanı yazıyor, ama betik bir
               sebeple koşmazsa kutu sınırsız uzayıp mesaj listesini yutmasın. */
            className="max-h-24 min-h-[2.25rem] resize-none"
          />
          <Button size="sm" disabled={draft.trim().length === 0 || send.isPending || !canWrite}
            onClick={submit}>Gönder</Button>
        </div>
        {draft.length > 400 ? (
          <div className="tnum text-right text-[10px] text-muted">{draft.length}/500</div>
        ) : null}
      </div>
    </>
  );

  if (card) {
    return (
      <Panel
        title="Genel Sohbet"
        right={<span className="tnum text-[11px] opacity-80">{online} bağlı</span>}
      >
        <div className="flex max-h-[28rem] flex-col">
          {body}
          <button type="button" onClick={onClose}
            className="shrink-0 border-t border-border px-3 py-1.5 text-left text-[11px]
              text-muted hover:text-danger">
            Bağlantıyı Kes
          </button>
        </div>
      </Panel>
    );
  }

  return (
    /* Mobil: alta yapışık (dvh — URL çubuğu composer'ı kırpmasın).
       sm: ORTALANMIŞ geniş bottom sheet (`AllianceChatSheet` ile aynı ölçüler).
       z-30: alt bar (20) üstünde, modal (40) altında — onay modalı bunun ÜSTÜNE açılır. */
    <div
      role="dialog"
      aria-label="Genel sohbet"
      className="tex bevel fixed inset-x-0 bottom-0 z-30 flex h-[80dvh] flex-col overflow-hidden
        rounded-t-[var(--radius-lg)] border-2 border-strong bg-surface
        sm:inset-x-auto sm:bottom-3 sm:left-1/2 sm:h-[32rem] sm:w-[min(40rem,calc(100vw-2rem))]
        sm:-translate-x-1/2 sm:rounded-[var(--radius-md)]"
      style={{ boxShadow: 'var(--mw-shadow-md)' }}
    >
      <header className="tex-header flex shrink-0 items-center gap-2 border-b-2 border-strong
        bg-panel-header px-3 py-2 text-on-panel-header">
        <span className="display min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">
          Genel Sohbet
        </span>
        <span className="tnum shrink-0 text-[11px] opacity-80">{online} bağlı</span>
        <button type="button" aria-label="Kapat" onClick={onClose}
          className="px-1 text-lg leading-none hover:opacity-80">×</button>
      </header>
      {body}
    </div>
  );
}
