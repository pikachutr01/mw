/**
 * ⭐ AKTİF CİHAZLAR (§admin Faz 3) — kullanıcının isteği: *"oyuncular seçenekler sayfasında
 * aktif oturumlarını görebilecekleri bir kısım olsun… oturum açtığı cihazları görebilsin ve
 * yönetebilsin."*
 *
 * ⚠️ Liste **zincir başına tek satır**. Sunucu `sessions.chain_id` ile grupluyor; satır
 * kimliğiyle gruplasaydı dönmeli refresh yüzünden aynı telefon 15 dakikada bir yeni bir cihaz
 * gibi görünürdü.
 *
 * ⚠️ Flutter'a HAZIR: gösterilen alanlar (`platform`, `deviceModel`, `osVersion`, `appVersion`)
 * zaten mobil istemcinin doldurduğu başlıklardan geliyor. Webde `deviceModel` boş kalır ve
 * yerine tarayıcı adı yazılır — ekran ikisini de aynı satır düzeniyle gösteriyor.
 */
import { useConfirm } from './Modal.tsx';
import { Badge, Button, Panel } from './ui.tsx';
import { useDevices, useRevokeDevice, useRevokeOtherDevices, type DeviceRow } from '../lib/queries.ts';

const PLATFORM_LABEL: Record<string, string> = {
  web: 'Tarayıcı', android: 'Android', ios: 'iPhone / iPad',
};

/** User-Agent'tan okunabilir bir tarayıcı adı. Kesin olmak zorunda değil; ayırt etmeye yarar. */
function browserOf(ua: string | null): string | null {
  if (!ua) return null;
  // ⚠️ Sıra ÖNEMLİ: Edge ve Opera kendilerini "Chrome" olarak da tanıtır, Chrome da "Safari".
  for (const [needle, name] of [
    ['Edg/', 'Edge'], ['OPR/', 'Opera'], ['Firefox/', 'Firefox'],
    ['Chrome/', 'Chrome'], ['Safari/', 'Safari'],
  ] as const) {
    if (ua.includes(needle)) return name;
  }
  return null;
}

function describe(d: DeviceRow): string {
  const platform = PLATFORM_LABEL[d.platform ?? ''] ?? d.platform ?? 'Bilinmeyen cihaz';
  const detail = d.deviceModel ?? browserOf(d.userAgent);
  return detail ? `${platform} · ${detail}` : platform;
}

const when = (iso: string): string => new Date(iso).toLocaleString('tr-TR');

export function DevicesPanel() {
  const { data, isLoading } = useDevices();
  const revoke = useRevokeDevice();
  const revokeOthers = useRevokeOtherDevices();
  const confirm = useConfirm();

  const items = data?.items ?? [];
  const others = items.filter((d) => !d.current).length;

  return (
    <Panel title="Aktif Cihazlar" right={others > 0 ? <Badge>{others} diğer</Badge> : null}>
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-muted">Yükleniyor…</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((d) => (
            <li key={d.chainId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink">{describe(d)}</span>
                  {d.current ? <Badge tone="success">bu cihaz</Badge> : null}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">
                  Son görülme {when(d.lastSeenAt)}
                  {d.ip ? ` · ${d.ip}` : ''}
                  {d.appVersion ? ` · uygulama ${d.appVersion}` : ''}
                  {d.osVersion ? ` · ${d.osVersion}` : ''}
                </p>
              </div>
              {/* ⚠️ Kendi cihazını da çıkarabilir; sunucu engellemiyor ve engellememeli —
                  uzaktaki cihazı düşürebilen kişi zaten oturumun sahibi. Ama metni ayırıyoruz
                  ki "Çıkar"a basıp kendini attığında şaşırmasın. */}
              <Button
                variant="ghost"
                disabled={revoke.isPending}
                onClick={() => {
                  void confirm({
                    title: d.current ? 'Bu cihazdan çık' : 'Cihazı çıkar',
                    body: d.current
                      ? 'Bu cihazdaki oturumun kapanacak ve giriş ekranına döneceksin.'
                      : `«${describe(d)}» cihazındaki oturum anında kapanacak. `
                        + 'O cihaz oyunu açıksa giriş ekranına düşer.',
                    confirmLabel: d.current ? 'Çık' : 'Çıkar',
                    danger: true,
                  }).then((ok) => { if (ok) revoke.mutate(d.chainId); });
                }}
              >
                {d.current ? 'Bu cihazdan çık' : 'Çıkar'}
              </Button>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Aktif oturum bulunamadı.</li>
          ) : null}
        </ul>
      )}

      <div className="border-t border-border px-3 py-2.5">
        <p className="mb-2 text-[11px] leading-snug text-muted">
          Hesabına başkasının eriştiğinden şüpheleniyorsan önce diğer cihazları çıkar, sonra
          parolanı değiştir. ⚠️ Parola değişikliği zaten <b>tüm</b> cihazları düşürür.
        </p>
        <Button
          variant="danger"
          disabled={others === 0 || revokeOthers.isPending}
          onClick={() => {
            void confirm({
              title: 'Diğer cihazlardan çık',
              body: `${others} cihazdaki oturum anında kapanacak. Bu cihaz açık kalacak.`,
              confirmLabel: 'Hepsini çıkar',
              danger: true,
            }).then((ok) => { if (ok) revokeOthers.mutate(); });
          }}
        >
          {revokeOthers.isPending ? 'Çıkarılıyor…' : 'Diğer tüm cihazlardan çık'}
        </Button>
      </div>
    </Panel>
  );
}
