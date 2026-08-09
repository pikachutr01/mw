/**
 * ⭐ SOHBET BAĞLAMI — "bir oyuncuyla sohbeti aç" çağrısını her ekrana taşır.
 *
 * `ConfirmProvider` ile aynı desen (`Modal.tsx`): pencerenin kendisi tek yerde asılı durur,
 * ekranlar yalnız `useOpenChat()(playerId, username)` çağırır. Dünya modalı, Mesajlar ekranı
 * ve sıralama tablosu aynı kapıdan geçer.
 *
 * Pencere `Shell` içinde ve `<Routes>`'un DIŞINDA yaşadığı için **rota değişiminde kapanmaz** —
 * oyuncu sohbet açıkken Baraka'ya geçip üretim yapabilir (kullanıcı: oyun arkada oynanmaya
 * devam etsin).
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ChatWindow, type ChatTarget } from '../components/ChatWindow.tsx';
import { getSession } from './api.ts';
import { useChatConversations, useOpenConversation } from './queries.ts';

type OpenChatFn = (playerId: number, username: string) => void;

const ChatContext = createContext<OpenChatFn>(() => {});

/** Her ekrandan çağrılır: `useOpenChat()(playerId, 'Ayla')`. */
export const useOpenChat = (): OpenChatFn => useContext(ChatContext);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ChatTarget | null>(null);
  /**
   * ⚠️⚠️ **YALNIZ `mutate` alınır, sonuç nesnesinin tamamı DEĞİL** (2026-08-09).
   *
   * `useMutation` her render'da `{ ...result, mutate }` diye **yeni bir nesne** kuruyor ve
   * `result` bir `useSyncExternalStore` değeri — yani mutasyonun her durum geçişinde
   * (`idle → pending → success`) nesnenin kimliği değişiyor. `useCallback(..., [open])`
   * bu yüzden `openChat`i **her POST'ta yeniden doğuruyordu**.
   *
   * Sonuç canlıda görüldü: DM bildirimine tıklayınca `Messages.tsx`in derin bağlantı efekti
   * (bağımlılığında `openChat` var) kendi açtığı sohbetin durum geçişiyle yeniden koşuyor,
   * her koşuda bir POST daha atıyor ve React *"Maximum update depth exceeded"* ile ekranı
   * bozuyordu. Gerekçenin tamamı `lib/deep-link.ts` başlığında.
   *
   * `mutate` ise `useCallback(..., [observer])` ile üretiliyor ve `observer` bir `useState`
   * başlangıç değeri → **ömür boyu sabit**. Kimliği sabit olan tek alan bu.
   */
  const { mutate: openConversation } = useOpenConversation();
  /* Engel bayrağı listeden okunur — pencere kendi başına sorgu açmasın. */
  const conversations = useChatConversations();

  const openChat = useCallback<OpenChatFn>((playerId, username) => {
    openConversation(playerId, {
      onSuccess: (r) => setTarget({ channelId: r.channelId, playerId, username }),
    });
  }, [openConversation]);

  const myId = getSession()?.playerId ?? 0;
  const live = target
    ? conversations.data?.items.find((c) => c.channelId === target.channelId)
    : undefined;

  return (
    <ChatContext.Provider value={openChat}>
      {children}
      {target ? (
        <ChatWindow
          /* ⚠️ `key`: başka bir oyuncuya geçilince pencere DURUMU (taslak, kaydırma) sıfırlanmalı. */
          key={target.channelId}
          target={{ ...target, blocked: live?.blocked ?? false }}
          myId={myId}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </ChatContext.Provider>
  );
}
