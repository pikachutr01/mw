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
import { useState } from 'react';
import { Modal, useConfirm } from './Modal.tsx';
import { Badge, Button, Panel } from './ui.tsx';
import { useDevices, useRevokeDevice, useRevokeOtherDevices, type DeviceRow } from '../lib/queries.ts';
import { formatGameTime } from '@mobilwar/contracts';

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

const when = (iso: string): string => formatGameTime(iso);

/** Tek cihaz satırı — kartta (yalnız bu cihaz) ve modalda (diğerleri) aynı düzen. */
function DeviceLine({ d, onRevoke, busy }: {
  d: DeviceRow; onRevoke: (d: DeviceRow) => void; busy: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
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
      <Button variant="ghost" disabled={busy} onClick={() => onRevoke(d)}>
        {d.current ? 'Bu cihazdan çık' : 'Çıkar'}
      </Button>
    </div>
  );
}

/**
 * ⭐ DÜZEN 2026-08-02'de sadeleştirildi (kullanıcı): kartta **yalnız kullanılan cihaz**
 * duruyor, diğerleri bir düğmeyle modalda açılıyor. Gerekçe: oyuncunun çoğu ziyaretinde
 * ilgilendiği tek satır zaten bu; liste uzadıkça Seçenekler sayfasını tek başına şişiriyordu.
 * Çıkarma işlemleri modalda da aynen çalışıyor — sadeleşen görünüm, yetenek değil.
 */
export function DevicesPanel() {
  const { data, isLoading } = useDevices();
  const revoke = useRevokeDevice();
  const revokeOthers = useRevokeOtherDevices();
  const confirm = useConfirm();
  const [listOpen, setListOpen] = useState(false);

  const items = data?.items ?? [];
  const current = items.find((d) => d.current) ?? null;
  const others = items.filter((d) => !d.current);

  const askRevoke = (d: DeviceRow): void => {
    void confirm({
      title: d.current ? 'Bu cihazdan çık' : 'Cihazı çıkar',
      body: d.current
        ? 'Bu cihazdaki oturumun kapanacak ve giriş ekranına döneceksin.'
        : `«${describe(d)}» cihazındaki oturum anında kapanacak. `
          + 'O cihaz oyunu açıksa giriş ekranına düşer.',
      confirmLabel: d.current ? 'Çık' : 'Çıkar',
      danger: true,
    }).then((ok) => { if (ok) revoke.mutate(d.chainId); });
  };

  return (
    <>
      <Panel title="Aktif Cihazlar" right={others.length > 0 ? <Badge>{others.length} diğer</Badge> : null}>
        {isLoading ? (
          <p className="px-3 py-3 text-sm text-muted">Yükleniyor…</p>
        ) : current ? (
          <div className="px-3 py-2.5">
            <DeviceLine d={current} onRevoke={askRevoke} busy={revoke.isPending} />
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted">
            {items.length === 0 ? 'Aktif oturum bulunamadı.' : 'Bu cihaz listede görünmüyor.'}
          </p>
        )}

        {others.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2.5">
            <Button variant="ghost" onClick={() => setListOpen(true)}>
              Diğer cihazlar ({others.length})
            </Button>
            <Button
              variant="danger"
              disabled={revokeOthers.isPending}
              onClick={() => {
                void confirm({
                  title: 'Diğer cihazlardan çık',
                  body: `${others.length} cihazdaki oturum anında kapanacak. Bu cihaz açık kalacak.`,
                  confirmLabel: 'Hepsini çıkar',
                  danger: true,
                }).then((ok) => { if (ok) revokeOthers.mutate(); });
              }}
            >
              {revokeOthers.isPending ? 'Çıkarılıyor…' : 'Diğer tüm cihazlardan çık'}
            </Button>
          </div>
        ) : null}
      </Panel>

      {listOpen ? (
        <Modal title="Diğer cihazlar" onClose={() => setListOpen(false)}>
          <ul className="divide-y divide-border">
            {others.map((d) => (
              <li key={d.chainId} className="px-1 py-2.5">
                <DeviceLine d={d} onRevoke={askRevoke} busy={revoke.isPending} />
              </li>
            ))}
            {/* Son cihaz da çıkarılınca liste boşalır; modal açık kalıp boş görünmesin. */}
            {others.length === 0 ? (
              <li className="px-1 py-3 text-sm text-muted">Başka aktif cihaz kalmadı.</li>
            ) : null}
          </ul>
        </Modal>
      ) : null}
    </>
  );
}
