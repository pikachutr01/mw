# -*- coding: utf-8 -*-
"""
k.java DİZE TABLOSU ÇÖZÜCÜ — `docs/JAVA_ROENTGEN.md`'nin ana aleti.

Orijinal J2ME istemcisinde ekranda görünen HER metin ve HER sunucu ucu tek bir dizide durur:
`k.java` → `public static final String[] a`. Obfuscation yüzünden kod `k.a[231]` gibi çıplak
indekslerle konuşur; bu betik o indeksleri okunur hâle getirir.

KULLANIM
--------
    python docs/araclar/java-dize.py                 # tabloyu kall.txt'e dök
    python docs/araclar/java-dize.py 91 108 16       # yalnız verilen indeksleri yaz
    python docs/araclar/java-dize.py --ara Dirilt    # metne göre indeks bul

⚠️ TUZAK 1 — ÇİFT KODLAMA. Dosya **UTF-8**'dir, ama içindeki Türkçe zaten bir kez bozulmuş:
orijinal cp1254 baytları (`ı` = 0xFD) decompile sırasında latin-1 sanılıp (`ý`) öyle UTF-8'e
yazılmış. Yani ekranda `Altýn` görürsün, doğrusu `Altın`. Geri dönüşüm iki adım:

    utf-8 ile OKU  →  .encode('latin-1')  →  .decode('cp1254')

`duzelt()` bunu yapıyor. ⚠️ Dosyayı latin-1 okumak da işe yarar (regex eşleşir) ama metin
**çift bozuk** çıkar (`AltÃ½n`) ve düzeltilemez — bu tuzağa bir kez düşüldü.

⚠️ TUZAK 2 — WINDOWS KABUĞU. Bu betiği `python -c "..."` ile tek satıra sıkıştırmaya çalışma:
Git Bash ters bölüleri yiyor ve regex `unterminated character set` ile patlıyor. Betik dosya
olarak çalıştırılmalı (bu yüzden kalıcıya alındı).

⚠️ TUZAK 3 — ÇIKTIYI EKRANA BASMA. Windows konsolu cp1254; `⇒` gibi bir karakter
`UnicodeEncodeError` ile betiği yarıda kesiyor ve tablo eksik görünüyor. Bu yüzden çıktı
her zaman UTF-8 **dosyaya** yazılıyor.

⭐ ASIL KALIP — «bitişik indeks bloğu». Kod sık sık `k.a[N + değişken]` yazar (örnek:
`j.java:401` → `k.a[231 + durumKodu]`). Yani **etiket kümeleri tabloda ardışık durur**. Bir
durum/tip tablosu bulduğunda komşu indeksleri okumak, o özelliğin tüm sözlüğünü verir —
kodun geri kalanını okumadan.
"""
import io
import os
import re
import sys

KJAVA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'DecompiledSrc', 'src', 'k.java')


def yukle():
    """Dize tablosunu sırayla döndürür (indeks = listedeki konum)."""
    src = io.open(KJAVA, encoding='utf-8').read()
    m = re.search(
        r'public static final String\[\] a = new String\[\]\{(.*?)\};', src, re.S)
    if not m:
        raise SystemExit('k.java içinde dize tablosu bulunamadı')
    return re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))


def duzelt(s):
    """cp1254 baytlarını okunur Türkçeye çevirmeyi dener; olmazsa ham bırakır."""
    try:
        return s.encode('latin-1').decode('cp1254')
    except Exception:
        return s


def main():
    items = yukle()
    arg = sys.argv[1:]

    if arg and arg[0] == '--ara':
        desen = ' '.join(arg[1:]).lower()
        bulunan = [(i, duzelt(s)) for i, s in enumerate(items)
                   if desen in duzelt(s).lower() or desen in s.lower()]
        with io.open('kbul.txt', 'w', encoding='utf-8') as f:
            for i, s in bulunan:
                f.write('%3d\t%s\n' % (i, s))
        print('kbul.txt: %d eslesme' % len(bulunan))
        return

    if arg:
        with io.open('kbul.txt', 'w', encoding='utf-8') as f:
            for x in arg:
                i = int(x)
                f.write('k.a[%3d] = %s\n' % (i, duzelt(items[i])))
        print('kbul.txt: %d indeks' % len(arg))
        return

    with io.open('kall.txt', 'w', encoding='utf-8') as f:
        f.write('TOPLAM %d\n' % len(items))
        for i, s in enumerate(items):
            f.write('%3d\t%s\n' % (i, duzelt(s)))
    print('kall.txt: %d kayit' % len(items))


if __name__ == '__main__':
    main()
