-- ⭐ SONUÇLANMIŞ İTTİFAK DAVET/BAŞVURU MESAJLARI SİLİNİYOR (kullanıcı, 2026-08-09).
--
-- *"İttifak liderinin sonuçlandırdığı başvuru raporları raporlardan hepten silinsin. Mesajlarda
-- kalmaya devam ediyor, yeniden açıp Kabul veya Red tıklandığında «Bu istek zaten sonuçlanmış.»
-- uyarısı geliyor."*
--
-- Başvuru mesajı lider VE tüm konsey üyelerinin kutusuna ayrı satır olarak düşüyor. Biri karar
-- verince `alliance_invites.status` değişiyor ama mesaj satırlarının hiçbiri silinmiyordu:
-- geride, üstündeki iki düğme artık yalnız hata üreten ölü satırlar kalıyordu. Aynı şey
-- "oyuncu başka ittifağa katıldı" diye toplu iptal edilen bekleyen başvurular için de geçerli.
--
-- Bundan sonrasını `AllianceService.dropInviteMessages` hallediyor. Bu göç iki şey yapıyor:
-- (1) o silmenin dayandığı indeksi kurar, (2) BUGÜNE KADAR birikmiş ölü satırları temizler.

-- ── 1. İNDEKS ────────────────────────────────────────────────────────────────
--
-- ⚠️ Silme `body->>'inviteId'` üzerinden yapılıyor; indekssiz her karar `messages` tablosunu
-- baştan sona tarardı. O tablo oyunun EN ÇOK BÜYÜYEN tablosu (her savaş, casusluk, nakliye ve
-- destek bir satır yazıyor), yani tarama zamanla uzar ve üstelik ittifak kararının transaction'ı
-- satır kilitlerini tutarken uzar. İndeks kısmi: yalnız iki `kind` değeri, yani boyutu bu iki
-- akışın canlı satır sayısı kadar — pratikte birkaç yüz satır.
--
-- ⚠️ İfade indeksi ancak `WHERE` yan tümcesi de AYNI ifadeyi kullanırsa devreye girer:
-- `(body->>'inviteId')::bigint`. Servisteki sorgu birebir böyle yazılı; biri değişirse indeks
-- sessizce kullanılmaz hâle gelir (sonuç yine doğru olur, yalnız yavaşlar).
CREATE INDEX IF NOT EXISTS "messages_alliance_invite"
    ON "messages" ((("body" ->> 'inviteId')::bigint))
 WHERE "kind" IN ('alliance_invite', 'alliance_application');

-- ── 2. BİRİKMİŞ ÖLÜ SATIRLARIN TEMİZLİĞİ ─────────────────────────────────────
--
-- ⚠️ Yalnız `status <> 'pending'` olanlar siliniyor: bekleyen davet/başvurular oyuncunun
-- gerçekten karar vermesi gereken satırlar, onlara DOKUNULMUYOR.
--
-- ⚠️ Karşılığı OLMAYAN satırlar da gidiyor (`NOT EXISTS`): davet satırı silinmiş ama mesaj
-- kalmışsa o mesaj sonsuza kadar "Davet bulunamadı." verir — ölü satırın en kötü türü.
DELETE FROM "messages" m
 WHERE m."kind" IN ('alliance_invite', 'alliance_application')
   AND (
     EXISTS (
       SELECT 1 FROM "alliance_invites" i
        WHERE i."id" = (m."body" ->> 'inviteId')::bigint
          AND i."status" <> 'pending'
     )
     OR NOT EXISTS (
       SELECT 1 FROM "alliance_invites" i
        WHERE i."id" = (m."body" ->> 'inviteId')::bigint
     )
   );
