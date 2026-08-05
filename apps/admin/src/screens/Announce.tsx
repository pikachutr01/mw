/**
 * ⭐ DUYURU — yöneticiden oyunculara sistem mesajı (kullanıcı isteği, `ek_bilgiler`).
 *
 * ⚠️ **Kendi sekmesi, «Moderasyon»un altı değil.** Moderasyon bir oyuncuya KARŞI yapılan işi
 * (yasak, uyarı, şikâyet) topluyor; duyuru ise oyunculara YÖNELİK bir bilgilendirme. İkisini
 * aynı ekrana koymak, "herkese duyuru" düğmesini ceza düğmelerinin arasına yerleştirmek
 * olurdu.
 *
 * ⚠️ Ekranın ikinci yarısı (gönderilenler + okunma sayacı) süs değil: duyuru yöneticinin
 * kendi posta kutusuna DÜŞMÜYOR, dolayısıyla o liste olmadan "gitti mi, kaç kişi açtı"
 * sorusunun cevabı hiçbir yerde yok.
 */
import { useCallback, useEffect, useState } from 'react';
import { formatGameTime } from '@mobilwar/contracts';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import {
  Alert, Button, DangerConfirm, Empty, ErrorBox, Field, Info, Input, Loading, Panel, Select,
} from '../components/ui.tsx';

interface SentRow {
  subject: string; at: string; text: string;
  recipients: number; readCount: number; target: string | null;
}
interface PlayerLite { id: number; username: string; worldId: number }

const SUBJECT_MAX = 120;
const TEXT_MAX = 4000;

export function AnnounceScreen({ worldId, onNeedStepUp }: {
  worldId: number; onNeedStepUp: () => void;
}) {
  const [scope, setScope] = useState<'world' | 'player'>('world');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  const [players, setPlayers] = useState<PlayerLite[] | null>(null);
  const [sent, setSent] = useState<SentRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setSent(await api<SentRow[]>(`/api/v1/admin/messages?worldId=${worldId}`));
    } catch (err) {
      setError(err);
    }
  }, [worldId]);

  useEffect(() => { void load(); }, [load]);

  // Oyuncu listesi YALNIZ tek-oyuncu kipinde çekiliyor: duyuru kipinde hiç gerekmiyor.
  useEffect(() => {
    if (scope !== 'player' || players) return;
    void (async () => {
      try {
        const r = await api<{ items: PlayerLite[] }>('/api/v1/admin/players?page=0&status=all');
        setPlayers(r.items.filter((p) => p.worldId === worldId));
      } catch (err) { setError(err); }
    })();
  }, [scope, players, worldId]);

  const ready = subject.trim().length > 0 && text.trim().length > 0
    && (scope === 'world' || playerId != null);

  const send = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ sent: number; target: string | null }>('/api/v1/admin/messages', {
        method: 'POST',
        body: {
          worldId, scope, subject: subject.trim(), text: text.trim(),
          ...(scope === 'player' ? { playerId } : {}),
        },
      });
      setNote(scope === 'player'
        ? `Mesaj ${r.target ?? 'oyuncuya'} iletildi.`
        : `Duyuru ${r.sent.toLocaleString('tr-TR')} oyuncunun posta kutusuna düştü.`);
      setSubject(''); setText('');
      await load();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel title="Duyuru gönder">
        <div className="space-y-3 p-3">
          <ErrorBox error={error} />
          {note ? <Alert tone="info">{note}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kime">
              <Select value={scope} onChange={(e) => setScope(e.target.value as 'world' | 'player')}>
                <option value="world">Herkese (bu dünya)</option>
                <option value="player">Tek oyuncuya</option>
              </Select>
            </Field>
            {scope === 'player' ? (
              <Field label="Oyuncu">
                {players ? (
                  <Select
                    value={playerId ?? ''}
                    onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— seç —</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.username}</option>
                    ))}
                  </Select>
                ) : <Loading>Oyuncular yükleniyor…</Loading>}
              </Field>
            ) : null}
          </div>

          <Field label="Konu" hint={`${subject.length}/${SUBJECT_MAX} · posta kutusu listesinde bu satır görünür`}>
            <Input
              value={subject} maxLength={SUBJECT_MAX}
              placeholder="Örn. Gece penceresi Türkiye saatine taşındı"
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <Field label="Metin" hint={`${text.length}/${TEXT_MAX} · satır sonları korunur, biçimlendirme yok`}>
            <textarea
              value={text} maxLength={TEXT_MAX} rows={7}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1.5
                text-sm text-ink outline-none focus:border-accent"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            {scope === 'world' ? (
              <DangerConfirm
                label="Herkese gönder"
                confirmLabel="Evet, herkese gönder"
                disabled={!ready || busy}
                busy={busy}
                onConfirm={() => { void send(); }}
              />
            ) : (
              <Button disabled={!ready || busy} onClick={() => { void send(); }}>
                {busy ? 'gönderiliyor…' : 'Gönder'}
              </Button>
            )}
            <Info label="duyuru nasıl görünür">
              Oyuncunun <b>Mesajlar</b> sekmesine düşer (Raporlar'a değil), rapor gibi modalda
              açılır ve <b>açılınca okunmuş sayılır</b>. Gönderen olarak bir yönetici adı
              görünmez — mesaj sistemden gelmiş sayılır; kimin gönderdiği yalnız denetim
              kaydında durur.
              <br /><br />
              <b>Geri alınamaz:</b> gönderilen duyuru binlerce posta kutusuna düşer ve
              toplanamaz. Bu yüzden gönderim <b>adım yükseltme</b> istiyor.
            </Info>
          </div>
        </div>
      </Panel>

      <Panel title="Gönderilen duyurular" right={sent ? `${sent.length} kayıt` : undefined}>
        {!sent ? <Loading /> : sent.length === 0 ? (
          <Empty>Bu dünyada henüz sistem mesajı gönderilmedi.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {sent.map((row) => (
              <li key={`${row.at}:${row.subject}`} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-sm text-ink">{row.subject}</b>
                  <span className="text-[11px] text-muted">{formatGameTime(row.at)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {row.target ? <>Özel · <b className="text-ink">{row.target}</b></> : (
                    <>Duyuru · {row.recipients.toLocaleString('tr-TR')} alıcı</>
                  )}
                  {' · '}
                  {/* Okunma oranı duyurunun ULAŞTIĞINI değil, AÇILDIĞINI ölçüyor. */}
                  <span className={row.readCount > 0 ? 'text-success' : undefined}>
                    {row.readCount.toLocaleString('tr-TR')} okundu
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-ink/80">
                  {row.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
