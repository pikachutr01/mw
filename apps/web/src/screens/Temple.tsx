/**
 * ⭐ TAPINAK — kahraman ekranı (§13.11.4).
 *
 * Düzen orijinal oyunun web ekranından alındı (`images/scr_web*`): her kahraman bir kart —
 * solda portre, ortada dört yetenek ikonu ve puanları, sağda `tecrübe / sonraki eşik` ve durum.
 * Aksiyonlar da istemcinin kendi menüsünden: **Seviye Arttır · Özellikler · Adını Değiştir ·
 * Dirilt / Diriltmeyi Durdur**.
 *
 * ⚠️ **Büyü yetenekleri artık ziyan DEĞİL.** Uzun süre "kahramanın büyü tabanı 0, büyüye puan
 * harcamak boşa" sanılıyordu; binary'den kahramanın stat satırı bulununca (satır 12) büyü
 * tabanının fizikselle aynı olduğu (1200) ortaya çıktı ve ölçüm de doğruladı. Bu yüzden ekranda
 * oyuncuyu büyüden CAYDIRAN bir uyarı YOK — yalnız hangi yeteneğin ne yaptığı anlatılıyor.
 */
import { useState } from 'react';
import { fmt, formatDuration, remaining, useTick } from '../lib/hooks.ts';
import {
  useHeroRename, useHeroRevive, useHeroReviveCancel, useHeroSkills, useTemple,
  type HeroRow, type HeroSkills, type TempleView,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Badge, Button, Empty, ErrorBox, Input, Panel, Res, SectionTitle } from '../components/ui.tsx';
import { useConfirm } from '../components/Modal.tsx';

const SKILLS: { key: keyof HeroSkills; icon: string; label: string; hint: string }[] = [
  { key: 'fAtk', icon: 'fiz_sal', label: 'Fiziksel Saldırı', hint: 'Yakın dövüş fazında ordunun vuruş gücüne eklenir.' },
  { key: 'fDef', icon: 'fiz_sav', label: 'Fiziksel Savunma', hint: 'Kahramanın fiziksel dayanıklılığını ve ordunun savunma payını artırır.' },
  { key: 'mAtk', icon: 'buy_sal', label: 'Büyü Saldırı', hint: 'BÜYÜ fazında ordunun vuruş gücüne eklenir — büyü ağırlıklı ordularda belirleyici.' },
  { key: 'mDef', icon: 'buy_sav', label: 'Büyü Savunma', hint: 'Gelen büyü hasarına karşı kahramanın direncini artırır.' },
];

const STATE_LABEL: Record<HeroRow['state'], { text: string; tone: 'muted' | 'success' | 'warning' | 'danger' }> = {
  in_city: { text: 'Şehirde', tone: 'success' },
  on_mission: { text: 'Görevde', tone: 'muted' },
  dead: { text: 'Ölü', tone: 'danger' },
  reviving: { text: 'Diriltiliyor', tone: 'warning' },
  destroyed: { text: 'Yok Edildi', tone: 'danger' },
};

function XpBar({ hero }: { hero: HeroRow }) {
  const pct = hero.xpForNext > 0 ? Math.min(100, (hero.xp / hero.xpForNext) * 100) : 0;
  return (
    <div className="min-w-[9rem]">
      <div className="text-xs tabular-nums text-muted">
        {fmt(hero.xp)} / {fmt(hero.xpForNext)}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/20">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Puan dağıtım paneli — kalan puan bitene kadar artırılır, geri alma yok. */
function SkillEditor({ hero, onClose }: { hero: HeroRow; onClose: () => void }) {
  const [draft, setDraft] = useState<HeroSkills>({ ...hero.skills });
  const save = useHeroSkills();
  const spent = draft.fAtk + draft.fDef + draft.mAtk + draft.mDef;
  const left = hero.pointsTotal - spent;

  return (
    <div className="mt-3 rounded-lg border border-line bg-black/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Puan dağıt</span>
        <Badge tone={left > 0 ? 'warning' : 'muted'}>{left} puan kaldı</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SKILLS.map((s) => {
          const cur = draft[s.key];
          const base = hero.skills[s.key];
          return (
            <div key={s.key} className="flex items-center gap-2 rounded-md bg-black/10 p-2">
              <img src={`/assets/hero/${s.icon}.png`} alt="" width={22} height={22} title={s.hint} />
              <span className="flex-1 truncate text-xs" title={s.hint}>{s.label}</span>
              <button
                type="button"
                className="h-6 w-6 rounded border border-line disabled:opacity-30"
                disabled={cur <= base}
                onClick={() => setDraft({ ...draft, [s.key]: cur - 1 })}
                aria-label={`${s.label} azalt`}
              >−</button>
              <span className="w-8 text-center text-sm tabular-nums">{cur}</span>
              <button
                type="button"
                className="h-6 w-6 rounded border border-line disabled:opacity-30"
                disabled={left <= 0}
                onClick={() => setDraft({ ...draft, [s.key]: cur + 1 })}
                aria-label={`${s.label} artır`}
              >+</button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Dağıtılan puan <strong>geri alınamaz</strong>. Puanı saklayıp sonra dağıtabilirsin.
      </p>
      <ErrorBox error={save.error} />
      <div className="mt-2 flex gap-2">
        <Button
          disabled={spent === hero.pointsSpent || save.isPending}
          onClick={() => save.mutate({ id: hero.id, body: draft }, { onSuccess: onClose })}
        >Kaydet</Button>
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
      </div>
    </div>
  );
}

function RenameBox({ hero, onClose }: { hero: HeroRow; onClose: () => void }) {
  const [name, setName] = useState(hero.name);
  const rename = useHeroRename();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-black/10 p-3">
      <Input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Kahraman adı" />
      <Button
        disabled={name.trim().length < 2 || rename.isPending}
        onClick={() => rename.mutate({ id: hero.id, body: { name: name.trim() } }, { onSuccess: onClose })}
      >Kaydet</Button>
      <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
      <ErrorBox error={rename.error} />
    </div>
  );
}

function HeroCard({ hero, temple }: { hero: HeroRow; temple: TempleView }) {
  const [panel, setPanel] = useState<'none' | 'skills' | 'rename'>('none');
  const revive = useHeroRevive();
  const cancel = useHeroReviveCancel();
  const confirm = useConfirm();
  const state = STATE_LABEL[hero.state];
  const destroyed = hero.state === 'destroyed';
  const left = hero.pointsTotal - hero.pointsSpent;

  return (
    <div className={`rounded-xl border border-line p-3 ${destroyed ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <img
          src="/assets/hero/kahraman.png" alt="" width={56} height={56}
          className={`rounded-lg ${destroyed ? 'grayscale' : ''}`}
        />
        <div className="min-w-[8rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{hero.name}</span>
            <span className="text-sm text-muted">Seviye {hero.level}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {SKILLS.map((s) => (
              <span key={s.key} className="flex items-center gap-1" title={`${s.label} — ${s.hint}`}>
                <img src={`/assets/hero/${s.icon}.png`} alt={s.label} width={18} height={18} />
                <span className="text-sm tabular-nums">{hero.skills[s.key]}</span>
              </span>
            ))}
          </div>
        </div>
        {!destroyed && <XpBar hero={hero} />}
        <div className="flex flex-col items-end gap-1">
          <Badge tone={state.tone}>{state.text}</Badge>
          {hero.state === 'reviving' && hero.reviveUntil && (
            <span className="text-xs tabular-nums text-muted">{remaining(hero.reviveUntil)}</span>
          )}
          {destroyed && hero.disappearsAt && (
            <span className="text-xs text-muted">{remaining(hero.disappearsAt)} sonra düşer</span>
          )}
        </div>
      </div>

      {destroyed ? (
        <p className="mt-2 text-xs text-muted">
          Ordusunun tamamıyla birlikte yok oldu — geri getirecek kimse kalmadı. Diriltilemez.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant={left > 0 ? 'primary' : 'ghost'}
            onClick={() => setPanel(panel === 'skills' ? 'none' : 'skills')}
          >
            {/* Seviye savaşta kendiliğinden atlar; oyuncuya kalan tek iş bu puanları dağıtmak. */}
            Özellikler{left > 0 ? ` · ${left} puan hazır` : ''}
          </Button>
          <Button variant="ghost" onClick={() => setPanel(panel === 'rename' ? 'none' : 'rename')}>
            Adını Değiştir
          </Button>

          {hero.state === 'dead' && hero.reviveCost && (
            <Button
              disabled={revive.isPending}
              onClick={() => {
                void confirm({
                  title: `${hero.name} diriltilsin mi?`,
                  body: (
                    <div className="space-y-1 text-sm">
                      <p>
                        Maliyet <Res kind="gold" value={fmt(hero.reviveCost!.gold)} />{' '}
                        <Res kind="food" value={fmt(hero.reviveCost!.food)} /> — şehrin kaynağından
                        düşer ve <strong>iptal edilse bile iade edilmez</strong>.
                      </p>
                      <p className="text-muted">
                        Süre: {formatDuration(hero.reviveSeconds ?? 0)} · Kahramanın seviyesi
                        arttıkça süre de maliyet de yükselir; <strong>bu şehrin Tapınağını</strong>{' '}
                        yükseltmek süreyi kısaltır.
                      </p>
                    </div>
                  ),
                  confirmLabel: 'Dirilt',
                }).then((ok) => { if (ok) revive.mutate({ id: hero.id }); });
              }}
            >Dirilt</Button>
          )}
          {hero.state === 'reviving' && (
            <Button
              variant="ghost" disabled={cancel.isPending}
              onClick={() => {
                void confirm({
                  title: 'Diriltme durdurulsun mu?',
                  body: <p className="text-sm">Harcanan kaynak <strong>iade edilmez</strong>.</p>,
                  confirmLabel: 'Durdur',
                  danger: true,
                }).then((ok) => { if (ok) cancel.mutate({ id: hero.id }); });
              }}
            >Diriltmeyi Durdur</Button>
          )}
          <ErrorBox error={revive.error ?? cancel.error} />
        </div>
      )}

      {panel === 'skills' && <SkillEditor hero={hero} onClose={() => setPanel('none')} />}
      {panel === 'rename' && <RenameBox hero={hero} onClose={() => setPanel('none')} />}
    </div>
  );
}

export function TempleScreen(): React.ReactElement {
  const { cityId } = useActiveCity();
  const temple = useTemple(cityId);
  useTick();   // geri sayımlar (diriltme, yok edilme) saniyede bir yenilensin

  if (temple.isError) return <Panel title="Tapınak"><ErrorBox error={temple.error} /></Panel>;
  const data = temple.data;

  return (
    <Panel
      title="Tapınak"
      right={data && (
        <span className="text-xs text-muted">
          Tapınak {data.templeLevel} · {data.heroCount}/{data.maxHeroes} kahraman
        </span>
      )}
    >
      {/* Kuralların anlatımı buraya DEĞİL, Yardım sayfasına gidecek (kullanıcı kararı). */}
      {!data ? <Empty>Yükleniyor…</Empty> : (
        <div className="space-y-3">
          {data.heroes.length === 0
            ? <Empty>Bu şehirde hiç kahraman yok.</Empty>
            : data.heroes.map((h) => <HeroCard key={h.id} hero={h} temple={data} />)}
        </div>
      )}
    </Panel>
  );
}
