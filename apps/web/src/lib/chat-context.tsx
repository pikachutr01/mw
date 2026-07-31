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
  const open = useOpenConversation();
  /* Engel bayrağı listeden okunur — pencere kendi başına sorgu açmasın. */
  const conversations = useChatConversations();

  const openChat = useCallback<OpenChatFn>((playerId, username) => {
    open.mutate(playerId, {
      onSuccess: (r) => setTarget({ channelId: r.channelId, playerId, username }),
    });
  }, [open]);

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
