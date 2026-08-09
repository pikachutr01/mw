/**
 * ⭐ ENGELLENEN OYUNCULAR (kullanıcı, 2026-08-10) — *"Seçenekler sayfasında engellenmiş
 * kullanıcıları listeleyen bir bölüm ekle. Bunlardan istenilenler engelden çıkarılabilsin."*
 *
 * ⚠️ **Engellemenin tek kaydı `player_blocks`.** Kullanıcının şartı *"dm üzerinden engellenenler
 * de buna dahildir; aynı şekilde buradan engellenenler de dm üzerinde engelli sayılır"* — bunu
 * sağlayan şey bu ekran değil, **tek tablo olması**. İki ayrı liste tutulsaydı senkron tutmak
 * beşinci bir borç olurdu; burası yalnız o tek tablonun penceresi.
 *
 * ⚠️ Engelin ANLAMI kanala göre değişiyor ve panel bunu açıkça yazıyor: özel mesajda "bana
 * yazamaz", genel sohbette "mesajlarını görmem". Yazmasaydık oyuncu genel sohbette
 * engellediğinin hâlâ yazabildiğini görüp engelin çalışmadığını sanardı.
 */
import { useBlockPlayer, useBlockedPlayers } from '../lib/queries.ts';
import { useConfirm } from './Modal.tsx';
import { Panel, Skeleton } from './ui.tsx';

export function BlockedPanel(): React.ReactElement {
  const blocked = useBlockedPlayers();
  const block = useBlockPlayer();
  const confirm = useConfirm();

  const items = blocked.data?.items ?? [];

  const remove = (playerId: number, username: string): void => {
    void confirm({
      title: 'Engeli kaldır',
      body: `${username} sana yeniden mesaj gönderebilecek ve mesajları genel sohbette `
        + 'yeniden görünecek. Emin misiniz!',
    }).then((ok) => { if (ok) block.mutate({ playerId, blocked: false }); });
  };

  return (
    <Panel title="Engellenen Oyuncular">
      {blocked.isLoading ? (
        <div className="space-y-2 p-3">
          <Skeleton w="70%" />
          <Skeleton w="55%" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-xs leading-relaxed text-muted">
          Kimseyi engellemedin. Bir oyuncuyu sohbet penceresinin ⋮ menüsünden engelleyebilirsin.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((b) => (
            <li key={b.playerId} className="flex items-center justify-between gap-2 px-3 py-2">
              {/* ⚠️ `display` (Cinzel) YOK: küçük harfi olmayan bir font, oyuncunun yazdığı
                  kullanıcı adını büyük harfe çevirirdi (`ChatWindow` başlığıyla aynı karar). */}
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.username}</span>
              <button
                type="button"
                disabled={block.isPending}
                onClick={() => remove(b.playerId, b.username)}
                className="shrink-0 text-[11px] text-accent hover:underline disabled:opacity-50"
              >
                Engeli kaldır
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted">
        Engellediğin oyuncu sana <b>özel mesaj gönderemez</b> ve mesajları
        <b> genel sohbette sana görünmez</b>. Engel tek yönlüdür: senin mesajlarını görmeye
        devam eder ve oyun içinde başka hiçbir kısıt doğurmaz.
      </p>
    </Panel>
  );
}
