/**
 * KOMUTA MERKEZİ — giden ordular, **Gelen Ordu**, geri sayımlar (§10).
 *
 * ⭐ Gelen saldırıda **birleşim GİZLİDİR** (§13.10.1): varış saati ve kaynak koordinat görünür,
 * ne geldiği görünmez. Sunucu zaten göndermiyor; arayüz bunu oyuncuya AÇIKÇA söylüyor ki
 * "veri eksik" sanılmasın.
 */
import { fmt, remaining, useTick } from '../lib/hooks.ts';
import { useCities, useMissions, type MissionRow } from '../lib/queries.ts';
import { Badge, Card, Empty, SectionTitle } from '../components/ui.tsx';

const TYPE_LABEL: Record<string, string> = {
  attack: 'Saldırı',
  return: 'Dönüş',
  transport: 'Nakliye',
  support: 'Destek',
  spy: 'Casusluk',
};

export function Command() {
  const missions = useMissions();
  const cities = useCities();
  useTick();

  const cityName = (id: number | null): string =>
    cities.data?.cities.find((c) => c.id === id)?.name ?? `#${id ?? '?'}`;

  const outgoing = missions.data?.outgoing ?? [];
  const incoming = missions.data?.incoming ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle right={incoming.length > 0 ? `${incoming.length} ordu yolda` : undefined}>
          Gelen Ordu
        </SectionTitle>
        {incoming.length === 0 ? (
          <Empty>Şehirlerine gelen ordu yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {incoming.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-danger">
                    ⚔️ {cityName(m.targetCityId)} şehrine saldırı
                  </div>
                  <div className="text-xs text-muted">
                    Kaynak: {m.origin ? `${m.origin.k}:${m.origin.d}:${m.origin.s}` : 'bilinmiyor'}
                    {' · '}
                    <span className="italic">birleşim gizli — öğrenmek için casusluk gerekir</span>
                  </div>
                </div>
                <div className="tnum shrink-0 text-right text-sm text-danger">
                  {remaining(m.arrivesAt) ?? 'varıyor!'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle right={outgoing.length > 0 ? `${outgoing.length} sefer` : undefined}>
          Ordularım
        </SectionTitle>
        {outgoing.length === 0 ? (
          <Empty>Yolda ordun yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {outgoing.map((m) => <OutgoingRow key={m.id} m={m} cityName={cityName} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function OutgoingRow({ m, cityName }: { m: MissionRow; cityName: (id: number | null) => string }) {
  const units = Object.entries(m.units ?? {}).filter(([, n]) => n > 0);
  const isReturn = m.type === 'return';
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-ink">
            {isReturn ? '↩️' : '⚔️'} {TYPE_LABEL[m.type] ?? m.type}
            {' · '}
            {isReturn
              ? cityName(m.targetCityId)
              : m.target ? `${m.target.k}:${m.target.d}:${m.target.s}` : '—'}
          </div>
          <div className="text-xs text-muted">
            {units.length > 0
              ? units.map(([id, n]) => `${id} ${fmt(n)}`).join(' · ')
              : 'birlik yok'}
          </div>
        </div>
        <div className="tnum shrink-0 text-right text-sm">
          {remaining(m.executeAt) ?? 'varıyor!'}
          <div className="text-[11px] text-muted">
            {isReturn ? <Badge tone="success">dönüyor</Badge> : <Badge tone="warning">gidiyor</Badge>}
          </div>
        </div>
      </div>
    </li>
  );
}
