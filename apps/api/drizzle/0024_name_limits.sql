-- Ad sınırı 3-10 karakter (kullanıcı kararı 2026-07-31, kaynak: g.java:1893 `m.a(2, 10, …)`).
-- Kural bugünden itibaren `city-name.ts`'te; bu göç yalnız GEÇMİŞİ ona uyduruyor.
--
-- ⚠️ `left()` KARAKTER sayar, bayt değil → "Çığlıktepe Ovası" düzgün kırpılır, Türkçe harf
-- ikiye bölünmez. `btrim` önce çalışır ki kırpma sonrası sonda boşluk kalmasın.
-- Kırpma sonucu 3 karakterin altına düşemez: yalnız 10'dan UZUN adlara dokunuluyor.
UPDATE cities SET name = btrim(left(btrim(name), 10)) WHERE length(btrim(name)) > 10;
UPDATE heroes SET name = btrim(left(btrim(name), 10)) WHERE length(btrim(name)) > 10;
