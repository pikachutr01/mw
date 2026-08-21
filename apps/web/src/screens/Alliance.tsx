/**
 * ⭐ İTTİFAK EKRANI (§13.15b) — Komuta Merkezi'nin üçüncü sekmesi (orijinal: Ana menü →
 * Komuta Merkezi → İttifak, ekran 17; `scr_web06` düzeni).
 *
 * İki hâl:
 *  • Üye DEĞİL: İttifak Kur (Kale ≥ 5 şartı görünür) + İttifak Ara/Listele + Başvur.
 *  • Üye: başlık kartı (ad · puan · sıra) → İttifak Metni (Konsey+Lider düzenler) →
 *    aksiyonlar (İttifağa Mesaj · İttifaktan Ayrıl · liderde Adı Değiştir / İttifağı Dağıt) →
 *    üyeler tablosu (# · Oyuncu · Puan · Sıra · Rütbe · Durum · İşlem), sayfa başına 20.
 *
 * İşlem sütunu yetkiye göre dolar (ekran görüntüsündeki boş sütun = Asker görünümü):
 * Konsey yalnız Asker'i atabilir; Lider + Konseye Al/Çıkar + Liderliği Devret. Onay metinleri
 * orijinal kalıpla: "… Emin misiniz!" (ünlem).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deepLinkAction } from '../lib/deep-link.ts';
import { fmt } from '../lib/hooks.ts';
import {
  useAlliance, useAllianceApply, useAllianceBroadcast, useAllianceDisband, useAllianceFound,
  useAllianceLeave, useAllianceMemberAction, useAllianceRename, useAllianceSearch,
  useAllianceText, type AllianceMember,
} from '../lib/queries.ts';
import {
  Badge, Button, Empty, ErrorBox, Input, Panel, Skeleton, Td, TextArea, Th, UserText,
} from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';
import { Popover } from '../components/Popover.tsx';
import { AllianceChatSheet } from '../components/AllianceChatSheet.tsx';
import { MERIT_ROW_CLASS, MeritBadge } from '../components/MeritBadge.tsx';

/** Rütbe adları — ekran görüntüsündeki yazımla ("Konsey Üyesi"; istemci içi string "Konsey"). */
export const ROLE_LABEL: Record<number, { text: string; tone: 'muted' | 'success' | 'warning' | 'danger' }> = {
  1: { text: 'Asker', tone: 'muted' },
  2: { text: 'Konsey Üyesi', tone: 'warning' },
  3: { text: 'Lider', tone: 'success' },
};

export function AllianceScreen() {
  const [page, setPage] = useState(0);
  const view = useAlliance(page);

  if (view.isLoading) return <Panel title="İttifak"><div className="space-y-2 p-3"><Skeleton w="60%" /><Skeleton w="80%" /><Skeleton w="40%" /></div></Panel>;
  if (view.isError) return <Panel title="İttifak"><ErrorBox error={view.error} /></Panel>;
  const d = view.data;
  if (!d) return null;

  return d.alliance
    ? <MemberView a={d.alliance} page={page} setPage={setPage} />
    : <OutsiderView canFound={d.canFound} pending={d.pendingApplications ?? []} />;
}

/* ── Üye DEĞİL: kur + ara/başvur ─────────────────────────────────────────────── */

function OutsiderView({ canFound, pending }: {
  canFound?: { ok: boolean; need: number; current: number };
  pending: number[];
}) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const found = useAllianceFound();
  const apply = useAllianceApply();
  const confirm = useConfirm();
  const list = useAllianceSearch(query);

  return (
    <div className="space-y-3">
      <Panel title="İttifak Kur">
        <div className="space-y-2 p-3">
          <p className="text-xs text-muted">
            İttifak adı 3-10 karakter olmalı ve bu dünyada benzersiz olmalı.
          </p>
          {canFound && !canFound.ok ? (
            <p className="text-xs text-danger">
              İttifak kurmak için <b>Kale {canFound.need}</b> gerekli (şu an {canFound.current}).
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Input value={name} maxLength={10} placeholder="İttifak adı"
              onChange={(e) => setName(e.target.value)} aria-label="İttifak adı" />
            <Button
              disabled={name.trim().length < 3 || !canFound?.ok || found.isPending}
              onClick={() => found.mutate({ name: name.trim() })}
            >İttifak Kur</Button>
          </div>
          <ErrorBox error={found.error} />
        </div>
      </Panel>

      {/* ⚠️ Başlık bandında açıklama YOK (kullanıcı, 2026-08-06): listedeki her satırın
          sonunda zaten «Başvur» düğmesi duruyor, ne yapılacağını o söylüyor. */}
      <Panel title="İttifak Ara">
        <div className="space-y-2 p-3">
          <Input value={query} placeholder="İttifak adı ara…"
            onChange={(e) => setQuery(e.target.value)} aria-label="İttifak ara" />
          <ErrorBox error={apply.error} />
        </div>
        {list.data && list.data.alliances.length === 0 ? (
          <Empty>Bu dünyada hiç ittifak yok!</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th className="w-12 text-center">Sıra</Th>
                <Th>İttifak</Th>
                <Th className="w-24 text-right">Puan</Th>
                <Th className="w-20 text-center">Üye</Th>
                <Th className="w-28">{' '}</Th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.alliances ?? []).map((a, i) => (
                <tr key={a.id} className={`h-8 border-b border-border ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
                  <Td className="tnum text-center">{a.rank ?? '-'}</Td>
                  <Td className="max-w-[10rem] truncate">{a.name}</Td>
                  <Td className="tnum text-right">{fmt(a.score)}</Td>
                  <Td className="tnum text-center">{a.memberCount}</Td>
                  <Td className="text-right">
                    {pending.includes(a.id) ? (
                      <Badge tone="warning">başvuruldu</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={apply.isPending}
                        onClick={() => {
                          void confirm({
                            title: <><UserText>{a.name}</UserText> ittifağına başvuru</>,
                            body: 'İttifağa başvuru gönderilecek. Emin misiniz!',
                          }).then((ok) => { if (ok) apply.mutate({ allianceId: a.id }); });
                        }}>Başvur</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/* ── Üye görünümü ────────────────────────────────────────────────────────────── */

function MemberView({ a, page, setPage }: {
  a: NonNullable<ReturnType<typeof useAlliance>['data']>['alliance'] & object;
  page: number;
  setPage: (n: number) => void;
}) {
  const alliance = a!;
  const confirm = useConfirm();
  const leave = useAllianceLeave();
  const disband = useAllianceDisband();
  const [panel, setPanel] = useState<'none' | 'text' | 'message' | 'rename'>('none');
  const [chatOpen, setChatOpen] = useState(false);
  const isLeader = alliance.myRole === 3;
  const isCouncil = alliance.myRole >= 2;

  /**
   * ⭐ DERİN BAĞLANTI `/command/alliance?chat=1` (§13.15c) — bahsedilme bildirimi buraya
   * düşüyor; `Messages.tsx`teki `?dm=` deseninin ikizi.
   *
   * ⚠️ Parametre **temizleniyor**: kalsaydı oyuncu sheet'i kapattığında adres hâlâ `chat=1`
   * derdi ve bir sonraki render onu tekrar açardı.
   *
   * ⚠️ Mandal (`deepLinkAction`) burada da var, oysa bu efekt döngüye girmiyordu: eylemi
   * `setChatOpen(true)` — tekrarı zararsız, üstelik mutasyon çağırmıyor. Yine de aynı desende
   * duruyor çünkü ikizi olan `?dm=` **tam olarak bu güvene dayanıp** canlıda kırıldı
   * (`lib/deep-link.ts`). Tek satırlık farkla ayrışan iki kopya, bu turda defalarca görülen
   * hata sınıfının ta kendisi.
   */
  const [params, setParams] = useSearchParams();
  const chatLatch = useRef<string | null>(null);
  useEffect(() => {
    const step = deepLinkAction(params.get('chat'), true, chatLatch.current);
    chatLatch.current = step.handled;
    if (!step.act || params.get('chat') !== '1') return;
    setChatOpen(true);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('chat');
      return next;
    }, { replace: true });
  }, [params, setParams]);

  return (
    <div className="space-y-3">
      <Panel
        title={<><UserText>{alliance.name}</UserText> İttifağı Ana Sayfası</>}
        right={`Puan: ${fmt(alliance.score)} · Sıra: ${alliance.rank ?? '-'}`}
      >
        {/* İttifak Metni — herkes görür; Konsey+Lider düzenler (scr_web06 üst kutusu). */}
        <div className="border-b border-border px-3 py-2 text-sm">
          <span className="text-xs font-semibold text-muted">İttifak Metni: </span>
          {alliance.text
            ? <span className="whitespace-pre-wrap">{alliance.text}</span>
            : <span className="text-muted">— henüz yazılmamış —</span>}
        </div>

        {/**
          * ⭐⭐ BAŞLIK DÜĞMELERİ SADELEŞTİ (kullanıcı, 2026-08-09):
          * *"ittifak sohbeti, ittifak metni, ittifağa mesaj gibi butonlar topluca durunca kötü
          * görünüyorlar."* Lider için altı düğme yan yanaydı ve dar ekranda üç satıra yayılıyordu.
          *
          * ⚠️ Ayrım keyfî değil: **ana eylem dışarıda, yönetim menüde.** Sohbet her rolün her
          * gün kullandığı tek düğme — onu menüye gömmek en sık işi bir tık uzağa iterdi.
          * Ayrılma/dağıtma da menüde ama **ayırıcının altında ve kırmızı**: geri alınamaz
          * eylemlerin yanlışlıkla tıklanmaması için ayrı bir bölge.
          */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {/* ⭐ Rol koşulu YOK — Asker de sohbete girer (yazma hakkı sunucuda kararlaşıyor). */}
          <Button onClick={() => setChatOpen(true)}>İttifak Sohbeti</Button>

          <Popover
            label="İttifak işlemleri"
            width={230}
            trigger={(
              <span className="tex-header inline-flex items-center gap-1.5 rounded-[var(--radius-sm)]
                border-2 border-strong bg-surface px-3 py-2 text-sm font-medium text-ink
                shadow-[var(--bevel)] hover:bg-raised active:translate-y-px">
                İşlemler <span aria-hidden className="text-[10px]">▾</span>
              </span>
            )}
          >
            {/* ⚠️ `close` ŞART: madde seçilince menü kapanmalı. Onay penceresi menünün
                ÜSTÜNDE açılıyordu ve ikisi birden ekranda kalıyordu (kullanıcı bildirdi). */}
            {(close) => (
              <span className="flex flex-col gap-1">
                {isCouncil ? (
                  <>
                    <MenuItem onClick={() => { close(); setPanel('text'); }}>
                      İttifak Metni
                    </MenuItem>
                    <MenuItem onClick={() => { close(); setPanel('message'); }}>
                      İttifağa Mesaj
                    </MenuItem>
                  </>
                ) : null}
                {isLeader ? (
                  <MenuItem onClick={() => { close(); setPanel('rename'); }}>
                    İttifak Adı Değiştir
                  </MenuItem>
                ) : null}

                <span className="my-0.5 block border-t border-border" />
                {/*
                  ⚠️⚠️ **LİDERDE «AYRIL» HİÇ ÇİZİLMİYOR** (2026-08-21). Lider hiçbir koşulda
                  ayrılamıyor: üye varsa önce Liderlik Devri (`leader_must_transfer`), tek
                  kalmışsa İttifağı Dağıt (`must_disband`). Yani liderde bu madde **her zaman**
                  hataya düşerdi — tıklanabilir ama asla çalışmayan bir menü satırı.

                  ⚠️ Son üye lider için kural 2026-08-21'de değişti: eskiden «Ayrıl» sunucuda
                  sessizce DAĞITIYORDU (kullanıcı: *"ittifağı dağıtmadan son kişi ayrılamaz"*).
                  Çıkış yolu kaybolmuyor — hemen altındaki «İttifağı Dağıt» maddesi liderde
                  her zaman görünüyor ve kendi onayını istiyor.
                */}
                {isLeader ? null : (
                  <MenuItem danger disabled={leave.isPending}
                    onClick={() => {
                      close();
                      void confirm({
                        title: 'İttifaktan Ayrıl',
                        body: 'İttifağı terk ediyorsunuz. Emin misiniz!',
                        danger: true,
                      }).then((ok) => { if (ok) leave.mutate(); });
                    }}>İttifaktan Ayrıl</MenuItem>
                )}
                {isLeader ? (
                  <MenuItem danger disabled={disband.isPending}
                    onClick={() => {
                      close();
                      void confirm({
                        title: 'İttifağı Dağıt',
                        body: 'Kendi ittifağınız dağıtılacak. Emin misiniz!',
                        danger: true,
                      }).then((ok) => { if (ok) disband.mutate(); });
                    }}>İttifağı Dağıt</MenuItem>
                ) : null}
              </span>
            )}
          </Popover>
        </div>
        <div className="px-3 pb-2">
          <ErrorBox error={leave.error ?? disband.error} />
        </div>

        {panel === 'text' ? <TextEditor initial={alliance.text} onClose={() => setPanel('none')} /> : null}
        {panel === 'message' ? (
          <BroadcastBox memberCount={alliance.memberCount} onClose={() => setPanel('none')} />
        ) : null}
        {panel === 'rename' ? <RenameBox onClose={() => setPanel('none')} /> : null}
        {/* ⚠️ Sheet EKRANA bağlı, `Shell`e değil (DM penceresinin aksine): başka sayfaya
            geçilince unmount olur → WS odası terk edilir, sorgular durur. Kullanıcı şartı
            "kapalıyken kaynak harcamasın" böyle YAPISAL olarak sağlanıyor. */}
        {chatOpen ? <AllianceChatSheet onClose={() => setChatOpen(false)} /> : null}
      </Panel>

      <Panel title="Üyeler" right={`${fmt(alliance.memberCount)} üye`}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th className="w-10 text-center">#</Th>
              <Th>Oyuncu</Th>
              <Th className="w-24 text-right">Puan</Th>
              <Th className="w-14 text-center">Sıra</Th>
              {/* ⚠️ Bu «Rütbe» İTTİFAK ROLÜdür (Asker/Konsey/Lider). Askerî rütbe için ayrı bir
                  sütun **istenmedi** (kullanıcı, `docs/arsiv/ek_bilgiler.txt`): rozet oyuncu
                  adının başında duruyor, ipucu adını ve kalan gününü yazıyor. Zaten dar olan
                  tabloya yedinci sütun eklemek mobilde taşırıyordu. */}
              <Th className="w-28">Rütbe</Th>
              <Th className="w-16 text-center">Durum</Th>
              <Th className="w-16 text-right">İşlem</Th>
            </tr>
          </thead>
          <tbody>
            {alliance.members.map((m, i) => (
              <MemberLine key={m.playerId} m={m} index={page * 20 + i}
                myRole={alliance.myRole} alt={i % 2 === 1} />
            ))}
          </tbody>
        </table>
        {alliance.pages > 1 ? (
          <div className="flex items-center justify-center gap-3 border-t border-border px-3 py-1.5 text-xs">
            <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => setPage(page - 1)}>◀</Button>
            <span className="tnum">Sayfa: {page + 1} / {alliance.pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= alliance.pages - 1}
              onClick={() => setPage(page + 1)}>▶</Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

/** Açılır menü maddesi — başlık menüsü ve üye menüsü aynı görünümü paylaşsın diye tek yerde. */
function MenuItem({ children, onClick, danger = false, disabled = false }: {
  children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13px]
        hover:bg-raised disabled:opacity-45 ${danger ? 'text-danger' : 'text-ink'}`}>
      {children}
    </button>
  );
}

function MemberLine({ m, index, myRole, alt }: {
  m: AllianceMember; index: number; myRole: number; alt: boolean;
}) {
  const confirm = useConfirm();
  const act = useAllianceMemberAction();
  const role = ROLE_LABEL[m.role] ?? ROLE_LABEL[1]!;
  const isLeaderMe = myRole === 3;
  /* Konsey yalnız Asker'i atabilir; Lider herkesi (lider satırı hariç). Kendi satırında işlem yok. */
  const canKick = m.role !== 3 && (isLeaderMe || (myRole === 2 && m.role === 1));

  const run = (action: 'kick' | 'promote' | 'demote' | 'transfer', text: string): void => {
    // ⭐ Yetki modalının başlığı = üyenin adı → aynen (kullanıcı, 2026-08-09).
    void confirm({ title: <UserText>{m.username}</UserText>, body: text, danger: action === 'kick' })
      .then((ok) => { if (ok) act.mutate({ playerId: m.playerId, action }); });
  };

  /**
   * Bu satırda kimin neyi yapabileceği — **tek yerde**. Eskiden dört ayrı JSX koşuluydu;
   * menüye taşınırken listeye çevrildi, böylece "hiç işlem yoksa menüyü çizme" kararı tek bir
   * `length` kontrolüne indi.
   */
  const actions: { action: 'kick' | 'promote' | 'demote' | 'transfer'; label: string;
    confirm: string; danger?: boolean }[] = [];
  if (canKick) {
    actions.push({ action: 'kick', label: 'İttifaktan At', danger: true,
      confirm: 'Oyuncu ittifaktan çıkarılacak. Emin misiniz!' });
  }
  if (isLeaderMe && m.role === 1) {
    actions.push({ action: 'promote', label: 'Konseye Al',
      confirm: 'Oyuncu konsey üyesi yapılacak. Emin misiniz!' });
  }
  if (isLeaderMe && m.role === 2) {
    actions.push({ action: 'demote', label: 'Konseyden Çıkar',
      confirm: 'Oyuncu konseyden çıkarılacak. Emin misiniz!' });
  }
  if (isLeaderMe && m.role !== 3) {
    actions.push({ action: 'transfer', label: 'Liderliği Devret',
      confirm: 'İttifak liderliğinizi devir ediyorsunuz. Emin misiniz!' });
  }

  return (
    /**
     * ⭐ Ünvanlı satır renklenir — **yalnız ittifak sayfasında** (kullanıcı isteği).
     * ⚠️ Ünvan rengi `bg-row-alt`i EZER: zebra deseni yalnız okumayı kolaylaştıran bir süs,
     * ünvan ise bilgi. İkisini birleştirseydik tek numaralı satırdaki Mareşal ile çift
     * numaralıdaki farklı görünürdü.
     */
    <tr className={`h-8 border-b border-border ${
      m.meritTier != null ? MERIT_ROW_CLASS[m.meritTier] ?? '' : alt ? 'bg-row-alt' : ''
    }`}>
      <Td className="tnum text-center">{index + 1}</Td>
      <Td className="max-w-[9rem]">
        {/* Rozet adın ÖNÜNDE (kullanıcı isteği). `truncate` iç `span`e taşındı: dış hücrede
            kalsaydı rozeti de kırpardı. */}
        <span className="flex items-center gap-1.5">
          <MeritBadge tier={m.meritTier} expiresAt={m.meritExpiresAt} size={18} />
          <span className="truncate">{m.username}</span>
        </span>
      </Td>
      <Td className="tnum text-right">{fmt(m.score)}</Td>
      <Td className="tnum text-center">{m.worldRank ?? '-'}</Td>
      <Td><Badge tone={role.tone}>{role.text}</Badge></Td>
      <Td className="text-center">
        {/**
          * ⭐ Çevrimiçilik yalnız ittifak içinde görünür (kullanıcı kuralı) — yeşil/kırmızı nokta.
          * ⭐ §tatil modu üçüncü hâli ekliyor: **mavi «Tatilde»**.
          *
          * ⚠️ Burada nokta YETMEZ, metin de yazılıyor. İki renk (yeşil/kırmızı) sezgisel;
          * üçüncü renk değil — mavi noktanın ne demek olduğu tahmin edilemez ve renk körü
          * bir oyuncu için yeşil/mavi ayrımı zaten yok. Sağ paneldeki liste de aynı üç
          * kelimeyi yazıyor, ikisi tutarlı kalıyor.
          */}
        <span title={m.onVacation ? 'tatil modunda' : m.online ? 'çevrimiçi' : 'çevrimdışı'}
          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
            m.onVacation ? 'text-info' : m.online ? 'text-success' : 'text-danger'
          }`}>
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full border border-strong ${
            m.onVacation ? 'bg-info' : m.online ? 'bg-success' : 'bg-danger'
          }`} />
          {m.onVacation ? 'Tatilde' : null}
        </span>
      </Td>
      <Td className="text-right">
        {/**
          * ⭐⭐ İŞLEMLER TEK AÇILIR MENÜDE (kullanıcı, 2026-08-09).
          *
          * ⚠️ Eskiden dört düğme yan yana çiziliyordu ve lider için hepsi birden görünüyordu:
          * *"birden fazla buton görüyor, bu da görüntü bozukluğuna sebep oluyor."* Sütun
          * genişliği sabit (`w-40`) olduğu için düğmeler alt satıra kayıyor, satır yüksekliği
          * oynuyor ve tablo dalgalanıyordu.
          *
          * ⚠️ Menü `Popover` ile — yeni bir konumlandırma kodu YAZILMADI. "Ekrandan taşmadan
          * aç/kapa, dışarı tıklayınca kapan, Esc" davranışı orada zaten çözülmüş ve testli
          * (`popover-place.test.ts`). Tablo hücresi `overflow` kesen bir kapsayıcı; portala
          * çizilmeseydi menü kırpılırdı.
          * ⚠️ Hiç yetki yoksa menü düğmesi HİÇ çizilmez — boş bir menü açan üç nokta,
          * dört düğmeden daha kafa karıştırıcı olurdu.
          */}
        {actions.length === 0 ? null : (
          <Popover
            label={`${m.username} için işlemler`}
            width={200}
            trigger={(
              <span className="inline-flex h-6 w-7 items-center justify-center rounded-[var(--radius-sm)]
                border border-border text-sm leading-none text-muted hover:border-accent hover:text-accent">
                ⋯
              </span>
            )}
          >
            {(close) => (
              <span className="flex flex-col gap-1">
                {actions.map((a) => (
                  <MenuItem key={a.action} danger={a.danger} disabled={act.isPending}
                    onClick={() => { close(); run(a.action, a.confirm); }}>
                    {a.label}
                  </MenuItem>
                ))}
              </span>
            )}
          </Popover>
        )}
      </Td>
    </tr>
  );
}

/* ── Küçük paneller ──────────────────────────────────────────────────────────── */

/** Metin kutularının ortak üst sınırı — sunucudaki `alliance.service.ts` sınırıyla aynı. */
const TEXT_MAX = 500;

/**
 * Modal başındaki açıklama şeridi — "bu yazıyı kim görecek" sorusunun cevabı.
 *
 * İkisi de geri alınamaz bir yayına çıkıyor (metni herkes görür, mesaj kutulardan silinemez);
 * bunu onay diyaloğuna bırakmak GEÇ oluyordu: oyuncu metni yazdıktan SONRA öğreniyordu.
 */
function ModalNote({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-border
      bg-raised px-2.5 py-2 text-xs leading-relaxed text-muted">
      <span aria-hidden className="shrink-0 text-sm leading-none">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Karakter sayacı. Son 50 karakterde renk değişir: sınıra dayanan oyuncu kutunun sessizce
 * yazmayı bıraktığını (`maxLength` fazlasını yutuyor) başka türlü fark etmiyor.
 */
function CharCount({ value }: { value: string }) {
  const near = value.length > TEXT_MAX - 50;
  return (
    <div className={`text-right text-[11px] tnum ${near ? 'text-danger' : 'text-muted'}`}>
      {value.length}/{TEXT_MAX}
    </div>
  );
}

/** İki metin kutusunun ortak biçimi: sürüklenerek boyutlandırılmaz, odakta çerçevesi belirginleşir. */
const FIELD_CLASS = 'resize-none leading-relaxed focus:border-strong focus:outline-none';

function TextEditor({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const save = useAllianceText();
  const confirm = useConfirm();
  // Değişiklik yokken kaydetmek boş bir onay + boş bir istek demek; düğme kapalı kalsın.
  const unchanged = text.trim() === initial.trim();

  return (
    <Modal title="İttifak Metni" onClose={onClose} width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={unchanged || save.isPending} onClick={() => {
            void confirm({ title: 'İttifak Metni', body: 'İttifak metni değiştirilecek. Emin misiniz!' })
              .then((ok) => { if (ok) save.mutate({ text }, { onSuccess: onClose }); });
          }}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</Button>
        </>
      }>
      <div className="space-y-2.5 px-3 py-3">
        {/* ⚠️ Metin 2026-08-09'da HERKESE AÇIK oldu (sıralama/arama künye modalı). Uyarı da
            güncellendi: yazan kişi kimin okuyacağını yazmadan ÖNCE bilmeli. */}
        <ModalNote icon="📜">
          İttifak metni <b className="text-ink">herkese açıktır</b>: üyelerin yanı sıra
          sıralama ve arama ekranlarından ittifağınıza bakan <b className="text-ink">tüm
          oyuncular</b> okur. Başvuru almak için bir tanıtım yazısı gibi düşünün.
        </ModalNote>
        <TextArea
          value={text} maxLength={TEXT_MAX} rows={7}
          onChange={(e) => setText(e.target.value)}
          placeholder="İttifağın tanıtımı, kuralları, buluşma saatleri…"
          aria-label="İttifak metni"
          className={FIELD_CLASS}
        />
        <CharCount value={text} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  );
}

function BroadcastBox({ memberCount, onClose }: { memberCount: number; onClose: () => void }) {
  const [text, setText] = useState('');
  const send = useAllianceBroadcast();
  const confirm = useConfirm();
  const empty = text.trim().length === 0;

  return (
    <Modal title="İttifağa Mesaj" onClose={onClose} width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={empty || send.isPending} onClick={() => {
            void confirm({ title: 'İttifağa Mesaj', body: 'Mesaj gönderilecek. Emin misiniz!' })
              .then((ok) => { if (ok) send.mutate({ text }, { onSuccess: onClose }); });
          }}>{send.isPending ? 'Gönderiliyor…' : 'Gönder'}</Button>
        </>
      }>
      <div className="space-y-2.5 px-3 py-3">
        {/* ⚠️ Alıcı sayısı GÖNDERENİ DE kapsıyor (sunucu `alliance_id` eşleşen herkese yazıyor) —
            "5 üyeye" deyip 6 satır yazmak sayıyı yanlış gösterirdi. */}
        <ModalNote icon="✉">
          Mesaj <b className="text-ink">{fmt(memberCount)} üyenin</b> posta kutusuna ayrı ayrı
          düşer ve <b className="text-ink">geri alınamaz</b>.
        </ModalNote>
        <TextArea
          value={text} maxLength={TEXT_MAX} rows={6}
          onChange={(e) => setText(e.target.value)}
          placeholder="Üyelere iletmek istediğin duyuru…"
          aria-label="İttifak mesajı"
          className={FIELD_CLASS}
        />
        <CharCount value={text} />
        <ErrorBox error={send.error} />
      </div>
    </Modal>
  );
}

function RenameBox({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const rename = useAllianceRename();
  return (
    <Modal title="İttifak Adı Değiştir" onClose={onClose}>
      <div className="space-y-2">
        <Input value={name} maxLength={10} placeholder="Yeni ittifak adı"
          onChange={(e) => setName(e.target.value)} aria-label="Yeni ittifak adı" />
        <ErrorBox error={rename.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={name.trim().length < 3 || rename.isPending}
            onClick={() => rename.mutate({ name: name.trim() }, { onSuccess: onClose })}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  );
}
