/**
 * Küçük, yeniden kullanılabilir parçalar. Hepsi YALNIZ semantik token'ları kullanır (§13.13.3) —
 * ham renk (`#fff`, `slate-700`) yazılmaz, yoksa gece modu ve kontrast kapısı sessizce bozulur.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-md)] border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

/**
 * ⭐⭐ OYUNCUNUN YAZDIĞI METİN — **aynen** göster (kullanıcı, 2026-08-09):
 * *"her yerde kullanıcı adı orijinal şeklinde yazılsın. Harfler otomatik büyük yazılmasın."*
 *
 * Arayüzün başlık bantları (panel · modal · onay penceresi · tablo başlığı) bilerek **Cinzel +
 * `uppercase`** taşıyor; oyunun görsel dili bu. Ama o kalıba oyuncunun yazdığı bir ad girince
 * ad artık okuduğu şey olmuyor. İki ayrı mekanizma bozuyor:
 *
 *  1. `text-transform: uppercase` — üstelik CSS büyük harfe çevirirken Türkçe kuralını
 *     bilmiyor: `lang="tr"` olmadan **«i» → «I»** oluyor, «İ» değil. `Ayline` → `AYLINE`.
 *  2. **Cinzel'in küçük harfi YOK** — küçük harfleri küçük-büyük harf (small caps) çiziyor,
 *     yani `uppercase` hiç olmasa bile ad yine büyük görünüyor.
 *
 * Bu yüzden ikisi de burada sıfırlanıyor: gövde fontu + `normal-case` + normal harf aralığı.
 * `font-family` ve `text-transform` MİRAS alınan özellikler olduğu için başlığın içindeki bir
 * `span`de yazmak kesin sonuç veriyor (`Command.tsx`teki şehir adı düzeltmesinin gerekçesi).
 *
 * ⚠️ **Ayrım: sistem metni mi, oyuncu girdisi mi?** «RAPORLAR», «İTTİFAK SOHBETİ» gibi sabit
 * başlıklar Cinzel'de KALIR — onlar arayüzün kendi sesi. Yalnız kullanıcı adı, şehir adı,
 * ittifak adı ve kahraman adı bu sarmalın içine girer. Aynı ayrım `ChatWindow` başlığında
 * ve `CityStrip`te de yazılı.
 */
export function UserText({ children }: { children: ReactNode }) {
  return <span className="font-body tracking-normal normal-case">{children}</span>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 pt-3 pb-2">
      <h2 className="display text-sm font-semibold tracking-wide text-ink uppercase">{children}</h2>
      {right ? <div className="text-xs text-muted">{right}</div> : null}
    </div>
  );
}

/**
 * ⭐ ANA GÖRSEL BİRİM — orijinal arayüzün ahşap paneli (`images/scr_web01..06`):
 * koyu gövde · parşömen başlık bandı · köşe perçinleri · çift çerçeve.
 *
 * Perçinler CSS ile çiziliyor (görsel dosya YOK) → temayla birlikte renk değiştiriyorlar ve
 * ölçeklendiklerinde bulanmıyorlar.
 */
export function Panel({
  title, right, children, className = '', bare = false,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Başlık bandı olmadan yalnız çerçeve. */
  bare?: boolean;
}) {
  return (
    <section
      className={`tex bevel relative rounded-[var(--radius-md)] border-2 border-strong bg-surface ${className}`}
    >
      <Bolts />
      {!bare && title ? (
        <header
          className="tex-header flex items-center justify-between gap-2 rounded-t-[calc(var(--radius-md)-2px)]
            border-b-2 border-strong bg-panel-header px-3 py-2"
        >
          <h2 className="display truncate text-[13px] font-semibold tracking-wider text-on-panel-header uppercase">
            {title}
          </h2>
          {right ? (
            <div className="shrink-0 text-[11px] text-on-panel-header/85">{right}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Dört köşedeki perçin — panelin "dövme demir" hissini veren tek detay. */
function Bolts() {
  const dot = 'absolute h-1.5 w-1.5 rounded-full bg-bolt/70 ring-1 ring-strong';
  return (
    <>
      <span aria-hidden className={`${dot} top-1 left-1`} />
      <span aria-hidden className={`${dot} top-1 right-1`} />
      <span aria-hidden className={`${dot} bottom-1 left-1`} />
      <span aria-hidden className={`${dot} bottom-1 right-1`} />
    </>
  );
}

/* ── İkonlar ───────────────────────────────────────────────────────────────── */

/**
 * ⭐ ALTIN / YEMEK — kaynak gösterilen HER yerde aynı ikon (kullanıcı isteği).
 *
 * ⚠️ Görseller **şeffaf**; koyu madalyon YOK. (Bir ara madalyon vardı çünkü ilk sürümler siyah
 * zeminliydi — şeffaf sürümler gelince madalyon ikonu boğuyordu, kaldırıldı.)
 */
export function ResIcon({ kind, size = 18 }: { kind: 'gold' | 'food'; size?: number }) {
  return (
    <img src={`/assets/ui/${kind}.png`} alt="" aria-hidden
      width={size} height={size}
      className="icon-shadow inline-block shrink-0 object-contain"
      style={{ width: size, height: size }} />
  );
}

/**
 * Sayı + ikon; `tnum` ile sütunlar kaymaz.
 *
 * ⚠️ `numClass` **sayının kendi kutusuna** gider, dış kutuya değil. Genişlik sınırını dışa
 * yazmak işe yaramıyor: dıştaki `min-w` ikonu da kapsıyor, sayı yine kutudan taşıyordu
 * (bilgi çubuğunda 375px'te rakamlar şehir adının üstüne biniyordu). Sabit genişlik
 * isteyen çağıran `numClass="min-w-[9ch]"` yazar — `tnum` sayesinde `ch` gerçekten sabit.
 */
export function Res({
  kind, value, size = 18, className = '', numClass = '', nativeTitle = true,
}: {
  kind: 'gold' | 'food'; value: string | number; size?: number;
  className?: string; numClass?: string;
  /**
   * ⚠️ Tarayıcının kendi `title` balonu. Çağıran bu kaynağı **`Tooltip` içine** sarıyorsa
   * `false` geçmeli: aksi hâlde masaüstünde iki balon üst üste çıkar (bizimki anında,
   * tarayıcınınki bir saniye sonra imlecin altında). Bilgi çubuğu tam olarak öyle bir yer.
   */
  nativeTitle?: boolean;
}) {
  return (
    <span className={`tnum inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}
      title={nativeTitle ? (kind === 'gold' ? 'Altın' : 'Yemek') : undefined}>
      <ResIcon kind={kind} size={size} />
      <span className={numClass}>{value}</span>
    </span>
  );
}

/**
 * Görev simgeleri (§13.11.9: dosya adı = katalog `id`).
 *
 * Eksik ikon olursa emoji yedeğine düşer; dosya eklendiği anda `HAS_ICON`'a adını yazmak
 * yeterli, kod değişmez. (Şu an tam set var — `teleport.png` 2026-07-28'de tamamlandı.)
 */
const HAS_ICON = new Set([
  'attack', 'attack_in', 'found_city', 'support_out', 'support_in',
  'transport_out', 'transport_back', 'spy_out', 'spy_back', 'teleport',
]);

const EMOJI_FALLBACK: Record<string, string> = {
  teleport: '🌀',
};

export function MissionIcon({ id, size = 36, title }: { id: string; size?: number; title?: string }) {
  if (HAS_ICON.has(id)) {
    return (
      <img src={`/assets/missions/${id}.png`} alt={title ?? id} title={title}
        width={size} height={size}
        className="icon-shadow inline-block shrink-0 object-contain"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span title={title}
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.7 }}>
      <span aria-hidden>{EMOJI_FALLBACK[id] ?? '•'}</span>
    </span>
  );
}

/**
 * ⭐ KATALOG GÖRSELİ — savaşçı · savunma · yapı · teknik satırlarının SOLUNDA (referans
 * `images/scr_web01`: orijinalde her satırın başında birimin resmi var).
 *
 * Sözleşme §13.11.9 ile aynı: **dosya adı = katalog `id`**, klasör kategoriye göre. Eşleme
 * tablosu YOK — yol id'den üretiliyor, yeni birim eklenince kod değişmiyor.
 *
 * ⚠️ **ÇERÇEVE YOK, ZEMİN YOK** (kullanıcı kararı 2026-07-28). Görseller şeffaf; arkalarına
 * kutu/kenarlık koymak onları "rozet" gibi gösteriyordu. Şimdi doğrudan satırın kendi zemininin
 * üstünde duruyorlar — şeffaf bölgeden başka renk görünmüyor.
 *
 * ⚠️ `loading="lazy"` bilerek YOK: görseller 160 px'e indirildikten sonra bir liste ~350 KB
 * tutuyor ve hepsi ekranın ilk yüzünde. Tembel yükleme burada satırların gecikmeli dolmasından
 * başka bir şey yapmıyordu.
 */
export type CatalogArt = 'units' | 'defenses' | 'buildings' | 'techs';

export function CatalogIcon({
  kind, id, size = 56, alt = '',
}: { kind: CatalogArt; id: string; size?: number; alt?: string }) {
  const [broken, setBroken] = useState(false);
  // Görsel yoksa satırın hizası bozulmasın diye AYNI ölçüde boş yer bırakılır.
  if (broken) return <span aria-hidden className="block shrink-0" style={{ width: size, height: size }} />;
  return (
    <img src={`/assets/${kind}/${id}.png`} alt={alt} width={size} height={size}
      onError={() => setBroken(true)}
      className="icon-shadow shrink-0 object-contain"
      style={{ width: size, height: size }} />
  );
}

/**
 * Sol menü, mobil alt bar ve «Daha» listesinin ortak simgesi (`assets/menu/<id>.png`).
 *
 * ⚠️ Dosya yoksa **kırık görsel yerine aynı ölçüde boşluk** bırakılır — `CatalogIcon` yıllardır
 * böyle yapıyordu, bu bileşende yoktu ve yeni bir menü maddesi eklenip simgesi henüz
 * çizilmediğinde menüde kırık resim simgesi çıkıyordu.
 *
 * ⚠️ **Yeri `Shell.tsx` DEĞİL burası** (2026-08-02): `InstallButton` da bu simgeyi kullanıyor ve
 * `Shell`den almak Shell ↔ InstallButton dairesel içe aktarması yaratıyordu. Fonksiyon
 * bildirimleri sayesinde çalışırdı ama Fast Refresh'in bozulduğu, teşhisi pahalı bir sınıf.
 * `CatalogIcon`'un yanı zaten doğal yeri: ikisi aynı desen.
 */
/**
 * ⚠️ `className` verildiğinde inline `style` YAZILMAZ — bilerek. Inline stil her zaman
 * CSS sınıfını ezer, dolayısıyla ikisi birlikte gönderilseydi `sm:h-5` gibi kırılıma bağlı
 * bir boyut sessizce hiç uygulanmazdı (mobilde ikonları büyütürken tam bu tuzağa düşüldü).
 * Kırılıma göre boyut isteyen çağıran `className` verir ve ölçüyü oradan yönetir; `size`
 * yine de HTML `width`/`height` niteliği olarak kalır (CSS'ten zayıftır, düzen sıçramasını
 * önler).
 */
export function MenuIcon({ id, size, className = '' }: {
  id: string; size: number; className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const sized = className ? undefined : { width: size, height: size };
  if (broken) {
    return <span aria-hidden className={`block shrink-0 ${className}`} style={sized} />;
  }
  return (
    <img src={`/assets/menu/${id}.png`} alt="" aria-hidden width={size} height={size}
      onError={() => setBroken(true)}
      className={`icon-shadow shrink-0 object-contain ${className}`}
      style={sized} />
  );
}

/* ── Tablo başlığı/hücresi ─────────────────────────────────────────────────── */
/**
 * Dünya, Sıralamalar ve Genel Durum aynı tabloyu çiziyor. Bir zamanlar her ekran kendi `Th/Td`
 * ikilisini tanımlıyordu; ikisi arasındaki 1 px'lik dolgu farkı bile sütunları farklı hizalıyordu.
 */
export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th className={`display px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide uppercase ${className}`}>
      {children}
    </th>
  );
}

export function Td({
  children, className = '', colSpan,
}: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2 py-1 text-[13px] leading-tight ${className}`}>{children}</td>
  );
}

/** İskelet çubuğu — nabız animasyonu "veri geliyor" der, boş satır "veri yok" derdi. */
export function Skeleton({ w }: { w: string }) {
  return (
    <span className="block h-3 animate-pulse rounded bg-raised" style={{ width: w, maxWidth: '100%' }} />
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
};

export function Button({
  children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', title,
  className = '',
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-medium '
    + 'transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
  const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  // Kabartma + doku: düz renk yerine basılabilir bir yüzey hissi.
  const variants = {
    primary: 'tex-header border-2 border-strong bg-accent text-on-accent shadow-[var(--bevel)] hover:bg-accent-hover active:translate-y-px',
    ghost: 'border-2 border-strong bg-surface text-ink hover:bg-raised active:translate-y-px',
    danger: 'border-2 border-danger bg-surface text-danger hover:bg-danger hover:text-on-accent active:translate-y-px',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm '
        + `text-ink placeholder:text-muted ${props.className ?? ''}`
      }
    />
  );
}

/**
 * Açılır liste — `Input` ile **aynı** ölçü ve çerçevede (2026-08-03, dünya seçici için).
 *
 * ⚠️ Projede `<select>` üç ekranda üç farklı satır içi sınıf dizisiyle stilleniyordu
 * (`World.tsx`, `Messages.tsx`, `Simulate.tsx`) ve hiçbiri `Input`la aynı yükseklikte
 * değildi. Formda yan yana duracakları için ölçü artık tek yerden geliyor.
 */
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        'w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm '
        + `text-ink disabled:opacity-70 ${props.className ?? ''}`
      }
    />
  );
}

/**
 * Çok satırlı metin kutusu — ittifak metni, toplu mesaj ve sohbet yazma alanı aynı görünümü
 * paylaşsın diye tek yerde (üç ekran aynı sınıf dizisini kopyalıyordu).
 */
/**
 * ⚠️ `ComponentPropsWithRef` — `ref` bir prop olarak geçebilsin diye (React 19'da `forwardRef`
 * gereksiz, ama TS tipinin `ref`i kabul etmesi gerekiyor). İttifak sohbeti composer'ı imleç
 * konumunu yönetmek için `setSelectionRange` çağırıyor.
 */
export function TextArea(props: React.ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea
      {...props}
      className={
        'w-full rounded-[var(--radius-sm)] border border-border bg-raised p-2 text-sm '
        + `text-ink placeholder:text-muted ${props.className ?? ''}`
      }
    />
  );
}

/**
 * ⭐ ADET KUTUSU — tüm sayı/adet girişleri AYNI sabit genişlikte (kullanıcı 2026-07-30).
 *
 * `Input`'u sarmıyor, çünkü oradaki `w-full` Tailwind ÇIKTI SIRASINDA `w-16/w-20/w-24`'ten
 * sonra geldiği için çağıranların dar genişlik sınıfları hiç uygulanmıyordu (bütün adet
 * kutuları sessizce %100 genişlikteydi). Genişlik burada inline style ile sabitlenir —
 * sınıf sırası savaşına girmez, mobil/masaüstü aynı ölçüde kalır.
 */
export function AmountInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props;
  return (
    <input
      type="number"
      inputMode="numeric"
      {...rest}
      style={{ width: '5rem', ...style }}
      className={
        'tnum shrink-0 rounded-[var(--radius-sm)] border border-border bg-raised px-2 py-1 '
        + `text-center text-sm text-ink placeholder:text-muted ${props.className ?? ''}`
      }
    />
  );
}

/**
 * ⭐ SINIRLI SAYI KUTUSU — alt sınırı olan alanlar **silinebilir** kalsın (kullanıcı, 2026-08-07).
 *
 * ## Düzelttiği hata
 *
 * Alt sınırı olan sayı kutuları `value={sayı}` + `onChange`ta anında kelepçe (`Math.max(1, …)`)
 * deseniyle yazılmıştı. Oyuncu Diyar kutusundaki `1`i silmek isteyince alan bir an boşalıyor,
 * `Number('')` → `0` → `|| 1` ile **anında 1'e geri sıçrıyordu**: yani alan hiçbir zaman boş
 * kalamıyor, `23` yazmak için önce metni SEÇMEK gerekiyordu. Kullanıcının tarifi: *"1 yazısı
 * minimum değer olduğu için silinemiyor"*.
 *
 * ## Çözüm
 *
 * Kutu yazarken **taslak bir dize** tutuyor (`draft`); dışarıdaki sayısal durum yalnız
 * **geçerli** bir değer yazıldığında güncelleniyor. Böylece alan boş ya da yarım (`"2"`)
 * kalabiliyor ama dışarı hiçbir zaman geçersiz bir sayı sızmıyor.
 *
 * ⚠️ Odak çıkınca taslak **temizleniyor**: yarım bırakılan metin kutuda asılı kalmasın.
 * Aralık dışı bir sayı yazıldıysa (`999` / max 500) odak çıkışında **kelepçelenip
 * işleniyor** — sessizce eski değere dönmek, oyuncunun yazdığını yok saymak olurdu.
 * ⚠️ `Enter` de odak çıkışıyla aynı işi görüyor; kutu genelde bir form içinde değil.
 */
export function BoundedAmountInput({ value, min, max, onCommit, ...rest }: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'min' | 'max' | 'onChange'>) {
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number): number => Math.min(max, Math.max(min, Math.trunc(n)));

  const settle = (): void => {
    if (draft != null && draft.trim() !== '') {
      const n = Number(draft);
      if (Number.isFinite(n)) onCommit(clamp(n));
    }
    setDraft(null);
  };

  return (
    <AmountInput
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Yalnız TAM ve aralıkta bir sayı dışarı çıkar; boş/yarım metin taslakta kalır.
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
          onCommit(Math.trunc(n));
        }
      }}
      onBlur={settle}
      onKeyDown={(e) => { if (e.key === 'Enter') settle(); }}
    />
  );
}

/** Hata kutusu — sunucunun alan hatası mesajını AYNEN gösterir (kodlar i18n'e hazır). */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert"
      className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-sm text-muted">{children}</div>;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' | 'success' | 'warning' }) {
  const tones = {
    muted: 'border-border text-muted',
    danger: 'border-danger text-danger',
    success: 'border-success text-success',
    warning: 'border-warning text-warning',
  }[tone];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] leading-tight ${tones}`}>
      {children}
    </span>
  );
}

/**
 * Karşılanmayan ön-şartlar.
 *
 * ⭐ Adlar **TÜRKÇE** gösterilir (§13.14: kod/DB İngilizce, oyuncuya görünen metin Türkçe).
 * Çeviri sunucudan `requirementNames` ile gelir — istemci ikinci bir eşleme tablosu tutmaz,
 * tutsaydı katalogdan kaçınılmaz olarak sürüklenirdi.
 */
export interface NamedRequirement {
  id: string;
  name: string;
  level: number;
  kind: 'building' | 'tech';
}

export function Requirements({
  requirementNames, buildings, techs,
}: {
  requirementNames: NamedRequirement[] | undefined;
  buildings: Record<string, number>;
  techs: Record<string, number>;
}) {
  const unmet = (requirementNames ?? []).filter((r) => {
    const have = r.kind === 'building' ? (buildings[r.id] ?? 0) : (techs[r.id] ?? 0);
    return have < r.level;
  });
  if (unmet.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-danger">
      Gerekli: {unmet.map((r) => {
        const have = r.kind === 'building' ? (buildings[r.id] ?? 0) : (techs[r.id] ?? 0);
        return `${r.name} ${r.level} (${have})`;
      }).join(' · ')}
    </div>
  );
}
