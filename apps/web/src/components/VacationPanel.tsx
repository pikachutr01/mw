/**
 * ⭐ TATİL MODU PANELİ — Seçenekler ekranı (§tatil modu).
 *
 * Orijinalde de Seçenekler menüsünün maddesi: `g.java` case 63'te «Şehir Adı Değiştir» yerine
 * tatildeyken **«Tatil Modundan Çık»** yazıyor (SİSTEM PLANI §3236). Biz iki hâli tek panelde
 * topluyoruz — menü maddesinin adı duruma göre değişmiyor, panelin içeriği değişiyor.
 *
 * ⚠️ Panel oyuncuya **ne kaybedeceğini önden** söylüyor. Tatil modu "saldırıya kapalıyım"
 * düğmesi değil: üretim, ilerletme ve kaynak birikimi de duruyor. Bunu onay kutusunda değil
 * panelin gövdesinde yazmak gerekiyordu, çünkü onayı okumadan geçen oyuncu 48 saat boyunca
 * donmuş bir imparatorlukla kalıyor ve geri alamıyor.
 *
 * ⚠️ Engeller **liste** hâlinde (sunucu da öyle döndürüyor): tek engel gösterseydik oyuncu
 * kuyruğu iptal eder, tekrar dener, bu sefer orduyu görür — her adım yeni bir sürpriz olurdu.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { remaining, remainingLong, useTick } from '../lib/hooks.ts';
import { useVacation } from '../lib/queries.ts';
import { useConfirm } from './Modal.tsx';
import { Button, ErrorBox, Panel, Skeleton } from './ui.tsx';

export function VacationPanel(): React.ReactElement {
  const v = useVacation();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useTick();                                   // geri sayımlar canlı aksın

  const call = async (path: 'enter' | 'leave'): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/vacation/${path}`, { method: 'POST' });
      /* ⚠️ Tatil OYUNUN TAMAMINI etkiliyor (kaynak, kuyruk, ordu, ittifak listesi) →
         hedefli tazeleme yerine hepsi. Nadir bir aksiyon, maliyeti önemsiz. */
      await qc.invalidateQueries();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (v.isLoading) {
    return (
      <Panel title="Tatil Modu">
        <div className="space-y-2 p-3"><Skeleton w="80%" /><Skeleton w="55%" /></div>
      </Panel>
    );
  }
  if (!v.data) {
    return (
      <Panel title="Tatil Modu">
        <p className="p-3 text-sm text-muted">Tatil modu durumu alınamadı.</p>
      </Panel>
    );
  }

  const d = v.data;

  /* ── Tatildeyken ─────────────────────────────────────────────────────────── */
  if (d.onVacation) {
    /* ⚠️ İki geri sayım İKİ FARKLI ölçekte: çıkış kilidi saatlerle (saniyesi anlamlı),
       otomatik çıkış günlerle. Aynı biçimi kullansaydık üstteki `719 sa 56 dk 17 sn` diye
       çıkardı — okunmuyor ve saniyesi boş yere titriyordu. */
    const kalanKilit = remaining(d.canLeaveAt);       // null ⇒ 48 saat doldu
    const kalanOtomatik = remainingLong(d.until);

    const cik = async (): Promise<void> => {
      const ok = await confirm({
        title: 'Tatil modundan çıkılsın mı?',
        confirmLabel: 'Tatil modundan çık',
        body: (
          <div className="space-y-2">
            <p>Hesabın normale dönecek: üretim ve kaynak birikimi kaldığı yerden işlemeye başlar.</p>
            <p className="text-muted">
              ⚠️ Aynı anda <b>saldırıya da açılırsın</b>. Yeniden tatile girebilmek için
              {' '}<b>{d.rules.cooldownDays} gün</b> beklemen gerekir.
            </p>
          </div>
        ),
      });
      if (ok) await call('leave');
    };

    return (
      <Panel title="Tatil Modu" right={<span className="text-[11px] font-semibold text-info">Tatilde</span>}>
        <div className="space-y-2 p-3 text-sm">
          <p className="text-ink">Hesabın tatil modunda: kimse sana saldıramaz.</p>
          <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted">
            <li>Altın ve yemek <b>birikmiyor</b>; üretim hızların 0 görünüyor.</li>
            <li>Üretim, ilerletme, mağara ve kahraman diriltme kapalı.</li>
            <li>Ordu gönderemezsin (nakliye ve casusluk dahil).</li>
          </ul>
          <div className="space-y-0.5 pt-1 text-xs text-muted">
            {kalanOtomatik ? (
              <div>Otomatik çıkışa <b className="tnum text-ink">{kalanOtomatik}</b> kaldı
                {' '}({d.rules.maxDays} günlük üst sınır).</div>
            ) : null}
            {kalanKilit ? (
              <div>En erken <b className="tnum text-ink">{kalanKilit}</b> sonra çıkabilirsin
                {' '}({d.rules.minHours} saatlik alt sınır).</div>
            ) : null}
          </div>
        </div>
        <div className="space-y-2 border-t border-border px-3 py-2">
          <Button disabled={busy || kalanKilit != null} onClick={() => void cik()}>
            {busy ? 'Çıkılıyor…' : 'Tatil Modundan Çık'}
          </Button>
          <ErrorBox error={error} />
        </div>
      </Panel>
    );
  }

  /* ── Tatilde değilken ────────────────────────────────────────────────────── */
  const gir = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Tatil moduna alınsın mı?',
      confirmLabel: 'Tatil moduna al',
      body: (
        <div className="space-y-2">
          {/* Orijinalin onay metni (`g.java`): «Hesabınız tatil moduna alınacak. Emin misiniz!» */}
          <p>Hesabın tatil moduna alınacak. Emin misin?</p>
          <ul className="ml-4 list-disc space-y-0.5 text-muted">
            <li>Kimse sana saldıramaz.</li>
            <li><b>Kaynak birikimi ve üretim tamamen durur.</b></li>
            <li>Ordu gönderemez, üretim ve ilerletme başlatamazsın.</li>
            <li>En erken <b>{d.rules.minHours} saat</b> sonra çıkabilirsin.</li>
            <li><b>{d.rules.maxDays} gün</b> sonra otomatik olarak çıkarılırsın.</li>
          </ul>
        </div>
      ),
    });
    if (ok) await call('enter');
  };

  return (
    <Panel title="Tatil Modu">
      <div className="space-y-2 p-3 text-sm">
        <p className="text-ink">
          Oyuna bir süre ara verirken şehirlerini saldırıya kapatır.
        </p>
        <p className="text-xs text-muted">
          ⚠️ Karşılığında <b>üretim ve kaynak birikimi de durur</b> — tatil modu bir kalkan
          değil, oyunu duraklatma düğmesidir. En az {d.rules.minHours} saat kalınır,
          {' '}{d.rules.maxDays} gün sonra otomatik çıkılır ve çıktıktan sonra yeniden girmek
          için {d.rules.cooldownDays} gün beklenir.
        </p>
      </div>

      <div className="space-y-2 border-t border-border px-3 py-2">
        {d.blockers.length > 0 ? (
          <>
            <div className="text-xs text-muted">Şu an tatil moduna girilemez:</div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs text-danger">
              {d.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </>
        ) : (
          <Button disabled={busy} onClick={() => void gir()}>
            {busy ? 'Alınıyor…' : 'Tatil Moduna Al'}
          </Button>
        )}
        <ErrorBox error={error} />
      </div>
    </Panel>
  );
}
