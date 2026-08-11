/**
 * ⭐ İTTİFAK SOHBETİ — bottom sheet (§13.15c, kullanıcı tarifi 2026-08-07).
 *
 * WhatsApp grup sohbeti mantığı: gönderen adı + çevrimiçi noktası, ardışık mesajlarda başlık
 * tekrarlanmaz, `@` ile bahsetme kalın görünür. Masaüstünde de **bottom sheet** (kullanıcı
 * kararı) — DM'in sağ-alt penceresinden geniş ve ortalanmış, çünkü grup sohbeti bir satırda
 * ad + durum + saat + yönetim düğmesi taşımak zorunda.
 *
 * ⚠️ **`Modal` KULLANILMIYOR**, yalnız iskeleti taklit ediliyor (`ChatWindow.tsx` ile aynı
 * gerekçe): `Modal` `body.overflow`u kilitliyor ve dışarı tıklamada kapanıyor.
 *
 * ⚠️ **KAPALIYKEN SIFIR KAYNAK** (kullanıcı şartı). Bu bileşen unmount olunca:
 *   • `alliance:chat:close` gider → WS odası terk edilir → hiçbir mesaj olayı gelmez,
 *   • `useAllianceChat(enabled)` kapanır → hiçbir istek gitmez.
 * Yani sessizlik bir bayrağa değil, bileşenin yaşam döngüsüne bağlı.
 *
 * ⚠️ Efekt bağımlılıkları **yalnız `[channelId]`** — `onClose` gibi her render'da kimliği
 * değişen değerler KONMAZ (`Modal.tsx`teki odak-çalma hatası tam olarak buydu).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTick } from '../lib/hooks.ts';
import { useAutoGrow } from '../lib/auto-grow.ts';
import { closeAllianceChat, openAllianceChat } from '../lib/realtime.ts';
import { canDeleteAllianceMessage, canMuteAllianceMember } from '../lib/chat-moderation.ts';
import {
  activeMentionQuery, applyMention, splitMentions, suggestMentions,
} from '../lib/mentions.ts';
import {
  useAllianceChat, useAllianceChatHistory, useAllianceChatMute, useAllianceChatUnmute,
  useDeleteAllianceChatMessage,
  useSendAllianceChatMessage, type AllianceChatMember, type AllianceChatMessage,
} from '../lib/queries.ts';
import { getSession } from '../lib/api.ts';
import { AllianceChatMuteModal } from './AllianceChatMuteModal.tsx';
import { MentionAutocomplete, type MentionItem } from './MentionAutocomplete.tsx';
import { useConfirm } from './Modal.tsx';
import { Button, ErrorBox, TextArea, TimeAgo } from './ui.tsx';

/** Sunucu hata kodu → oyuncuya gösterilecek metin (`ChatWindow.messageForError` kalıbı). */
function messageForError(err: unknown): string {
  const body = (err as { body?: { code?: string; message?: string } } | null)?.body;
  switch (body?.code) {
    case 'rate_limited': return 'Çok hızlı yazıyorsun, birkaç saniye bekle.';
    case 'duplicate_message': return 'Aynı mesajı az önce gönderdin.';
    case 'slow_mode':
    case 'alliance_muted':
    case 'alliance_new_member_restricted':
    case 'chat_banned':
      /* ⚠️ Bu dördünde sunucu metni SÜRE taşıyor ("14 dakika daha…"); istemcide yeniden
         yazmak o bilgiyi kaybettirirdi. */
      return body.message ?? 'Mesaj gönderilemedi.';
    case 'alliance_chat_disabled': return 'İttifak sohbeti şu an kapalı.';
    case 'not_alliance_member': return 'Bir ittifakta değilsin.';
    case 'mute_hierarchy':
    case 'mute_self':
    case 'not_muted':
    /* ⭐ Mesaj kaldırmanın iki reddi (2026-08-11): rütbe yetmiyor · mesaj zaten kalkmış. */
    case 'delete_hierarchy':
    case 'not_found':
    case 'forbidden':
      return body.message ?? 'Bu işlemi yapamazsın.';
    default:
      return (err as Error | null)?.message ?? 'Mesaj gönderilemedi.';
  }
}

export function AllianceChatSheet({ onClose }: { onClose: () => void }) {
  /* ⭐ «12 dakika önce» damgalarının tazelenmesi için TEK zamanlayıcı (bkz. `TimeAgo`). */
  useTick();
  const packet = useAllianceChat(true);
  const channelId = packet.data?.channelId ?? null;
  const history = useAllianceChatHistory(channelId);
  const send = useSendAllianceChatMessage();
  const mute = useAllianceChatMute();
  const unmute = useAllianceChatUnmute();
  const remove = useDeleteAllianceChatMessage();
  const confirm = useConfirm();

  const myId = getSession()?.playerId ?? 0;
  const myRole = packet.data?.myRole ?? 0;

  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [muteTarget, setMuteTarget] = useState<AllianceChatMember | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  /** Ters kaydırmada konum korumak için: eski sayfa eklenmeden önceki yükseklik. */
  const prevHeight = useRef(0);

  /* ⭐ Kutu içerikle birlikte yukarı doğru büyür (kullanıcı, 2026-08-11). */
  useAutoGrow(input, draft, scroller);

  const members = useMemo(() => packet.data?.members ?? [], [packet.data]);
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.playerId, m])),
    [members],
  );

  /* Sunucu en YENİ mesajı önce döndürüyor; ekranda eskiden yeniye çizmek için ters çeviriyoruz. */
  const messages: AllianceChatMessage[] = (history.data?.pages ?? [])
    .flatMap((p) => p.items)
    .slice()
    .reverse();

  /* ── Oda katılımı: mesajlar YALNIZ bu oda açıkken akar ───────────────────── */
  useEffect(() => {
    if (channelId == null) return undefined;
    openAllianceChat(channelId);
    return () => closeAllianceChat();
  }, [channelId]);

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

  /* ── @ önerisi ───────────────────────────────────────────────────────────── */
  const query = activeMentionQuery(draft, caret);
  const suggestions = query ? suggestMentions(members, query.text) : [];
  const suggestOpen = query != null && suggestions.length > 0;

  /* ⚠️ Parametre `MentionItem` (dar tip): kutu artık genel sohbetle paylaşılıyor ve yalnız
     `username` okuyor. `AllianceChatMember` istemek, kutunun sözleşmesini gereksizce
     daraltıp derleyiciyi kırardı (contravariance). */
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

  const canWrite = packet.data?.canWrite ?? false;

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

  /* ── Susturma aksiyonları ────────────────────────────────────────────────── */

  const doMute = (v: { minutes: number | null; reason?: string }): void => {
    if (!muteTarget) return;
    mute.mutate(
      { playerId: muteTarget.playerId, minutes: v.minutes, reason: v.reason },
      { onSuccess: () => setMuteTarget(null) },
    );
  };

  const doUnmute = (m: AllianceChatMember): void => {
    setMenuFor(null);
    void confirm({
      title: 'Susturmayı Kaldır',
      body: `${m.username} ittifak sohbetine yeniden yazabilecek. Emin misiniz!`,
    }).then((ok) => { if (ok) unmute.mutate(m.playerId); });
  };

  /** ⭐ Mesajı kaldır (2026-08-11) — genel sohbetteki `doDelete`in birebir ikizi. */
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

  return (
    <>
      {/* Mobil: alta yapışık (dvh — URL çubuğu composer'ı kırpmasın).
          sm: ORTALANMIŞ ve geniş bottom sheet (kullanıcı kararı; DM'in sağ-alt penceresi değil).
          z-30: alt bar (20) üstünde, modal (40) altında — susturma modalı bunun ÜSTÜNE açılır. */}
      <div
        role="dialog"
        aria-label="İttifak sohbeti"
        className="tex bevel fixed inset-x-0 bottom-0 z-30 flex h-[80dvh] flex-col overflow-hidden
          rounded-t-[var(--radius-lg)] border-2 border-strong bg-surface
          sm:inset-x-auto sm:bottom-3 sm:left-1/2 sm:h-[32rem] sm:w-[min(40rem,calc(100vw-2rem))]
          sm:-translate-x-1/2 sm:rounded-[var(--radius-md)]"
        style={{ boxShadow: 'var(--mw-shadow-md)' }}
      >
        <header className="tex-header flex shrink-0 items-center gap-2 border-b-2 border-strong
          bg-panel-header px-3 py-2 text-on-panel-header">
          <span className="display min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">
            İttifak Sohbeti
          </span>
          <span className="shrink-0 text-[11px] opacity-80">
            {members.filter((m) => m.online).length}/{members.length} çevrimiçi
          </span>
          <button type="button" aria-label="Kapat" onClick={onClose}
            className="px-1 text-lg leading-none hover:opacity-80">×</button>
        </header>

        <div ref={scroller} onScroll={onScroll}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2.5 py-2">
          {history.isFetchingNextPage ? (
            <div className="py-1 text-center text-[11px] text-muted">eski mesajlar yükleniyor…</div>
          ) : null}
          {packet.isLoading || history.isLoading ? (
            <div className="py-4 text-center text-xs text-muted">yükleniyor…</div>
          ) : packet.isError ? (
            <ErrorBox error={new Error(messageForError(packet.error))} />
          ) : messages.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">
              Henüz mesaj yok. İttifağına ilk sözü sen söyle.
            </div>
          ) : null}

          {messages.map((m, i) => {
            const mine = m.senderId === myId;
            const prev = messages[i - 1];
            /* WhatsApp grup mantığı: ardışık aynı gönderende başlık tekrarlanmaz. */
            const sameAsPrev = prev != null && prev.senderId === m.senderId;
            const member = m.senderId == null ? undefined : memberById.get(m.senderId);
            /* ⭐ Menünün iki kalemi AYRI kapılardan geçiyor: silme mesaja, susturma üyeye
               uygulanıyor — ayrılmış üyenin mesajı kaldırılabilir ama kendisi susturulamaz. */
            const canDelete = canDeleteAllianceMessage({
              myId, myRole, senderId: m.senderId, senderRole: member?.role ?? null,
            });
            const canMute = canMuteAllianceMember({ myId, myRole, member });
            /* ⭐ Bana yapılan bahsetme balonun kendisini de vurgular — grup sohbetinde
               kendini bulmak zor, kalın yazı tek başına yetmiyor. */
            const mentionsMe = m.mentions.some((x) => x.id === myId);

            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm ${
                  mine
                    ? 'bg-accent text-on-accent'
                    : mentionsMe
                      ? 'border-2 border-accent bg-raised text-ink'
                      : 'border border-border bg-raised text-ink'
                } ${sameAsPrev ? 'mt-0' : 'mt-1.5'}`}>
                  {!mine && !sameAsPrev ? (
                    <div className="mb-0.5 flex items-center gap-1.5">
                      {/* ⚠️ Ayrılan üye roster'da YOK → nokta çizilmez. "Bilinmiyor" ile
                          "çevrimdışı" aynı şey değil; kırmızı nokta yalan söylerdi. */}
                      {member ? (
                        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          member.online ? 'bg-success' : 'bg-muted/50'
                        }`} />
                      ) : null}
                      <span className={`truncate text-xs font-semibold ${
                        member ? 'text-accent' : 'text-muted'
                      }`}>
                        {/* ⚠️ Ekranda ham `id` ASLA görünmez (§13.14). */}
                        {m.senderName ?? 'kaldırılmış oyuncu'}
                      </span>
                      {member?.muted ? (
                        <span className="shrink-0 text-[10px] text-danger">susturuldu</span>
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
                    * ⚠️ Düğme gönderen adı başlığının İÇİNDEydi ve o başlık ardışık mesajlarda
                    * çizilmiyor (WhatsApp grup mantığı) → peş peşe yazan bir üyenin yalnız İLK
                    * mesajında menü çıkıyordu. Genel sohbetteki hatanın birebir aynısı.
                    *
                    * ⚠️ Saat şeridi seçildi çünkü **koşulsuz çizilen tek satır** o: başlık
                    * `!mine` ve `!sameAsPrev` ister. Böylece kendi mesajını da kaldırabiliyorsun.
                    * ⚠️ `opacity` ile soluyor, renkle DEĞİL: kendi balonun `bg-accent` üstünde
                    * `text-muted` okunmaz olurdu.
                    */}
                  <div className={`mt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${
                    mine ? 'opacity-75' : 'text-muted'}`}>
                    {canDelete || canMute ? (
                      <button type="button" title="Sohbet yönetimi"
                        aria-label={member ? `${member.username} için sohbet yönetimi` : 'Sohbet yönetimi'}
                        onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                        className="-my-1 shrink-0 px-1 py-1 text-xs leading-none opacity-70 hover:opacity-100"
                      >⋮</button>
                    ) : null}
                    <TimeAgo at={m.createdAt} />
                  </div>

                  {menuFor === m.id ? (
                    <div className="mt-1 rounded-[var(--radius-sm)] border border-border bg-surface px-1 py-1">
                      {canDelete ? (
                        <button type="button" onClick={() => doDelete(m)}
                          className="block w-full px-1.5 py-0.5 text-left text-xs text-ink hover:text-accent">
                          Mesajı kaldır
                        </button>
                      ) : null}
                      {canMute && member ? (
                        member.muted ? (
                          <button type="button" onClick={() => doUnmute(member)}
                            className="block w-full px-1.5 py-0.5 text-left text-xs text-ink hover:text-accent">
                            Susturmayı kaldır
                          </button>
                        ) : (
                          <button type="button"
                            onClick={() => { setMenuFor(null); setMuteTarget(member); }}
                            className="block w-full px-1.5 py-0.5 text-left text-xs text-danger hover:opacity-80">
                            Sohbette sustur
                          </button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 space-y-1 border-t-2 border-strong bg-raised px-2.5 py-2">
          {send.isError ? <ErrorBox error={new Error(messageForError(send.error))} /> : null}
          {mute.isError ? <ErrorBox error={new Error(messageForError(mute.error))} /> : null}
          {unmute.isError ? <ErrorBox error={new Error(messageForError(unmute.error))} /> : null}
          {remove.isError ? <ErrorBox error={new Error(messageForError(remove.error))} /> : null}

          {/* ⚠️ Yazamama sebebi ÖNCEDEN söyleniyor. Kutuyu kapatmak, oyuncunun mesajı
              yazıp gönderdikten SONRA reddedilmesinden dürüst (`ChatWindow` ilkesi). */}
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
              truncated={packet.data?.truncated ?? false}
            />
          ) : null}

          <div className="flex items-end gap-1.5">
            <TextArea
              ref={input}
              value={draft}
              rows={1}
              maxLength={500}
              placeholder={canWrite ? 'Mesaj yaz…  (@ ile üye etiketle)' : 'Şu an yazamazsın'}
              aria-label="İttifak sohbeti mesajı"
              disabled={!canWrite}
              onChange={(e) => { setDraft(e.target.value); syncCaret(e.currentTarget); }}
              onKeyUp={(e) => syncCaret(e.currentTarget)}
              onClick={(e) => syncCaret(e.currentTarget)}
              onKeyDown={onKeyDown}
              /* ⚠️ `max-h-24` emniyet ağı — gerekçe `GlobalChat`teki ikizinde. */
              className="max-h-24 min-h-[2.25rem] resize-none"
            />
            <Button size="sm" disabled={draft.trim().length === 0 || send.isPending || !canWrite}
              onClick={submit}>Gönder</Button>
          </div>
          {draft.length > 400 ? (
            <div className="tnum text-right text-[10px] text-muted">{draft.length}/500</div>
          ) : null}
        </div>
      </div>

      {muteTarget ? (
        <AllianceChatMuteModal
          member={muteTarget}
          onClose={() => setMuteTarget(null)}
          onSubmit={doMute}
          error={mute.error}
          pending={mute.isPending}
        />
      ) : null}
    </>
  );
}
