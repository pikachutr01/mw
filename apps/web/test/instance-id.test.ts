/**
 * ⭐⭐ TEK CİHAZ / TEK SEKME KİMLİĞİ — 2026-08-16 canlı hatasının hesabı.
 *
 * Kullanıcı bildirdi: *"Bir sekmeden veya telefondaki PWA uygulamadan ilk girdiğimde karşıma
 * bu ekran çıkıyor… PWA uygulamayı kapatıp yeniden açtığımda aynı hata devam ediyor."*
 * Canlı ölçüm: bir günde **773** adet 409, **12 farklı oyuncu**.
 *
 * Sebep: kimlik yalnız `sessionStorage`taydı ve `sessionStorage` sekme/PWA kapanınca silinir.
 * Her açılış yeni bir kimlik demekti ve o kimlik, biraz önce ölen KENDİ kopyasıyla yarışıyordu.
 *
 * ⚠️ Buradaki dört senaryo kuralın tamamıdır. Üçü düzeltmenin kazancı, dördüncüsü ise
 * **düzeltmenin bozmaması gereken şey**: ikinci sekme hâlâ ayrı bir kopya sayılmalı. Kimliği
 * kalıcı depoya taşıyıp "hep aynı kimlik" demek hatayı kapatırdı ama kuralı da kapatırdı.
 */
import { describe, expect, it } from 'vitest';
import { decideInstanceId } from '../src/lib/instance-id.ts';

const SEKME = 'sekme-kimligi';
const SON = 'son-kullanilan';
const YENI = 'yepyeni';

describe('örnek kimliği kararı', () => {
  it('sayfa yenilemesi kimliği DEĞİŞTİRMEZ (F5 seni hesabından atmamalı)', () => {
    /* `sessionStorage` yenilemede yaşar; kilit hiç sorulmaz bile. */
    expect(decideInstanceId({
      tabId: SEKME, lastId: SON, soleCopy: true, newId: YENI,
    })).toBe(SEKME);
  });

  it('⭐ PWA kapanıp açıldı, başka kopya YOK → eski kimlik geri kuşanılır', () => {
    /* Hatanın ta kendisi: burada YENİ kimlik üretiliyordu ve oyuncu kendi ölü kopyasıyla
     * yarışmak zorunda kalıyordu. Aynı kimlikle sunucu «sahip zaten biziz» der ve geçirir. */
    expect(decideInstanceId({
      tabId: null, lastId: SON, soleCopy: true, newId: YENI,
    })).toBe(SON);
  });

  it('⚠️ başka kopya ÇALIŞIYOR → yeni kimlik (ikinci sekme kuralı korunur)', () => {
    expect(decideInstanceId({
      tabId: null, lastId: SON, soleCopy: false, newId: YENI,
    })).toBe(YENI);
  });

  it('hiç geçmiş yok → yeni kimlik', () => {
    expect(decideInstanceId({
      tabId: null, lastId: null, soleCopy: true, newId: YENI,
    })).toBe(YENI);
  });

  /**
   * ⚠️ Kilit «alınamadı» derken kalıcı kimliğe DÖNÜLMEMELİ. Web Locks olmayan bir tarayıcıda
   * `acquireSoleCopyLock` bilerek `false` dönüyor: tahmin yürütüp iki sekmeye aynı kimliği
   * vermektense eski (can sıkıcı ama güvenli) davranışa düşmek doğrusu.
   */
  it('kilit bilinmiyorsa kalıcı kimlik KUŞANILMAZ', () => {
    expect(decideInstanceId({
      tabId: null, lastId: SON, soleCopy: false, newId: YENI,
    })).not.toBe(SON);
  });
});
