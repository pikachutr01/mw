/**
 * ⭐ İMPARATORLUK — bir oyuncunun sahip olduğu her şey, tek ekranda.
 *
 * Kullanıcının sorusuydu: *"Hangi şehir hangi oyuncuya ait, bu şehirdeki yapılar ne durumda,
 * o oyuncunun akademileri nasıl?"* Öncesinde cevap veri tabanı tarayıcısında şehir şehir,
 * İngilizce id'lerle ve **yanlış kaynak değeriyle** aranıyordu.
 *
 * ⚠️ Şehirler `<details>` ile açılıp kapanıyor — bir React bileşeni değil, tarayıcının kendi
 * öğesi. Bilerek: klavye ve ekran okuyucu desteği bedava geliyor ve `Ctrl+F` kapalı bölümleri
 * de bulabiliyor (kendi yazdığımız bir collapse'ta ikisi de kaybolurdu).
 */
import type { ReactNode } from 'react';
import { Badge, Panel } from '../../components/ui.tsx';
import { num, stamp, when } from '../../lib/format.ts';

interface Counted { type: string; name: string; count: number }
interface Leveled { type: string; name: string; level: number }
interface Mission {
  id: number; type: string; status: string; executeAt: string | null;
  ownerPlayerId: number | null; ownerName: string | null;
  origin: string | null; target: string | null; units: Counted[];
}
interface City {
  id: number; name: string; coordinates: string; isCapital: boolean;
  gold: number; food: number; goldPerHour: number; foodPerHour: number;
  wallIntegrity: number | null; wallRepairUntil: string | null;
  caveRepairUntil: string | null; teleportReadyAt: string | null;
  buildings: Leveled[]; units: Counted[]; cave: Counted[];
  defenses: Counted[]; structures: Leveled[];
  queues: {
    id: number; category: string; itemType: string; name: string;
    targetLevel: number | null; count: number; done: number;
    startedAt: string | null; finishAt: string | null;
  }[];
}
export interface Empire {
  player: {
    id: number; username: string; worldId: number; score: number; alliance: string | null;
    online: boolean | null; lastSeenAt: string | null;
    protectedUntil: string | null; vacationUntil: string | null;
    bannedAt: string | null; banUntil: string | null; banMode: string | null;
  };
  gameNow: string;
  cities: City[];
  techs: Leveled[];
  heroes: {
    id: number; name: string; level: number; xp: number; status: string;
    cityId: number | null; cityName: string | null; reviveUntil: string | null;
  }[];
  outgoing: Mission[];
  incoming: Mission[];
}

const MISSION_LABEL: Record<string, string> = {
  attack: 'Saldırı', return: 'Dönüş', transport: 'Nakliye', support: 'Destek',
  spy: 'Casusluk', found_city: 'Şehir kurma', cave_return: 'Mağara dönüşü',
};

/** Etiket + değer çifti. Sayılar `tnum` ile hizalı. */
function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warning' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum text-sm ${tone === 'warning' ? 'text-warning' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

/** Adet listesi — «Cüce 1.500 · Elf 40». Boşsa satır hiç çizilmez. */
function Chips({ title, items }: { title: string; items: (Counted | Leveled)[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted">{title}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <span
            key={i.type}
            className="rounded-[var(--radius-sm)] border border-border bg-bg px-1.5 py-0.5 text-[11px]"
            title={i.type}
          >
            {i.name}{' '}
            <b className="tnum text-ink">
              {'count' in i ? num(i.count) : `sv ${i.level}`}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

function MissionList({ title, items, showOwner }: {
  title: string; items: Mission[]; showOwner: boolean;
}) {
  return (
    <Panel title={title} right={`${items.length} hareket`}>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">Hareket yok.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Badge tone={m.type === 'attack' ? 'danger' : 'muted'}>
                {MISSION_LABEL[m.type] ?? m.type}
              </Badge>
              {showOwner && m.ownerName ? (
                <span className="text-sm text-ink">{m.ownerName}</span>
              ) : null}
              <span className="text-xs text-muted">
                {m.origin ?? '—'} → {m.target ?? '—'}
              </span>
              {/* ⭐ Yoldaki ordunun bileşimi: `mission_units` hiçbir uçtan alınamıyordu. */}
              {m.units.length > 0 ? (
                <span className="text-[11px] text-muted">
                  {m.units.map((u) => `${u.name} ${num(u.count)}`).join(' · ')}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted" title={stamp(m.executeAt)}>
                {when(m.executeAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function EmpireView({ data }: { data: Empire }) {
  const p = data.player;
  const totalGold = data.cities.reduce((s, c) => s + c.gold, 0);
  const totalFood = data.cities.reduce((s, c) => s + c.food, 0);

  return (
    <div className="space-y-3">
      <Panel
        title={`${p.username} · imparatorluk`}
        right={`D${p.worldId}${p.alliance ? ` · ${p.alliance}` : ''}`}
      >
        <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-5">
          <Stat label="Puan" value={num(p.score)} />
          <Stat label="Şehir" value={String(data.cities.length)} />
          <Stat label="Toplam altın" value={num(totalGold)} />
          <Stat label="Toplam yemek" value={num(totalFood)} />
          <Stat label="Son görülme" value={when(p.lastSeenAt)} />
        </div>
        {/* ⚠️ Bu iki alan Faz 6 künyesinde veri olarak vardı ama hiç gösterilmiyordu —
            "neden bu oyuncuya saldıramıyorum" sorusunun cevabı burada. */}
        {p.protectedUntil || p.vacationUntil ? (
          <p className="border-t border-border px-3 py-2 text-xs text-warning">
            {p.protectedUntil ? `Acemi koruması: ${stamp(p.protectedUntil)}. ` : ''}
            {p.vacationUntil ? `Tatil modu: ${stamp(p.vacationUntil)}.` : ''}
          </p>
        ) : null}
      </Panel>

      <Panel title="Teknikler (akademi)" right={`${data.techs.length} teknik`}>
        {data.techs.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">Hiç teknik araştırılmamış.</p>
        ) : (
          <div className="p-3"><Chips title="" items={data.techs} /></div>
        )}
      </Panel>

      {data.heroes.length > 0 ? (
        <Panel title="Kahramanlar" right={`${data.heroes.length}`}>
          <ul className="divide-y divide-border">
            {data.heroes.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="text-sm text-ink">{h.name}</span>
                <Badge tone={h.status === 'alive' ? 'success' : 'warning'}>{h.status}</Badge>
                <span className="tnum text-xs text-muted">
                  sv {h.level} · {num(h.xp)} XP
                </span>
                <span className="ml-auto text-xs text-muted">
                  {h.cityName ?? (h.cityId == null ? 'seferde' : `#${h.cityId}`)}
                  {h.reviveUntil ? ` · diriliş ${when(h.reviveUntil)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Şehirler" right={`${data.cities.length} şehir`}>
        <div className="divide-y divide-border">
          {data.cities.map((c) => (
            <details key={c.id} className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2
                hover:bg-raised">
                <span className="text-muted group-open:rotate-90">›</span>
                <span className="text-sm text-ink">{c.name}</span>
                {c.isCapital ? <Badge tone="success">başkent</Badge> : null}
                <code className="text-[11px] text-muted">{c.coordinates}</code>
                <span className="ml-auto flex flex-wrap gap-3 text-[11px] text-muted">
                  {/* ⭐ Bu sayı MATERIALIZE edilmiş — tarayıcının gösterdiği ham çıpa değil,
                      oyuncunun kendi ekranındaki gerçek kaynak. */}
                  <span className="tnum">{num(c.gold)} altın</span>
                  <span className="tnum">{num(c.food)} yemek</span>
                  <span>{c.units.length + c.cave.length} birim türü</span>
                  {c.queues.length > 0 ? <span>{c.queues.length} kuyruk</span> : null}
                </span>
              </summary>

              <div className="space-y-3 border-t border-border bg-bg/40 px-3 py-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Altın" value={`${num(c.gold)} (+${num(c.goldPerHour)}/sa)`} />
                  <Stat label="Yemek" value={`${num(c.food)} (+${num(c.foodPerHour)}/sa)`} />
                  <Stat
                    label="Sur bütünlüğü"
                    value={c.wallIntegrity == null ? '—' : `%${Math.round(c.wallIntegrity * 100)}`}
                    tone={c.wallIntegrity != null && c.wallIntegrity < 1 ? 'warning' : undefined}
                  />
                  <Stat
                    label="Onarım / mağara"
                    value={c.wallRepairUntil
                      ? `sur ${when(c.wallRepairUntil)}`
                      : c.caveRepairUntil ? `mağara ${when(c.caveRepairUntil)}` : '—'}
                  />
                </div>

                <Chips title="Yapılar" items={c.buildings} />
                {/* ⚠️ Sur/Kalkan ayrı kutuda: `defenses` tablosunda dururlar ama `count`
                    alanları ADET değil SEVİYE taşır. */}
                <Chips title="Sur ve Büyü Kalkanı (seviye)" items={c.structures} />
                <Chips title="Ordu (baraka)" items={c.units} />
                <Chips title="Mağara" items={c.cave} />
                <Chips title="Savunma birimleri" items={c.defenses} />

                {c.queues.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted">Kuyruk</div>
                    <ul className="space-y-0.5">
                      {c.queues.map((q) => (
                        <li key={q.id} className="text-[11px] text-muted">
                          <b className="text-ink">{q.name}</b>
                          {q.targetLevel != null ? ` sv ${q.targetLevel}` : ''}
                          {q.count > 1 ? ` ×${num(q.count - q.done)}` : ''}
                          {' · biter '}
                          <span title={stamp(q.finishAt)}>{when(q.finishAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          ))}
          {data.cities.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">Şehri yok.</p>
          ) : null}
        </div>
      </Panel>

      <MissionList title="Giden hareketler" items={data.outgoing} showOwner={false} />
      {/* ⭐ Bu kutu tamamen yeni: "bu oyuncuya kim saldırıyor" sorusu veri tabanı
          tarayıcısında sorulamıyordu (hedefin sahibi `missions` tablosunda yok). */}
      <MissionList title="Gelen hareketler" items={data.incoming} showOwner />
    </div>
  );
}
