/**
 * ⭐ ŞÜPHELİ KAYITLAR (§9.1.7) — kullanıcının iki notu: *"temp mail gibi servislerden alınan
 * garip e postalar ile e posta doğrulama aşaması geçilebilir. Bunların tespitini yapıp
 * banlayabilecek bir admin bölümü"* ve *"bot hesap oluşturmayı tespit edip engelleme"*.
 *
 * ⚠️ **«Çoklu hesap» sekmesinden AYRI.** O ekran oyun İÇİNDEKİ ilişkiye bakıyor (kim kime
 * kaynak gönderdi, kim kiminle savaştı); burası hesabın DOĞDUĞU ana bakıyor. İkisini
 * birleştirseydik iki farklı soru tek listede karışır ve hiçbiri düzgün cevaplanmazdı.
 *
 * ⚠️ Ekran ceza vermez. Ceza «Oyuncular» sekmesindeki künyeden — ayrı işlem, ayrı denetim
 * kaydı (§9.1.1).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatGameTime } from '@mobilwar/contracts';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { Alert, Badge, Button, Empty, ErrorBox, Info, Loading, Panel } from '../components/ui.tsx';

interface SignupsResponse {
  list: { rows: number; refreshedAt: string; ageHours: number } | null;
  config: { blockDisposable: boolean; maxPerBlock: number; windowMinutes: number };
  mailboxes: { box: string; count: number; emails: string[]; firstAt: string; lastAt: string }[];
  disposable: {
    accountId: number; email: string; createdAt: string; verified: boolean;
    playerId: number | null; username: string | null;
  }[];
  bursts: { block: string; count: number; firstAt: string; lastAt: string }[];
}

const when = (iso: string): string => formatGameTime(iso);

export function SignupsScreen({ worldId, onNeedStepUp }: {
  worldId: number; onNeedStepUp: () => void;
}) {
  const [data, setData] = useState<SignupsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setData(await api<SignupsResponse>(`/api/v1/admin/abuse/signups?worldId=${worldId}`));
    } catch (err) {
      setError(err);
    }
  }, [worldId]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ rows: number; backfill: number }>(
        '/api/v1/admin/abuse/signups/refresh', { method: 'POST', body: {} });
      setNote(`${r.rows.toLocaleString('tr-TR')} alan yüklendi · `
        + `${r.backfill} hesabın posta kutusu kimliği dolduruldu.`);
      await load();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Panel title="Şüpheli kayıtlar"><Loading /></Panel>;

  return (
    <div className="space-y-3">
      <Panel title="Kayıt koruması" collapsible defaultOpen={data.list == null}>
        <div className="space-y-2 px-3 py-2 text-xs">
          {data.list == null ? (
            <Alert tone="warning">
              <b>Alan listesi yüklenmedi.</b> Geçici e-posta tespiti çalışmıyor; aşağıdaki
              «Geçici e-posta» listesi boş kalır. Bir kez indirmen yeterli.
            </Alert>
          ) : (
            <p className="text-muted">
              <b className="tnum text-ink">{data.list.rows.toLocaleString('tr-TR')}</b> geçici
              e-posta alanı ·{' '}
              {data.list.ageHours < 48
                ? `${data.list.ageHours} saat önce`
                : `${Math.round(data.list.ageHours / 24)} gün önce`} güncellendi
            </p>
          )}
          <div className="text-[11px] text-muted">
            Bot koruması: aynı /24 ağdan <b className="tnum text-ink">{data.config.windowMinutes}</b>{' '}
            dakikada en fazla <b className="tnum text-ink">{data.config.maxPerBlock}</b> hesap.
            Geçici e-posta{' '}
            <b className={data.config.blockDisposable ? 'text-danger' : 'text-ink'}>
              {data.config.blockDisposable ? 'ENGELLENİYOR' : 'yalnız işaretleniyor'}
            </b>.
            <Info label="neden varsayılan engellemiyor">
              Yanlış pozitifin bedeli asimetrik: engellenen gerçek bir oyuncu geri gelmez ve
              neden giremediğini de öğrenemez. Liste küratörlü (~8.200 alan, CC0) ve gmail,
              hotmail, outlook, yahoo, yandex, icloud, protonmail’in hiçbirini içermiyor —
              ama hiçbir liste kusursuz değil. Önce aşağıdaki listede kaç kaydın
              işaretlendiğine bak, sonra «Ayarlar»dan aç.
            </Info>
          </div>
          {note ? <Alert tone="success">{note}</Alert> : null}
          <ErrorBox error={error} />
          <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'İndiriliyor…' : data.list == null ? 'Alan listesini indir' : 'Tazele'}
          </Button>
        </div>
      </Panel>

      {/* ── 1. Aynı posta kutusu ─────────────────────────────────────────────── */}
      <Panel title="Aynı posta kutusundan açılan hesaplar" right={`${data.mailboxes.length}`}>
        <div className="border-b border-border px-3 py-2">
          <Alert tone="info">
            <b>Asıl açık burası.</b> <code>ahmet+1@gmail.com</code>,{' '}
            <code>ahmet+2@gmail.com</code> ve <code>ah.met@gmail.com</code> <b>aynı posta
            kutusudur</b>: üçü de doğrulama postasını alır, üçü de doğrulanır. E-posta
            doğrulaması bu hileyle hiçbir geçici servise ihtiyaç duymadan aşılabiliyor.
            ⚠️ Yine de tek başına suç değil — aile ve iş hesabı da böyle görünür.
          </Alert>
        </div>
        {data.mailboxes.length === 0 ? (
          <Empty>Aynı posta kutusunu paylaşan hesap yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.mailboxes.map((m) => (
              <li key={m.box} className="px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={m.count > 2 ? 'danger' : 'warning'}>{m.count} hesap</Badge>
                  <code className="text-ink">{m.box}</code>
                </div>
                <p className="mt-1 font-mono text-[10px] break-all text-muted">
                  {m.emails.join(' · ')}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  ilk {when(m.firstAt)} · son {when(m.lastAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── 2. Geçici e-posta ────────────────────────────────────────────────── */}
      <Panel title="Geçici e-posta ile açılan hesaplar" right={`${data.disposable.length}`}>
        {data.disposable.length === 0 ? (
          <Empty>
            {data.list == null
              ? 'Alan listesi yüklenmeden bu liste boş kalır.'
              : 'Geçici e-posta ile açılmış hesap yok.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.disposable.map((a) => (
              <li key={a.accountId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                {/* ⚠️ «Doğrulanmış» rozeti önemli: geçici e-postayla DOĞRULAMAYI GEÇMİŞ bir
                    hesap, doğrulamanın o adres için hiçbir şey ifade etmediğinin kanıtı. */}
                <Badge tone={a.verified ? 'danger' : 'muted'}>
                  {a.verified ? 'doğrulanmış' : 'doğrulanmamış'}
                </Badge>
                <code className="text-ink">{a.email}</code>
                {a.playerId != null ? (
                  <Link to={`/oyuncular/${a.playerId}`} className="text-ink underline">
                    {a.username ?? `#${a.playerId}`}
                  </Link>
                ) : <span className="text-muted">bu dünyada oyuncusu yok</span>}
                <span className="ml-auto text-[11px] text-muted">{when(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── 3. Kayıt yığınları ───────────────────────────────────────────────── */}
      <Panel title="Aynı ağdan yığın kayıt (son 30 gün)" right={`${data.bursts.length}`}>
        <div className="border-b border-border px-3 py-2 text-[11px] text-muted">
          ⚠️ Ölçüt hesabın <b>doğduğu</b> IP, sonradan girdiği değil. Aynı ev, okul ya da
          mobil operatör ağı da birkaç kayıt üretir — sayı büyüdükçe anlamlı olur.
        </div>
        {data.bursts.length === 0 ? (
          <Empty>Aynı ağdan birden fazla kayıt yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.bursts.map((b) => (
              <li key={b.block} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <Badge tone={b.count > data.config.maxPerBlock ? 'danger' : 'muted'}>
                  {b.count} hesap
                </Badge>
                <code className="text-ink">{b.block}</code>
                <span className="ml-auto text-[11px] text-muted">
                  {when(b.firstAt)} → {when(b.lastAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
