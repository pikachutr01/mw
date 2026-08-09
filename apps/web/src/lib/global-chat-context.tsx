/**
 * ⭐ GENEL SOHBET BAĞLANTISI — "bağlan / kopar" durumunun TEK sahibi (§13.12).
 *
 * Kullanıcı tarifi: *"Sağ tarafta sohbet penceresi açık gibi dursa da sürekli bir bağlantı
 * olmayacak. Yalnızca istediği anda «sohbete bağlan» düğmesi ile bağlanıp gerçek zamanlı
 * sohbete katılabilecek. Bağlantıyı kopardığında bir placeholder yazısı gözükebilir."*
 * Mobilde: *"alttan açılsın, açık olduğu sürece sohbete bağlı kabul edilsin."*
 *
 * ⭐⭐ **TEK BOOLEAN, ÜÇ YÜZEY.** Masaüstü kartı `connected`ı okuyor; mobil sheet **yalnız
 * `connected` iken mount oluyor**; dar ekrandaki menü düğmesi `toggle()` çağırıyor. "Pencere
 * açık" ve "sohbete bağlı" diye iki ayrı kavram tutsaydık ikisinin ayrışacağı ilk hata
 * kaçınılmazdı — mobilde zaten aynı şeyler.
 *
 * ⚠️ **Sayfa yenilenince bağlantı hatırlanmıyor** (varsayılan çevrimdışı). Kalıcı kılmak
 * (localStorage) sessizce "hep bağlı"ya dönerdi ve kullanıcının istediğinin tam tersi olurdu.
 *
 * ⚠️ Sağlayıcı **rotaların DIŞINDA** (`ChatProvider` ile aynı yer): sayfa değiştirmek
 * bağlantıyı koparmamalı — oyuncu sohbet açıkken Baraka'ya geçip üretim yapabilmeli.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GlobalChat } from '../components/GlobalChat.tsx';
import { deepLinkAction } from './deep-link.ts';
import { useMediaQuery } from './hooks.ts';
import { useGlobalChatEnabled } from './queries.ts';

interface GlobalChatState {
  /** Panelden açık mı — kapalıysa hiçbir yüzey çizilmez (kullanıcı şartı). */
  available: boolean;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  toggle: () => void;
}

const Ctx = createContext<GlobalChatState>({
  available: false,
  connected: false,
  connect: () => {},
  disconnect: () => {},
  toggle: () => {},
});

export const useGlobalChatConnection = (): GlobalChatState => useContext(Ctx);

export function GlobalChatProvider({ children }: { children: ReactNode }) {
  const available = useGlobalChatEnabled();
  const [connected, setConnected] = useState(false);
  /** ⚠️ `xl` = 1280 px — `Shell`in sağ sütun eşiğiyle AYNI sayı olmak zorunda. */
  const wide = useMediaQuery('(min-width: 1280px)');
  const { search, pathname } = useLocation();
  const navigate = useNavigate();

  const connect = useCallback(() => setConnected(true), []);
  const disconnect = useCallback(() => setConnected(false), []);
  const toggle = useCallback(() => setConnected((v) => !v), []);

  /* Panelden kapatılırsa açık bağlantı da düşmeli — yoksa kart gider, oda üyeliği kalırdı. */
  useEffect(() => { if (!available) setConnected(false); }, [available]);

  /**
   * ⭐ DERİN BAĞLANTI `?gchat=1` — bahsetme bildirimi buraya geliyor (`notify.catalog.ts`).
   *
   * ⚠️ **Mandal (`latch`) şart**: efekt her `search` değişiminde koşuyor ve parametreyi
   * temizlemek de bir `search` değişimi. Mandalsız kurulum sonsuz döngüye girerdi —
   * `Alliance.tsx`teki aynı desen ve `lib/deep-link.ts`teki gerekçe.
   * ⚠️ Parametre **temizleniyor**: kalsaydı oyuncu sohbeti kapattığında adres hâlâ `gchat=1`
   * derdi ve geri tuşu onu yeniden açardı.
   */
  const latch = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(search);
    const step = deepLinkAction(params.get('gchat'), available, latch.current);
    latch.current = step.handled;
    if (!step.act || params.get('gchat') !== '1') return;
    setConnected(true);
    const next = new URLSearchParams(search);
    next.delete('gchat');
    navigate({ pathname, search: next.toString() }, { replace: true });
  }, [search, pathname, available, navigate]);

  const value = useMemo<GlobalChatState>(
    () => ({ available, connected, connect, disconnect, toggle }),
    [available, connected, connect, disconnect, toggle],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/**
        * ⚠️ Sheet YALNIZ dar ekranda ve YALNIZ bağlıyken. Geniş ekranda aynı sohbet sağ
        * sütundaki kartta yaşıyor (`Shell.SidePanels`) — ikisi aynı anda mount olsaydı iki
        * bileşen aynı WS odasına katılıp aynı sorguları iki kez açardı.
        */}
      {available && connected && !wide ? <GlobalChat variant="sheet" /> : null}
    </Ctx.Provider>
  );
}
