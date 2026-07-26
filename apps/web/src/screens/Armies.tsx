/**
 * ⭐ ORDULAR — giriş sonrası oyuncuyu KARŞILAYAN ekran (kullanıcı kararı).
 *
 * Orijinalde de menünün ilk maddesi budur (`g.java` menü tablosu, `images/scr_web01`) ve giriş
 * ekranı "Şehrinizde herhangi bir hareketlilik yok" özetiyle açılır (`images/scr_itv01`).
 * Mantığı basit: oyun **zamanlanmış olaylar** üzerine kuruludur, oyuncunun ilk sorusu daima
 * *"şu an ne oluyor?"* olur.
 *
 * Ekran, şehirden GİDEN ve şehre GELEN tüm ordu hareketlerini tek listede toplar.
 *
 * ⚠️ **Gelen saldırıda birleşim GİZLİDİR** (§13.10.1): varış saati ve kaynak koordinat görünür,
 * ne geldiği görünmez. Arayüz bunu açıkça yazar ki oyuncu "veri eksik" sanmasın.
 */
import { fmt, remaining, useTick } from '../lib/hooks.ts';
import { describeUnits } from '../lib/names.ts';
import { useCities, useCity, useMissions, type IncomingRow, type MissionRow } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Empty, MissionIcon, Panel } from '../components/ui.tsx';

/** Görev tipi + yön → ikon `id`'si ve Türkçe etiket (§13.11.9 dosya adı sözleşmesi). */
function iconOf(type: string): { id: string; label: string } {
  switch (type) {
    case 'attack': return { id: 'attack_out', label: 'Saldırı' };
    case 'return': return { id: 'attack_back', label: 'Dönüş' };
    case 'transport': return { id: 'transport_out', label: 'Nakliye' };
    case 'support': return { id: 'support', label: 'Destek' };
    case 'spy': return { id: 'spy_out', label: 'Casusluk' };
    case 'found_city': return { id: 'found_city', label: 'Şehir Kur' };
    case 'teleport': return { id: 'teleport', label: 'Teleport' };
    default: return { id: type, label: type };
  }
}

export function Armies() {
  const missions = useMissions();
  const cities = useCities();
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  useTick();

  const cityName = (id: number | null): string =>
    cities.data?.cities.find((c) => c.id === id)?.name ?? `#${id ?? '?'}`;

  const outgoing = missions.data?.outgoing ?? [];
  const incoming = missions.data?.incoming ?? [];
  const quiet = outgoing.length === 0 && incoming.length === 0;

  return (
    <div className="space-y-3">
      {/* Orijinaldeki "Durum Özeti" karşılaması (scr_itv01). */}
      <Panel title="Durum Özeti" right={city.data?.name}>
        <div className="px-3 py-2 text-sm">
          {quiet ? (
            <span className="text-muted">Şehrinde herhangi bir hareketlilik yok.</span>
          ) : (
            <span className="text-ink">
              {incoming.length > 0 ? (
                <b className="text-danger">{incoming.length} ordu sana doğru yolda</b>
              ) : null}
              {incoming.length > 0 && outgoing.length > 0 ? ' · ' : null}
              {outgoing.length > 0 ? `${outgoing.length} seferin sürüyor` : null}
            </span>
          )}
        </div>
      </Panel>

      <Panel title="Gelen Ordu" right={incoming.length > 0 ? `${incoming.length}` : undefined}>
        {incoming.length === 0 ? (
          <Empty>Şehirlerine gelen ordu yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {incoming.map((m, i) => <IncomingItem key={m.id} m={m} alt={i % 2 === 1} name={cityName} />)}
          </ul>
        )}
      </Panel>

      <Panel title="Ordularım" right={outgoing.length > 0 ? `${outgoing.length} sefer` : undefined}>
        {outgoing.length === 0 ? (
          <Empty>Yolda ordun yok. Dünya ekranından hedef seç.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {outgoing.map((m, i) => <OutgoingItem key={m.id} m={m} alt={i % 2 === 1} name={cityName} />)}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function IncomingItem({
  m, alt, name,
}: { m: IncomingRow; alt: boolean; name: (id: number | null) => string }) {
  return (
    <li className={`flex items-center gap-3 px-3 py-2 ${alt ? 'bg-row-alt' : ''}`}>
      <MissionIcon id="incoming_attack" title="Gelen saldırı" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-danger">
          {name(m.targetCityId)} şehrine saldırı
        </div>
        <div className="text-xs text-muted">
          Kaynak: {m.origin ? `${m.origin.k}:${m.origin.d}:${m.origin.s}` : 'bilinmiyor'}
          {' · '}
          <span className="italic">birleşim gizli — öğrenmek için casusluk gerekir</span>
        </div>
      </div>
      <div className="tnum shrink-0 text-right text-sm font-semibold text-danger">
        {remaining(m.arrivesAt) ?? 'varıyor!'}
      </div>
    </li>
  );
}

function OutgoingItem({
  m, alt, name,
}: { m: MissionRow; alt: boolean; name: (id: number | null) => string }) {
  const isReturn = m.type === 'return';
  const icon = iconOf(m.type);
  const units = describeUnits(m.units, fmt);

  return (
    <li className={`flex items-center gap-3 px-3 py-2 ${alt ? 'bg-row-alt' : ''}`}>
      <MissionIcon id={icon.id} title={icon.label} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">
          <b>{icon.label}</b>
          {' → '}
          {isReturn
            ? name(m.targetCityId)
            : m.target ? `${m.target.k}:${m.target.d}:${m.target.s}` : '—'}
        </div>
        <div className="truncate text-xs text-muted">{units || 'birlik yok'}</div>
      </div>
      <div className="tnum shrink-0 text-right text-sm">
        <span className={isReturn ? 'text-success' : 'text-warning'}>
          {remaining(m.executeAt) ?? 'varıyor!'}
        </span>
      </div>
    </li>
  );
}
