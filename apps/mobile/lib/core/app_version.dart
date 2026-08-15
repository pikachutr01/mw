/// UYGULAMA SÜRÜMÜ — "güncelleme şart mı" kararı.
///
/// ⚠️ Mobilin getirdiği tek gerçek kısıt burada somutlaşıyor (`DAGITIM.md` §6): web'de eski
/// istemci yoktur, sayfa yenilenir; mobilde mağaza onayı günler sürer ve güncellemeyi almayan
/// oyuncu haftalarca eski sürümde kalır. Bu kapı bir **acil vana** — normalde kapalı
/// (`client.minAndroidBuild = 0`), ilk çare her zaman API'yi geriye uyumlu tutmak.
///
/// ⭐⭐ Karşılaştırma **YAPI NUMARASI** (tam sayı) üzerinden, sürüm dizesi üzerinden DEĞİL.
/// Semver dizelerini karşılaştırmak klasik bir hata kaynağı: sıradan metin karşılaştırmasında
/// `'1.10.0' < '1.9.0'` çıkar ve kapı sessizce yanlış tarafa düşer.
library;

/// `1.2.3+45` → `45`. Ayrıştırılamazsa `null`.
///
/// ⚠️ `null` dönmesi **kapıyı AÇIK bırakır** (aşağıya bak) — bilinçli. Yapı numarasını
/// okuyamamak, oyuncuyu oyundan atmak için yeterli bir sebep değil.
int? yapiNumarasi(String surum) {
  final i = surum.lastIndexOf('+');
  if (i < 0 || i == surum.length - 1) return null;
  return int.tryParse(surum.substring(i + 1));
}

/// Güncelleme zorunlu mu?
///
/// ⚠️ Şüphede kalınan her durumda **false** dönüyor: sürüm okunamadı, minimum okunamadı,
/// minimum 0 (kapalı). Bir sürüm kapısının yanlış tarafa düşmesinin bedeli asimetrik —
/// gereksiz yere açık kalırsa eski bir uygulama biraz daha çalışır, gereksiz yere kapanırsa
/// oynayabilecek herkesi oyundan atarız.
bool guncellemeGerekli({required String? surum, required int? enDusukYapi}) {
  if (enDusukYapi == null || enDusukYapi <= 0) return false;
  if (surum == null) return false;
  final yapi = yapiNumarasi(surum);
  if (yapi == null) return false;
  return yapi < enDusukYapi;
}
