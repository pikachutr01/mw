/**
 * ⭐ İTTİFAK KÜNYESİ MODALI (kullanıcı, 2026-08-09).
 *
 * *"Sıralamalar sayfasından veya arama sonucu görünen ittifakların üzerine tıklayınca açılan
 * modalde ittifak metni, lideri, kaç üyesi olduğu gibi detayları göstersin. Yine bu modal
 * üzerinden eğer başka bir ittifağa üye değilse başvuru butonu da olsun."*
 *
 * ⚠️ **Üye listesi burada YOK, bilerek.** Sunucu da göndermiyor: üye adları, çevrimiçilik ve
 * askerî ünvan **ittifak içi** bilgidir (§ünvanlar — *"bunu gören düşmanlar ordusunun yeni
 * kırıldığını anlar"*). Modal yalnız toplamları ve tanıtım metnini gösterir.
 *
 * ⚠️ **Başvuru düğmesinin görünürlüğüne sunucu karar veriyor** (`canApply`). İstemcide
 * "ittifaksız mıyım" diye bakmıyoruz: kural `alliance.service.apply` içinde yaşıyor ve iki
 * yerde tutmak kaçınılmaz olarak kayardı — bu turda `attackScoreRatio` ve saldırı limitinde
 * tam olarak o ayrışmayı temizledik.
 */
import { fmt } from '../lib/hooks.ts';
import { useAllianceApply, useAllianceProfile } from '../lib/queries.ts';
import { Badge, Button, Empty, ErrorBox, Skeleton, UserText } from './ui.tsx';
import { Modal } from './Modal.tsx';

export function AllianceModal({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useAllianceProfile(id);
  const apply = useAllianceApply();
  const a = q.data;

  return (
    <Modal
      title={a ? <><UserText>{a.name}</UserText> İttifağı</> : 'İttifak'}
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Kapat</Button>}
    >
      {q.isLoading ? (
        <div className="space-y-2 p-3"><Skeleton w="50%" /><Skeleton w="80%" /><Skeleton w="35%" /></div>
      ) : null}
      <ErrorBox error={q.error} />

      {a ? (
        <div className="space-y-3 p-3">
          {/* ── Künye ──────────────────────────────────────────────────────── */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            <Row label="Lider" value={a.leader} />
            <Row label="Üye" value={fmt(a.memberCount)} num />
            <Row label="Puan" value={fmt(a.score)} num />
            <Row label="Sıra" value={a.rank == null ? '-' : `${a.rank}`} num />
          </dl>

          {/* ── İttifak metni — asıl istenen ────────────────────────────────── */}
          <div>
            <div className="mb-1 text-xs font-semibold text-muted">İttifak Metni</div>
            {a.text ? (
              <p className="tex bevel rounded-[var(--radius-sm)] border border-border bg-raised
                px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {a.text}
              </p>
            ) : (
              <Empty>Bu ittifak henüz bir metin yazmamış.</Empty>
            )}
          </div>

          {/* ── Başvuru ─────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {a.isMine ? <Badge tone="success">Bu senin ittifağın</Badge> : null}
            {a.alreadyApplied ? <Badge tone="warning">Başvurun bekliyor</Badge> : null}
            {a.canApply ? (
              <Button disabled={apply.isPending || apply.isSuccess}
                onClick={() => apply.mutate({ allianceId: a.id })}>
                {apply.isSuccess ? 'Başvuru gönderildi' : 'Başvur'}
              </Button>
            ) : (
              /* ⚠️ Sebep YAZILIYOR, düğme sessizce gizlenmiyor: "neden başvuramıyorum"
                 sorusunu oyuncu deneyerek öğrenmemeli. */
              !a.isMine && !a.alreadyApplied && a.applyBlockedReason
                ? <span className="text-xs text-muted">{a.applyBlockedReason}</span>
                : null
            )}
          </div>
          <ErrorBox error={apply.error} />
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * ⚠️ `num` bayrağı ŞART: bu satır hem sayı (Üye · Puan · Sıra) hem metin (Lider adı) taşıyor.
 * `tnum`u koşulsuz uygulasaydık oyuncu adı da mono fontta çizilirdi — sayı okunurluğu için
 * yapılan düzeltme, adları bozardı.
 */
function Row({ label, value, num = false }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`truncate font-semibold text-ink ${num ? 'tnum' : ''}`}>{value}</dd>
    </div>
  );
}
