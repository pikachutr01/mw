/**
 * ⭐ BAĞLANTILI HESAPLAR (§9.1) — çoklu hesap şüphesinin skorlu raporu.
 *
 * ⚠️ **Bu ekran ceza vermez ve veremez.** Çıktı bir liste; kararı sen verirsin. Ekran bunu
 * susarak değil, her sinyalin yanında **masum açıklamasını** göstererek yapıyor: yüksek bir
 * skor "suçlu" gibi hissettirir, oysa aynı evdeki iki kardeş de aynı skoru üretir. Ceza vermek
 * için «Oyuncular» sekmesindeki künyeye gidilir — ayrı işlem, ayrı denetim kaydı.
 *
 * ⚠️ Skorlar **canlı hesaplanıyor**: ayarlardaki bir ağırlığı değiştirip buraya dönünce etkisi
 * anında görünür. Kalıcı `abuse_signals` satırları yalnız KARARLARI taşıyor.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import { formatGameTime } from '@mobilwar/contracts';
import {
  Alert, Badge, Button, Empty, ErrorBox, Info, Input, Loading, Panel,
} from '../components/ui.tsx';

interface Player { id: number; username: string; accountId: number }

interface Signal {
  kind: string;
  score: number;
  evidence: Record<string, unknown>;
}

interface Pair {
  worldId: number;
  a: Player;
  b: Player;
  score: number;
  signals: Signal[];
  resolved: { resolution: string; note: string | null; at: string; by: string | null } | null;
}

interface LinksResponse {
  config: {
    reportThreshold: number;
    weights: Record<string, number>;
    maxGroupSize: number;
    lookbackDays: number;
    cohortMinutes: number;
    handoffMinutes: number;
  };
  signalInfo: Record<string, { label: string; innocent: string }>;
  ipChain: {
    players: number; distinctIps: number; topIp: string | null;
    topIpPlayers: number; suspect: boolean; topIpLocal: boolean;
  };
  asn: { rows: number; refreshedAt: string; source: string; ageHours: number } | null;
  scan: {
    windowFrom: string; windowTo: string; finishedAt: string;
    signals: number; players: number; emailed: boolean;
  } | null;
  items: Pair[];
}

const RESOLUTION_LABEL: Record<string, string> = {
  innocent: 'masum', watch: 'izlemede', warned: 'uyarıldı', banned: 'cezalandırıldı',
};

const RESOLUTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  innocent: 'success', watch: 'warning', warned: 'warning', banned: 'danger',
};

const when = (iso: string): string => formatGameTime(iso);

export function AbuseScreen({ worldId, onNeedStepUp }: {
  worldId: number; onNeedStepUp: () => void;
}) {
  const [data, setData] = useState<LinksResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  /** Boş = sunucunun rapor eşiği. Yönetici geçici olarak aşağı indirip listeyi genişletebilir. */
  const [minScore, setMinScore] = useState('');
  /**
   * ⚠️ Kutuya yazılan değer ile SORGULANAN değer ayrı. Tek durum kullansaydım her tuş vuruşu
   * bir istek atardı ve o istek beş ayrı öz-birleştirme (self-join) koşturuyor — «120» yazmak
   * üç tarama demekti. Aynı gerekçe `ui.tsx`teki `SearchInput`ta da yazılı; burada sayı
   * kutusu olduğu için o bileşen kullanılamadı.
   */
  const [applied, setApplied] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setApplied(minScore.trim()), 350);
    return () => clearTimeout(t);
  }, [minScore]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams({ worldId: String(worldId) });
      if (applied !== '') q.set('minScore', applied);
      setData(await api<LinksResponse>(`/api/v1/admin/abuse/links?${q.toString()}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [worldId, applied]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <IpChainCard chain={data?.ipChain} />
      <AsnCard status={data?.asn ?? null} onNeedStepUp={onNeedStepUp} onDone={() => void load()} />
      <ScanCard
        scan={data?.scan ?? null} worldId={worldId}
        onNeedStepUp={onNeedStepUp} onDone={() => void load()}
      />

      <Panel
        title="Bağlantılı hesaplar"
        right={
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              eşik
              <Input
                type="number" min={1} max={500} placeholder={String(data?.config.reportThreshold ?? 60)}
                value={minScore} onChange={(e) => setMinScore(e.target.value)}
                className="tnum w-16 py-0.5 text-right"
              />
            </label>
            <Button variant="ghost" onClick={() => void load()}>Yenile</Button>
          </span>
        }
      >
        <div className="border-b border-border px-3 py-2">
          <Alert tone="info">
            <b>Bu liste bir suçlama değildir.</b> Her teknik izin masum açıklaması var: aynı
            evdeki kardeşler, okul/ofis ağı, mobil operatör NAT’ı, paylaşılan tablet.
            Sistem <b>hiçbir koşulda otomatik ceza vermez</b> — ceza vermek istersen oyuncunun
            künyesine git. Karar vermeden önce <b>davranışa</b> bak: kaynak akışı tek yönlü mü,
            saldırılar kârsız mı, savunma bilerek zayıf mı?
          </Alert>
        </div>

        {data ? <ConfigLine config={data.config} /> : null}
        <ErrorBox error={error} />

        {loading && !data ? <Loading /> : null}
        {data && data.items.length === 0 ? (
          <Empty>
            Eşiği ({applied || data.config.reportThreshold} puan) geçen çift yok.
          </Empty>
        ) : null}

        <ul className="divide-y divide-border">
          {(data?.items ?? []).map((p) => (
            <PairRow
              key={`${p.a.id}:${p.b.id}`}
              pair={p}
              info={data!.signalInfo}
              threshold={data!.config.reportThreshold}
              onNeedStepUp={onNeedStepUp}
              onChanged={() => void load()}
            />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ═══ IP zinciri teşhisi ════════════════════════════════════════════════════ */

/**
 * ⭐ Cloudflare arkasında `ops/nginx/cloudflare-realip.conf` sunucuda yüklü DEĞİLSE her oyuncu
 * aynı edge IP'siyle kaydedilir ve bu ekranın IP sinyalleri **sessizce** değersizleşir: tablo
 * dolu görünür, sorgular çalışır, sonuçlar anlamsızdır.
 *
 * ⚠️ Bu kart, o sessizliği bozmak için var. Cloudflare IP listesini kopyalamak yerine
 * bozukluğun kendisi ölçülüyor (herkes tek IP'de mi) — liste bayatlamaz, yanlış alarm vermez.
 */
function IpChainCard({ chain }: { chain?: LinksResponse['ipChain'] }) {
  if (!chain) return null;
  const share = chain.players > 0
    ? Math.round((chain.topIpPlayers / chain.players) * 100) : 0;
  return (
    <Panel title="Gerçek IP zinciri" collapsible defaultOpen={chain.suspect}>
      <div className="space-y-2 px-3 py-2 text-xs">
        {/* ⚠️ İki farklı sebep, iki farklı cümle. Aynısını söyleseydik geliştirmede her gün
            yanlış bir teşhis okunur ve uyarı ciddiyetini kaybederdi. */}
        {chain.suspect && chain.topIpLocal ? (
          <Alert tone="warning">
            <b>IP sinyalleri anlamsız — yerel adres.</b> {chain.players} oyuncunun %{share}’i
            {' '}<code>{chain.topIp}</code> üzerinden görünüyor. Bu <b>geliştirme ortamında
            beklenen</b> durumdur (herkes aynı makineden geliyor), bozuk bir zincir değil.
            Canlıda aynı tablo çıkarsa <code>X-Forwarded-For</code> zincirine bak.
          </Alert>
        ) : chain.suspect ? (
          <Alert tone="danger">
            <b>IP sinyalleri güvenilmez.</b> {chain.players} oyuncunun %{share}’i tek bir
            genel IP’de görünüyor ({chain.topIp}). Bu neredeyse kesinlikle gerçek bir ağ
            değil, <b>Cloudflare kenar sunucusu</b>: <code>cloudflare-realip.conf</code>{' '}
            sunucuda yüklü değil ya da site bloğu <code>X-Forwarded-For</code>’a gerçek IP’yi
            yazmıyor. Düzelene kadar «Aynı IP» ve «Aynı IP öbeği» sinyallerini yok say.
          </Alert>
        ) : (
          <p className="text-muted">
            {chain.players} oyuncu, {chain.distinctIps} farklı IP. En kalabalık IP
            {' '}{chain.topIpPlayers} oyuncu (%{share}) taşıyor — zincir sağlıklı görünüyor.
          </p>
        )}
        <p className="text-[11px] text-muted">
          ⚠️ Az oyunculu bir dünyada herkesin aynı IP’de olması normaldir; uyarı ancak
          yeterli oyuncu varken çıkar.
        </p>
      </div>
    </Panel>
  );
}

/**
 * ⚠️ Sarmalayıcı `<p>` DEĞİL `<div>`: `Info` içeride `<details>` çiziyor ve `<details>` bir
 * paragrafın içinde **geçersiz HTML**. Tarayıcı bunu sessizce düzeltmiyor — `<p>`yi ⓘ'nın
 * önünde kapatıp kalan metni ayrı bir paragrafa atıyor, yani satır ikiye bölünüyordu.
 * (Konsol da uyarıyordu: *"`<details>` cannot be a descendant of `<p>`"*.)
 */
/* ═══ Davranış taraması ═════════════════════════════════════════════════════ */

/**
 * ⭐ DAVRANIŞ SİNYALLERİ (§9.1.2 B1·B2·B6·B7) — asıl güçlü olanlar.
 *
 * Teknik izler (cihaz, IP) taklit edilebilir; bilen biri hepsinden kaçar. Davranıştan
 * kaçamaz, çünkü davranış çoklu hesabın amacının kendisi.
 *
 * ⚠️ Bu sinyaller canlı DEĞİL, haftalık tarama koşusundan geliyor: `missions` ve `battles`
 * üzerinde toplama yapıyorlar ve her panel açılışında koşturmak bu ekranı dünyanın en yavaş
 * sayfası yapardı.
 */
function ScanCard({ scan, worldId, onNeedStepUp, onDone }: {
  scan: LinksResponse['scan'];
  worldId: number;
  onNeedStepUp: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ signals: number; pairs: number; reported: number; emailed: boolean }>(
        '/api/v1/admin/abuse/scan', { method: 'POST', body: { worldId } });
      setNote(`${r.signals} sinyal · ${r.pairs} çift · eşiği geçen ${r.reported}`
        + `${r.emailed ? ' · rapor postası kuyruğa alındı' : ''}`);
      onDone();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Davranış taraması" collapsible defaultOpen={scan == null}>
      <div className="space-y-2 px-3 py-2 text-xs">
        {scan == null ? (
          <Alert tone="warning">
            <b>Henüz hiç taranmadı.</b> Aşağıdaki liste yalnız <b>teknik</b> izleri
            (cihaz, IP) gösteriyor. Davranış sinyalleri — tek yönlü kaynak akışı, kârsız
            saldırı çiftliği, savunma tutarsızlığı, sessiz ortaklar — ancak tarama koştuktan
            sonra görünür.
          </Alert>
        ) : (
          <p className="text-muted">
            Son tarama <b className="text-ink">{when(scan.finishedAt)}</b> ·
            {' '}<b className="tnum text-ink">{scan.signals}</b> sinyal,
            {' '}<b className="tnum text-ink">{scan.players}</b> oyuncu
            {scan.emailed ? ' · rapor postası gönderildi' : ''}
            <br />
            <span className="text-[11px]">
              İncelenen aralık: {when(scan.windowFrom)} → {when(scan.windowTo)}
            </span>
          </p>
        )}
        {note ? <Alert tone="success">{note}</Alert> : null}
        <ErrorBox error={error} />
        <Button variant="ghost" disabled={busy} onClick={() => void run()}>
          {busy ? 'Taranıyor…' : 'Şimdi tara'}
        </Button>
        {/* ⚠️ `<div>`, `<p>` DEĞİL — `Info` içeride `<details>` çiziyor (bkz. `ui.tsx`). */}
        <div className="text-[11px] text-muted">
          Normalde <b>haftalık</b> koşar (aralık «Ayarlar → Çoklu hesap tespiti»nde).
          <Info label="pencere nasıl ilerliyor">
            Tarama ARTIMLI: her koşu bir öncekinin bittiği yerden devam eder, sabit bir
            «son 7 gün» penceresi kullanmaz. Böylece sunucu kapalı kalsa bile hiçbir aralık
            taranmadan geçmez. ⚠️ Elle koşu da aynı pencereyi ilerletir — ayrı bir
            «önizleme» kipi yok, olsaydı aynı çift iki kez rapora girerdi.
          </Info>
        </div>
      </div>
    </Panel>
  );
}

/* ═══ ASN veri kümesi ═══════════════════════════════════════════════════════ */

/**
 * ⭐ IP → AĞ ADI / ÜLKE künyesinin kaynağı: [iptoasn.com](https://iptoasn.com) anlık görüntüsü.
 *
 * ⚠️ Bu veri **sunucuda yerel bir tabloda** duruyor, istek başına bir servise sorulmuyor.
 * Gerekçe fiyat değil gizlilik: bir geolocation API'si çağırmak, her oyuncunun IP'sini
 * üçüncü bir tarafa göndermek olurdu.
 *
 * ⚠️ Tazeleme ELLE: otomatik olsaydı API her açılışta dış bir servise bağımlı hâle gelirdi.
 * Veri bayat kalsa bile hiçbir oyun mekaniği bozulmaz, yalnız künye eskir.
 */
function AsnCard({ status, onNeedStepUp, onDone }: {
  status: LinksResponse['asn'];
  onNeedStepUp: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ rows: number; backfill: { scanned: number; matched: number } }>(
        '/api/v1/admin/abuse/asn/refresh', { method: 'POST', body: {} });
      setNote(`${r.rows.toLocaleString('tr-TR')} aralık yüklendi · `
        + `${r.backfill.matched}/${r.backfill.scanned} eski IP künye kazandı.`);
      onDone();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  /** ⚠️ 30 günü geçen veri "eski": ASN devirleri seyrek ama olur, ad değişiklikleri daha sık. */
  const stale = status != null && status.ageHours > 24 * 30;

  return (
    <Panel title="ASN / ülke veri kümesi" collapsible defaultOpen={status == null}>
      <div className="space-y-2 px-3 py-2 text-xs">
        {status == null ? (
          <Alert tone="warning">
            <b>Henüz yüklenmedi.</b> IP’lerin yanında ağ adı ve ülke görünmeyecek; «Aynı IP»
            sinyalinin masum açıklaması <b>tahmin</b> olarak kalır — operatör NAT’ı mı yoksa
            veri merkezi (VPN) mi, ayırt edilemez. Aşağıdaki düğme veriyi bir kez indirir.
          </Alert>
        ) : (
          <p className="text-muted">
            <b className="tnum text-ink">{status.rows.toLocaleString('tr-TR')}</b> aralık ·
            {' '}<span className={stale ? 'text-warning' : ''}>
              {status.ageHours < 48
                ? `${status.ageHours} saat önce`
                : `${Math.round(status.ageHours / 24)} gün önce`} güncellendi
            </span>
            {stale ? ' — tazelemeyi düşün.' : ''}
          </p>
        )}
        {/* ⚠️ `<div>`, `<p>` DEĞİL — `Info` içeride `<details>` çiziyor (bkz. `ui.tsx`). */}
        <div className="text-[11px] text-muted">
          Kaynak: <code>iptoasn.com</code> (Public Domain, saatlik güncelleniyor, hesap
          gerektirmiyor). Veri <b>sunucuda yerel</b> duruyor — oyuncu IP’leri hiçbir dış
          servise gönderilmiyor.
          <Info label="neden yerel veritabanı">
            İstek başına çağrılan bir geolocation servisi, her oyuncunun IP’sini üçüncü bir
            tarafa gönderirdi. Kural kitabımız oyunculara birbirinin IP’sini göstermeyi
            yasaklıyor; aynı veriyi bir satıcıya akıtmak daha büyük bir ihlal olurdu.
            Yan kazanç: sıfır gecikme, sıfır kota, çevrimdışı çalışma.
          </Info>
        </div>
        {note ? <Alert tone="success">{note}</Alert> : null}
        <ErrorBox error={error} />
        <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
          {busy ? 'İndiriliyor…' : status == null ? 'Veriyi indir' : 'Tazele'}
        </Button>
        <p className="text-[11px] text-muted">
          ⚠️ İndirme ~700.000 aralık için <b>15 saniye kadar</b> sürer ve oyuncuların girişini
          <b> etkilemez</b>: yeni veri tek bir işlemde devreye giriyor, o ana kadar eski veri
          okunmaya devam ediyor. Tazeleme bittiğinde künyesi eksik eski IP kayıtları da
          otomatik tamamlanır.
        </p>
      </div>
    </Panel>
  );
}

function ConfigLine({ config }: { config: LinksResponse['config'] }) {
  return (
    <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted">
      Eşik <b className="tnum text-ink">{config.reportThreshold}</b> ·
      {' '}son <b className="tnum text-ink">{config.lookbackDays}</b> gün ·
      {' '}en fazla <b className="tnum text-ink">{config.maxGroupSize}</b> oyuncunun paylaştığı
      cihaz/IP sayılır
      <Info label="grup sınırı nedir">
        Bir cihazı ya da IP’yi bu sayıdan fazla oyuncu paylaşıyorsa o sinyal tamamen yok
        sayılır. Orası internet kafe ya da operatör NAT’ıdır: oradaki iki hesabın aynı
        kişiye ait olma ihtimali normalden yüksek değildir. Ayrıca n oyuncu n×(n−1)/2 çift
        üretir — sınır olmasa 200 kişilik bir ağ tek başına 19.900 satır ederdi.
      </Info>
      {' · '}ağırlıklar «Ayarlar → Çoklu hesap tespiti»nde
    </div>
  );
}

/* ═══ Çift satırı ═══════════════════════════════════════════════════════════ */

function PairRow({ pair, info, threshold, onNeedStepUp, onChanged }: {
  pair: Pair;
  info: Record<string, { label: string; innocent: string }>;
  threshold: number;
  onNeedStepUp: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const resolve = async (resolution: string): Promise<void> => {
    setBusy(true); setError(null);
    try {
      await api('/api/v1/admin/abuse/pairs/resolve', {
        method: 'POST',
        body: {
          worldId: pair.worldId, a: pair.a.id, b: pair.b.id, resolution,
          ...(note.trim() === '' ? {} : { note: note.trim() }),
        },
      });
      setNote(''); setOpen(false);
      onChanged();
    } catch (err) {
      if (needsStepUp(err)) onNeedStepUp(); else setError(err);
    } finally {
      setBusy(false);
    }
  };

  /** Eşiğin iki katını geçen çift görsel olarak öne çıkar — liste uzadığında göz oraya gitsin. */
  const strong = pair.score >= threshold * 2;

  return (
    <li className={`px-3 py-2.5 ${pair.resolved ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={strong ? 'danger' : 'warning'}>{pair.score} puan</Badge>
        <Link to={`/oyuncular/${pair.a.id}`} className="text-sm text-ink underline">
          {pair.a.username}
        </Link>
        <span className="text-muted">↔</span>
        <Link to={`/oyuncular/${pair.b.id}`} className="text-sm text-ink underline">
          {pair.b.username}
        </Link>
        {pair.resolved ? (
          <Badge tone={RESOLUTION_TONE[pair.resolved.resolution] ?? 'muted'}>
            {RESOLUTION_LABEL[pair.resolved.resolution] ?? pair.resolved.resolution}
            {pair.resolved.by ? ` · ${pair.resolved.by}` : ''}
          </Badge>
        ) : null}
      </div>

      <ul className="mt-1.5 space-y-1">
        {pair.signals.map((s) => (
          <li key={s.kind} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
            <span className="tnum text-muted">+{s.score}</span>
            <span className="text-ink">{info[s.kind]?.label ?? s.kind}</span>
            <span className="font-mono text-muted">{summarise(s.evidence)}</span>
            {/* ⭐ §9.1.4'ün şartı: her sinyalin yanında masum açıklaması. */}
            {info[s.kind] ? (
              <Info label="masum açıklama">
                <b>Masum açıklama.</b> {info[s.kind]!.innocent}
              </Info>
            ) : null}
          </li>
        ))}
      </ul>

      {pair.resolved ? (
        <p className="mt-1 text-[11px] text-muted">
          {when(pair.resolved.at)}
          {pair.resolved.note ? ` · «${pair.resolved.note}»` : ''}
        </p>
      ) : null}

      <ErrorBox error={error} />

      {open ? (
        <div className="mt-2 space-y-2">
          <Input
            type="text" maxLength={1000} value={note} placeholder="Not (isteğe bağlı)"
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => void resolve('innocent')}>
              Masum
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void resolve('watch')}>
              İzlemeye al
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void resolve('warned')}>
              Uyarıldı
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void resolve('banned')}>
              Cezalandırıldı
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Vazgeç</Button>
          </div>
          {/* ⚠️ «Cezalandırıldı» burada CEZA VERMEZ, verilmiş bir cezayı KAYDEDER. */}
          <p className="text-[11px] text-muted">
            ⚠️ Bunlar yalnız <b>kayıt</b>: hiçbiri oyuncuya ceza vermez. Ceza «Oyuncular»
            sekmesindeki künyeden verilir ve ayrı bir denetim satırına düşer.
          </p>
        </div>
      ) : (
        <Button variant="ghost" className="mt-1.5" onClick={() => setOpen(true)}>
          {pair.resolved ? 'Kararı değiştir' : 'Karar ver'}
        </Button>
      )}
    </li>
  );
}

/**
 * Kanıt nesnesini tek satıra indirir.
 * ⚠️ Alan adları sunucudan Türkçe geliyor (`cihazSayısı`, `örnek`…): kanıt yönetici için
 * yazılmış bir metin, istemcinin çevirmesi gereken bir sözlük değil.
 */
function summarise(evidence: Record<string, unknown>): string {
  return Object.entries(evidence)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' · ');
}
