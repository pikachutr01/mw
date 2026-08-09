/**
 * ⭐ @ ÖNERİ KUTUSU (§13.15c) — İTTİFAK ve GENEL sohbetin paylaştığı bahsetme yardımcısı.
 *
 * ⚠️ **Aday listesinin nereden geldiği iki sohbette FARKLI** ve bu ayrım bileşenin dışında:
 *   • İttifak: açılış paketindeki üye listesinden **istemcide** süzülüyor (≤300 üye zaten
 *     çevrimiçi noktaları için çekiliyor; ikinci bir uç aynı veriyi ikinci kez taşırdı).
 *   • Genel sohbet: aday kümesi dünyanın tamamı, önceden indirilemez → **debounce'lu bir
 *     arama ucundan** geliyor (`useGlobalMentionSuggest`).
 * Kutu ikisini de aynı görüyor; farkı yalnız `items`ın kim tarafından doldurulduğu.
 *
 * ⚠️ Bu kutu yalnız ÖNERİ verir; kanonik eşleşmeyi sunucu yapıyor (`resolveMentions`). Yani
 * buradaki Türkçe küçük-harf farkı (I/İ) en fazla listeyi boş bırakır, gönderilen metni
 * değiştirmez.
 */
import { useEffect, useRef } from 'react';

/**
 * ⚠️ Öge tipi `AllianceChatMember`den **genişletildi** (2026-08-10): genel sohbetin öneri ucu
 * yalnız `playerId` + `username` döndürüyor — dünya çapında bir aramada çevrimiçilik ve
 * susturma durumu ne biliniyor ne de sızmalı. İki alan **isteğe bağlı**; yoksa satır sade çizilir.
 */
export interface MentionItem {
  playerId: number;
  username: string;
  online?: boolean;
  muted?: boolean;
}

export function MentionAutocomplete({ items, active, onPick, onActive, truncated }: {
  items: MentionItem[];
  /** Klavyeyle gezinilen satırın sırası — sahibi composer (Enter'ı o yakalıyor). */
  active: number;
  onPick: (m: MentionItem) => void;
  onActive: (i: number) => void;
  truncated: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  /* Klavyeyle gezinirken seçili satır görünürde kalsın. */
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (items.length === 0 && !truncated) return null;

  return (
    /* ⚠️ Kutu `TextArea`nın ÜSTÜNDE: bottom sheet ekranın altına yapışık ve mobil klavye
       altını tamamen kaplıyor — aşağı açılan bir liste hiç görünmezdi. */
    <div
      ref={listRef}
      role="listbox"
      aria-label="Üye önerileri"
      className="mb-1 max-h-40 overflow-y-auto overscroll-contain rounded-[var(--radius-sm)]
        border border-strong bg-surface"
      style={{ boxShadow: 'var(--mw-shadow-md)' }}
    >
      {items.map((m, i) => (
        <button
          key={m.playerId}
          type="button"
          role="option"
          aria-selected={i === active}
          data-active={i === active}
          /* ⚠️ `onMouseDown` + `preventDefault`: `onClick` olsaydı önce `blur` gelir, composer
             odağı kaybeder ve imleç konumu (`selectionStart`) sıfırlanırdı. */
          onMouseDown={(e) => { e.preventDefault(); onPick(m); }}
          onMouseEnter={() => onActive(i)}
          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
            i === active ? 'bg-accent text-on-accent' : 'text-ink hover:bg-raised'
          }`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            m.online ? 'bg-success' : 'bg-muted/50'
          }`} />
          <span className="min-w-0 flex-1 truncate">{m.username}</span>
          {m.muted ? (
            <span className={`shrink-0 text-[10px] ${i === active ? 'opacity-80' : 'text-muted'}`}>
              susturuldu
            </span>
          ) : null}
        </button>
      ))}
      {truncated ? (
        <div className="border-t border-border px-2.5 py-1 text-[10px] text-muted">
          Üye listesi kısaltıldı — adı tam yazarsan yine çalışır.
        </div>
      ) : null}
    </div>
  );
}
