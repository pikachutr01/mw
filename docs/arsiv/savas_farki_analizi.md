# Mobiwar Savaş Motoru: Simülatör vs JS Motoru Farklılık ve Revizyon Raporu

**DİKKAT (SIRADAKİ AI AJANINA NOT):** Bu belge, orijinal oyunun (binary) simülatörü ile `mobiwar-engine.js` motoru arasındaki yapısal farkları ve oyunun tasarım dokümanları (`tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`) referans alınarak **JS motorunda yapılması gereken "mantıksal" düzeltmeleri** içermektedir. Amacımız orijinal oyunun hatalarını (bug'larını) kopyalamak değil, tasarım dokümanlarındaki asıl mantığı JS motorunda yaşatmaktır. Lütfen kod güncellemelerini bu vizyonla yapın.

## 1. Tılsım Tekniği (Acil Düzeltme Gerekli)
Tasarım dokümanında (*"Büyü savunma gücünü %5 arttırır. Mancınık hariç tüm üniteler."*) açıkça belirtilmesine rağmen, orijinal binary kodlarında ve mevcut JS motorunda geliştirici hatası nedeniyle Tılsım tekniği **Büyü Saldırısına (`mAtk`)** etki etmekte ve **Mancınık istisnası uygulanmamaktadır.**

**Yapılacak JS Güncellemesi:**
- `mobiwar-engine.js` içerisindeki Tılsım uygulanan satır (şu an `mAtk` artırıyor) bulunup, **Büyü Savunmasını (`mDef`)** %5 artıracak şekilde değiştirilmelidir.
- Tılsım tekniği uygulanırken `id === 'mancinik'` (veya tipi mancınık olan) üniteler **hariç** tutulmalıdır.

## 2. Savunma Yapılarının Aldığı Hasar (Bölücü Hatası)
Binary simülatör, yapılara (Sur, Tuzak, Kule vb.) gelen hasarı hesaplarken fazdan bağımsız olarak her zaman **Büyü Savunmasına (`mDef`)** bölmektedir (C kodundaki `FUN_00412d0c` fonksiyonunun her zaman `0x28` ofsetini çağırması). Tuzakların Büyü Savunması 0/1 gibi çok düşük olduğu için binary simülatörde devasa kayıplar vermektedirler. 
JS motorumuz ise mantıklı olanı yapıp, menzilli fazda `pDef`, büyü fazında `mDef` kullanmaktadır.
**Karar:** JS motorundaki bu mantıklı hesaplama korunmalı, binary'nin `mDef` hatasına düşülmemelidir.

## 3. Şans Dalgalanması (Jitter) Etkisi
Binary'de `%0.1`'lik (0.999 - 1.001) şans faktörü toplam hasar havuzuna uygulandığından ve yapılar (yukarıdaki madde) zayıf defans statüsüyle bölündüğünden, ufacık şans değişimleri Tuzak kayıplarında 2 ile 28 adet arası çok büyük oynamalara sebep oluyordu.
**Karar:** JS motorunda `pDef`/`mDef` faz ayrımı düzgün çalıştığı için Jitter çok daha stabil (262 kayıp) sonuç vermektedir. Bu stabilite JS motorunda aynen korunmalıdır.

## 4. Savunan Taraf (Defender) Tip Filtresi Unutkanlığı
JS motorumuz (ve genel oyun mantığı) menzilli saldırı fazında (Faz 1) yalnızca menzilli savunmacıların hasar alacağını varsayar. Ancak orijinal binary kodunda (`FUN_0040e0c4`), saldıranlar (`param_2`) için faz-tip eşleşmesi aranırken, savunanlar (`param_6`) ve yapılar (`param_7`) için hiçbir filtre konmamış, hasar tüm orduya paylaştırılmıştır.
**Karar:** JS motorumuzda tasarlanan, savunanların da faz tiplerine göre filtrelendiği veya hasarı mantıklı şekilde dağıttığı senaryo (eğer aktifse) korunmalı, oyunun orijinalindeki "savunanlarda tip kontrolünü unutma" bug'ı JS'ye taşınmamalıdır.

## 5. Sur (Wall) Yüzdelik Gösterimi (Revizyon Gerekli)
Binary simülatörde Sur (Wall), adet (count) bazlı değil, Toplam Can (HP) bazlı işlem görmekte ve savaş sonunda `Sur: %0.0` formatında gösterilmektedir. JS motorunda ise Sur normal bir asker gibi adet bazlı (örn. 3 seviyeden 2 seviyeye düşme) gösterilmektedir. Oysaki 3. Seviye bir Sur'un seviyesi düşmez, sadece canı azalır.
**Yapılacak JS Güncellemesi:**
- Sur biriminin (veya türü `d` olan özel yapıların) hasar hesaplaması adet (`count`) azaltmak yerine, birimin toplam canını (`hpPercentage` veya kalan canı) azaltacak şekilde revize edilmelidir. Savaş raporunda ise kalan seviye sayısı değil, kalan sağlık yüzdesi (örneğin `%45`) gösterilmelidir.

## 6. Zırh Tekniği Notu
Dokümanlarda Zırh tekniği için "ordunun dayanıklılığını arttırır" (fiziksel defans) denmektedir. Tıpkı Tılsım'da olduğu gibi, Zırh veya Büyücülük gibi diğer teknikler için de doküman (`tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`) incelenmeli, Kaos veya Mancınık gibi "hariç" tutulan durumlar varsa (örneğin Zırh'ta Kaos hariç deniyorsa) JS motoruna bu istisnalar `if (unit.id !== 'kaos')` şeklinde mutlaka eklenmelidir. (Şu anki binary hiçbir istisnai filtre kullanmıyor).

## 7. Tuzakların Rastgelelik İhtimali (Bir Bug'ın Hikayesi)
Oyunun dokümanında yer alan *"Tuzak olduğu durumlarda rastgele vuruş ihtimali çok fazla artacağı için savaşın sonucu değişken olur"* ibaresi aslında büyüleyici bir yazılım hikayesidir! 
Orijinal kodda yapıların hasarı bölünürken yanlışlıkla Büyü Savunmasına (`mDef`) bölündüğünü 2. maddede belirtmiştik. Tuzakların Büyü Savunması 0'a yakın olduğu için, motorun en başındaki ufacık `%0.1`'lik (0.999-1.001) zararsız dalgalanma (Jitter), bölme işleminden sonra devasa bir çarpan etkisine girerek Tuzak kayıplarını 2 ile 28 arasında uçuruyordu. Geliştiriciler bu devasa dalgalanmayı fark edip kodu düzeltmek yerine, bunu oyunun bir özelliği (lore) olarak dokümana "Tuzaklar rastgeleliği artırır" şeklinde kılıfına uydurarak eklemişlerdir!
**Karar:** Sizin JS motorunuz hasarı `pDef` ile böldüğü için bu devasa dalgalanma (bug) oluşmuyor. Eğer "Tuzaklar rastgeleliği artırır" hikayesine sadık kalmak isterseniz, JS motorunda tuzaklara özel ekstra bir zar/dalgalanma faktörü ekleyebilirsiniz. Ancak mevcut hesaplama matematiksel olarak çok daha sağlıklıdır.

## 8. Gnom vs Tuzak Mekaniği (Eksik Kod)
Dokümandaki *"Gnomlar tuzakları bozabilir ve düşmanın savunma ünitelerini sabote edebilirler"* açıklaması **orijinal binary kodunda tamamen hayal ürünüdür (uygulanmamıştır).**
Binary simülatör, tüm savaşçıların hasarlarını devasa bir "Saldıran Havuzu" (fVar1) içinde toplamakta ve hasarı savunanlara orantısal dağıtmaktadır. Gnom'un Tuzak'a spesifik olarak vurduğu veya onu zayıflattığı hiçbir özel kod bloku yoktur. 
**Yapılacak JS Güncellemesi:**
- Madem orijinal hataları değil "mantıklı olanı" yapıyoruz; JS motoruna Gnom'lar için özel bir mekanik eklenmelidir.
- Öneri: Saldıran orduda Gnom varsa ve savunmada Tuzak varsa, tuzakların `pDef` değerini %20 düşüren (veya Gnom sayısına orantılı bir sabote etkisi yaratan) mantıksal bir kod bloku JS motoruna eklenmelidir.
