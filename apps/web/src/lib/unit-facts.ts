/**
 * ⭐ BİRİM BİLGİ KUTUSUNUN **TÜRETİLMİŞ** KISMI — kaynağı savaş motorunun kendi kataloğu.
 *
 * Kullanıcı isteği (2026-08-11): Baraka'daki her askerin yanına, Yapılar sayfasındakine benzer
 * bir bilgi kutusu. *"Kaynak tabii ki savaş motoru olacak."*
 *
 * ⚠️ **Neden `info-texts.ts`te DEĞİL.** O dosya arayüz **kopyası** taşıyor (elle yazılmış
 * açıklama metinleri) ve kendi başlığında bunu söylüyor. Buradaki üç şey ise kopya değil,
 * `@mobilwar/catalog`tan **türetilmiş olgular**: hangi teknikler etkiliyor, hangi fazda vuruyor,
 * uçuyor mu. Elle yazsaydık motor değiştiğinde ekran sessizce yalan söylerdi — ve bu tam olarak
 * yaşandı: oyunun kendi dokümanı üç yerde motorla ÇELİŞİYOR (aşağıya bak).
 *
 * ⚠️⚠️ **Dokümanla motorun çeliştiği yerler — bu dosyanın var olma sebebi.**
 * `docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt` şunları diyor ama motor öyle
 * davranmıyor; ilk üçü binary ölçümüyle (2026-07-29 / 2026-08-09) çürütüldü ve gerekçeleri
 * `techs.ts` içinde duruyor:
 *   • *"Zırh … Kaos hariç tüm savaşçılar"* → **Kaos DA etkileniyor** (ölçüm: 635 → 720).
 *   • *"Ogre … Demircilik"* → **etkilenmiyor**; Ogre'nin tek `atk` tekniği İçgüdü.
 *   • *"Büyü Kalkanı … Büyücülük"* → **Tılsım**; Büyücülük kalkana hiç dokunmuyor.
 *   • *"Elf … Büyücülük"* → **etkilenmiyor**. ⭐ Bunu bu turun testi yakaladı: doküman kendi
 *     içinde çelişiyor (TEKNİKLER bölümündeki Büyücülük listesinde Elf yok, Elf maddesinde var)
 *     ve motor haklı — Elf'in `magicHp`si **0**, yani Büyücülük ona uygulansa bile hiçbir şey
 *     yapmazdı.
 * Liste elle yazılsaydı popover bu dört yanlışı oyuncuya öğretmeye devam ederdi.
 */
import { NO_POOL, TECHS_BY_ID, TECH_BY_UNIT, TECH_ORDER, UNITS_BY_ID } from '@mobilwar/catalog';

/**
 * Birimi ölçekleyen tekniklerin **Türkçe adları**, Akademi ekranındaki sırayla.
 *
 * ⚠️ Sıra `TECH_ORDER`dan geliyor, `TECH_BY_UNIT`in kendi sırasından değil: oyuncu aynı listeyi
 * Akademi'de görüyor ve iki ekranda farklı sıra "acaba başka bir şey mi" sorusu doğuruyor.
 * ⚠️ `stat: null` teknikler (Casusluk · Haritacılık · Sömürgecilik · Gece Görüş) burada
 * **görünmez** — `TECH_BY_UNIT` onları hiç indekslemiyor, çünkü savaş statına dokunmuyorlar.
 * Casus Kuş'un Casusluk'la ilişkisi gerçek ama savaş ölçeklemesi değil; o yüzden metinle
 * anlatılıyor (`info-texts.ts` → `UNIT_INFO.spy_bird.extra`), listeye sokulmuyor.
 */
export function unitTechNames(unitId: string): string[] {
  const ids = new Set((TECH_BY_UNIT[unitId] ?? []).map(([techId]) => techId));
  return TECH_ORDER.filter((t) => ids.has(t as never))
    .map((t) => TECHS_BY_ID[t]?.name.tr ?? t);
}

/** Savaş fazı → oyuncunun gördüğü ad. Motorda `type` birimin hangi fazda VURDUĞUdur. */
const PHASE: Readonly<Record<number, string>> = {
  1: 'Menzilli',
  2: 'Yakın dövüş',
  3: 'Büyü',
};

/**
 * ⭐ «Vuruş» satırı — birimin hangi faz(lar)da hasar verdiği. `null` = hiç vurmuyor, satır çizilmez.
 *
 * Motordaki kural iki parçalı (`combat.ts` havuz toplama):
 *   • fiziksel havuza yalnız `type`i eşleşen birimler katılır (`hp` ile),
 *   • büyü havuzuna **tip süzgeci olmadan herkes** katılır (`magicHp` ile).
 * Yani Pegasus (tip 1, `magicHp` 250) hem menzilli hem büyü fazında vuruyor — tek bir etiket
 * bunu yanlış anlatırdı.
 *
 * ⚠️ `NO_POOL` birimleri (Şaman · Gnom) hiçbir havuza girmez: statları var ama hasar vermezler.
 * ⚠️ **Tuzak da dışarıda**: motorda ayrı bir tek-kullanımlık salvo mekanizması var
 * (`trapVolley`), `type` alanı onu anlatmıyor. Yanlış bir etiket yerine hiç etiket.
 */
const NO_PHASE_LABEL: ReadonlySet<string> = new Set(['trap']);

export function unitStrikeLabel(unitId: string): string | null {
  const def = UNITS_BY_ID[unitId];
  if (!def || NO_POOL.has(unitId) || NO_PHASE_LABEL.has(unitId)) return null;
  const parts: string[] = [];
  if (def.hp > 0) parts.push(PHASE[def.type] ?? '');
  if (def.magicHp > 0 && def.type !== 3) parts.push(PHASE[3]!);
  const out = parts.filter(Boolean);
  return out.length > 0 ? out.join(' · ') : null;
}

/**
 * Bilgi kutusunun «Özellikler» bölümünde gösterilecek satırlar.
 *
 * ⚠️ **Sıfır satır ÇİZİLMEZ.** Savunma birimlerinin hızı 0 (sefere çıkmazlar), çoğunun taşıma
 * kapasitesi 0. «Hız 0 · Kapasite 0» yazmak bilgi değil gürültü olurdu.
 *
 * ⚠️⚠️ **`Alan` YALNIZ SAVAŞÇILARDA** (kullanıcı, 2026-08-11: *"savunma üniteleri için alan
 * tanımı olmasın; dokümanda yazıyor ama oyunda efektif olarak kullanmadık"*).
 *   • Savaşçıda alan **gerçek bir kısıt**: Mağara kapasitesini o tüketiyor ve Yapılar ekranında
 *     «142 / 800 alan» diye zaten görünüyor.
 *   • Savunmada ise ölü bir sayı. Tüketeceği bütçe `defenseCapacity` (25.000 × 1,3^(Sur−1)) ve
 *     o kural **uygulanmıyor**: `capacity.service.ts` → `defenseCapacity.enforced: false`
 *     (kullanıcı kararı 2026-07-27 — savunma birimleri sınırsız üretilebiliyor). Oyuncunun
 *     hiçbir kararını değiştirmeyen bir sayıyı göstermek onu boş yere "bir yere sığmalıyım"
 *     diye düşündürürdü.
 *   • Sur ve Büyü Kalkanı zaten bu kapsamda; ayrıca onlarınki bir kapasite maliyeti değil,
 *     seviyeyle `1,8^sv` büyüyen bir güç tabanı — tek bir sayı yazmak "Sur 20'nin alanı da 300"
 *     diye okunurdu.
 *
 * ⚠️ Kural `kind` üzerinden kuruluyor, `LEVEL_BASED` üzerinden DEĞİL: yeni bir adetli savunma
 * birimi eklendiğinde ayrıca bir listeye yazılması gerekmesin.
 * ⚠️ `defenseCapacity.enforced` bir gün `true` olursa bu satır geri gelmeli — o zaman alan
 * yeniden oyuncunun kararını değiştiren bir sayı olur.
 */
export interface UnitStat { label: string; value: string }

export function unitStats(
  unitId: string,
  fmt: (n: number) => string,
  server?: { area?: number; speed?: number; carry?: number },
): UnitStat[] {
  const def = UNITS_BY_ID[unitId];
  if (!def) return [];
  const speed = server?.speed ?? def.speed;
  const carry = server?.carry ?? def.carry;
  const area = server?.area ?? def.area;

  const rows: UnitStat[] = [];
  if (speed > 0) rows.push({ label: 'Hız', value: fmt(speed) });
  if (carry > 0) rows.push({ label: 'Taşıma kapasitesi', value: fmt(carry) });
  if (def.kind === 'warrior') rows.push({ label: 'Alan', value: fmt(area) });
  const strike = unitStrikeLabel(unitId);
  if (strike) rows.push({ label: 'Vuruş', value: strike });
  return rows;
}
