/**
 * ⭐ KAHRAMAN YETENEKLERİ — dört anahtarın adı ve simgesi, **tek kaynakta**.
 *
 * 2026-08-07'ye kadar bu liste yalnız `screens/Temple.tsx`'in içinde gömülüydü. Casusluk
 * raporu da artık aynı dörtlüyü çiziyor (§13.11.6, kahraman istihbaratı) ve ikinci bir kopya
 * kaçınılmaz olarak ayrışırdı — bir yerde "Büyü Saldırı", öbüründe "Büyü Sald." olurdu.
 * Bildirim kataloğunun "tek metin kaynağı" kuralının küçük ikizi.
 *
 * ⚠️ `hint` metinleri BURAYA TAŞINMADI: onlar Tapınak ekranına özgü, "puanı nereye harcayayım"
 * sorusuna cevap veriyor. Casusluk raporunda rakibin puanını okuyan oyuncuya ders anlatmanın
 * yeri değil. Ortak olan şey anahtar + etiket + simge.
 *
 * ⚠️ Sıra rastgele değil: fiziksel saldırı → fiziksel savunma → büyü saldırı → büyü savunma.
 * Oyunun kendi ekranındaki sıra bu; iki ekranda farklı olsaydı sayılar yanlış okunurdu.
 */
import type { HeroSkills } from './queries.ts';

export interface HeroSkillDef {
  key: keyof HeroSkills;
  /** `/assets/hero/<icon>.png` */
  icon: string;
  label: string;
}

export const HERO_SKILLS: readonly HeroSkillDef[] = [
  { key: 'fAtk', icon: 'fiz_sal', label: 'Fiziksel Saldırı' },
  { key: 'fDef', icon: 'fiz_sav', label: 'Fiziksel Savunma' },
  { key: 'mAtk', icon: 'buy_sal', label: 'Büyü Saldırı' },
  { key: 'mDef', icon: 'buy_sav', label: 'Büyü Savunma' },
];
