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
import { useState } from 'react';
import { fmt } from '../lib/hooks.ts';
import {
  useAlliance, useAllianceApply, useAllianceBroadcast, useAllianceDisband, useAllianceFound,
  useAllianceLeave, useAllianceMemberAction, useAllianceRename, useAllianceSearch,
  useAllianceText, type AllianceMember,
} from '../lib/queries.ts';
import {
  Badge, Button, Empty, ErrorBox, Input, Panel, Skeleton, Td, TextArea, Th,
} from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';
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
                            title: `${a.name} ittifağına başvuru`,
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
  const isLeader = alliance.myRole === 3;
  const isCouncil = alliance.myRole >= 2;

  return (
    <div className="space-y-3">
      <Panel
        title={`${alliance.name} İttifağı Ana Sayfası`}
        right={`Puan: ${fmt(alliance.score)} · Sıra: ${alliance.rank ?? '-'}`}
      >
        {/* İttifak Metni — herkes görür; Konsey+Lider düzenler (scr_web06 üst kutusu). */}
        <div className="border-b border-border px-3 py-2 text-sm">
          <span className="text-xs font-semibold text-muted">İttifak Metni: </span>
          {alliance.text
            ? <span className="whitespace-pre-wrap">{alliance.text}</span>
            : <span className="text-muted">— henüz yazılmamış —</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {isCouncil ? (
            <>
              <Button variant="ghost" onClick={() => setPanel(panel === 'text' ? 'none' : 'text')}>
                İttifak Metni
              </Button>
              <Button variant="ghost" onClick={() => setPanel(panel === 'message' ? 'none' : 'message')}>
                İttifağa Mesaj
              </Button>
            </>
          ) : null}
          {isLeader ? (
            <>
              <Button variant="ghost" onClick={() => setPanel(panel === 'rename' ? 'none' : 'rename')}>
                İttifak Adı Değiştir
              </Button>
              <Button variant="danger" disabled={disband.isPending}
                onClick={() => {
                  void confirm({
                    title: 'İttifağı Dağıt',
                    body: 'Kendi ittifağınız dağıtılacak. Emin misiniz!',
                    danger: true,
                  }).then((ok) => { if (ok) disband.mutate(); });
                }}>İttifağı Dağıt</Button>
            </>
          ) : null}
          <Button variant="danger" disabled={leave.isPending}
            onClick={() => {
              void confirm({
                title: 'İttifaktan Ayrıl',
                body: 'İttifağı terk ediyorsunuz. Emin misiniz!',
                danger: true,
              }).then((ok) => { if (ok) leave.mutate(); });
            }}>İttifaktan Ayrıl</Button>
        </div>
        <div className="px-3 pb-2">
          <ErrorBox error={leave.error ?? disband.error} />
        </div>

        {panel === 'text' ? <TextEditor initial={alliance.text} onClose={() => setPanel('none')} /> : null}
        {panel === 'message' ? <BroadcastBox onClose={() => setPanel('none')} /> : null}
        {panel === 'rename' ? <RenameBox onClose={() => setPanel('none')} /> : null}
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
              <Th className="w-40 text-right">İşlem</Th>
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
    void confirm({ title: m.username, body: text, danger: action === 'kick' })
      .then((ok) => { if (ok) act.mutate({ playerId: m.playerId, action }); });
  };

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
        <span className="flex flex-wrap justify-end gap-1">
          {canKick ? (
            <Button size="sm" variant="danger" disabled={act.isPending}
              onClick={() => run('kick', 'Oyuncu ittifaktan çıkarılacak. Emin misiniz!')}>At</Button>
          ) : null}
          {isLeaderMe && m.role === 1 ? (
            <Button size="sm" variant="ghost" disabled={act.isPending}
              onClick={() => run('promote', 'Oyuncu konsey üyesi yapılacak. Emin misiniz!')}>Konseye Al</Button>
          ) : null}
          {isLeaderMe && m.role === 2 ? (
            <Button size="sm" variant="ghost" disabled={act.isPending}
              onClick={() => run('demote', 'Oyuncu konseyden çıkarılacak. Emin misiniz!')}>Konseyden Çıkar</Button>
          ) : null}
          {isLeaderMe && m.role !== 3 ? (
            <Button size="sm" variant="ghost" disabled={act.isPending}
              onClick={() => run('transfer', 'İttifak liderliğinizi devir ediyorsunuz. Emin misiniz!')}>Devret</Button>
          ) : null}
        </span>
      </Td>
    </tr>
  );
}

/* ── Küçük paneller ──────────────────────────────────────────────────────────── */

function TextEditor({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const save = useAllianceText();
  const confirm = useConfirm();
  return (
    <Modal title="İttifak Metni" onClose={onClose} width="md">
      <div className="space-y-2">
        <TextArea
          value={text} maxLength={500} rows={6}
          onChange={(e) => setText(e.target.value)}
          aria-label="İttifak metni"
        />
        <div className="text-right text-[11px] text-muted tnum">{text.length}/500</div>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={save.isPending} onClick={() => {
            void confirm({ title: 'İttifak Metni', body: 'İttifak metni değiştirilecek. Emin misiniz!' })
              .then((ok) => { if (ok) save.mutate({ text }, { onSuccess: onClose }); });
          }}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  );
}

function BroadcastBox({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const send = useAllianceBroadcast();
  const confirm = useConfirm();
  return (
    <Modal title="İttifağa Mesaj" onClose={onClose} width="md">
      <div className="space-y-2">
        <p className="text-xs text-muted">Mesaj TÜM üyelerin posta kutusuna gönderilir.</p>
        <TextArea
          value={text} maxLength={500} rows={4}
          onChange={(e) => setText(e.target.value)}
          aria-label="İttifak mesajı"
        />
        <ErrorBox error={send.error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={text.trim().length === 0 || send.isPending} onClick={() => {
            void confirm({ title: 'İttifağa Mesaj', body: 'Mesaj gönderilecek. Emin misiniz!' })
              .then((ok) => { if (ok) send.mutate({ text }, { onSuccess: onClose }); });
          }}>Gönder</Button>
        </div>
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
