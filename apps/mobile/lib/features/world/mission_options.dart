/// ⭐ SEFER SEÇENEKLERİ — `GET /api/v1/missions/options` yanıtı.
///
/// ⚠️⚠️ **KURAL SUNUCUDA YAŞIYOR.** İstemci *"kime ne gönderilebilir"i* KENDİ hesaplamıyor;
/// hesaplasaydı aynı mantık iki yerde durur ve kaçınılmaz olarak kayardı (maliyet ve süre
/// kuralıyla aynı ilke). Buradaki iş yalnız yanıtı okumak.
///
/// ⚠️ **Kapalı seçenek GİZLENMEZ, sebebiyle gösterilir.** Oyuncu neden yapamadığını görmeli;
/// sessizce kaybolan bir seçenek "bu oyunda böyle bir şey yok" diye okunuyordu.
library;

class MissionOption {
  const MissionOption({
    required this.type,
    required this.label,
    required this.enabled,
    required this.reason,
  });

  final String type;

  /// Sunucunun gönderdiği Türkçe ad. ⚠️ İstemci kendi tablosunu (`kMissionInfo`) tercih
  /// ediyor ama bu alan yedek: sunucuya yeni bir tip eklenirse ekran boş kalmasın.
  final String label;

  final bool enabled;

  /// Kapalıysa sebebi. `enabled` iken `null`.
  final String? reason;

  static MissionOption fromJson(Map<String, dynamic> j) => MissionOption(
    type: j['type'] as String,
    label: j['label'] as String? ?? '',
    enabled: j['enabled'] as bool? ?? false,
    reason: j['reason'] as String?,
  );
}

class MissionOptions {
  const MissionOptions({
    required this.activeCity,
    required this.options,
    required this.attacksLeft,
    required this.teleportReadyAt,
  });

  /// ⭐ Hedef, **şu anki aktif şehrin kendisi**. Menü yok — kendine görev gönderilemez.
  ///
  /// ⚠️ Bu, "seçenek yok" ile aynı şey DEĞİL: biri *"bu hedefe hiçbir şey gönderemezsin"*,
  /// diğeri *"buradan bakıyorsun zaten"* diyor ve ekran ikisine farklı cümle yazıyor.
  final bool activeCity;

  final List<MissionOption> options;

  /// ⭐ Bu şehre bugün kalan saldırı hakkı. ⚠️ Kural anlatmak yerine SAYI gösteriliyor.
  final int? attacksLeft;

  /// Teleport beklemedeyse hazır olacağı an (OYUN saati) — sebebin altına geri sayım düşüyor.
  ///
  /// ⚠️ *"Hazır değil"* yetmiyor (kullanıcı, 2026-08-03): NE KADAR kaldığı lazım.
  final String? teleportReadyAt;

  static MissionOptions fromJson(Map<String, dynamic> j) => MissionOptions(
    activeCity: j['activeCity'] as bool? ?? false,
    options: (j['options'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MissionOption.fromJson)
        .toList(),
    attacksLeft: (j['attacksLeft'] as num?)?.toInt(),
    teleportReadyAt: j['teleportReadyAt'] as String?,
  );
}

/// Sefere katılabilecek kahraman.
///
/// ⚠️ Yalnız `in_city` olanlar listelenir: ölü, dirilen, seferde ya da dönüş yolundaki bir
/// kahraman seçilirse sunucu `hero_unavailable` ile reddeder ve oyuncu formu doldurduktan
/// SONRA hatayı görür — reddi önce söylemek daha dürüst.
///
/// ⭐ Mağara durumları bu süzgece **kendiliğinden** takılıyor: mağaradaki kahraman `in_cave`,
/// mağaraya girmek üzere işaretlenmiş olan `entering_cave` — ikisi de `in_city` değil. Yani
/// «mağara emrindeki kahraman başka göreve gidemez» kuralı için ayrı bir süzgeç gerekmedi.
class MwCityHero {
  const MwCityHero({required this.id, required this.name, required this.level});

  final int id;
  final String name;
  final int level;

  static List<MwCityHero> listFromTemple(Object? body) {
    if (body is! Map) return const [];
    return (body['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where((h) => h['state'] == 'in_city')
        .map(
          (h) => MwCityHero(
            id: (h['id'] as num).toInt(),
            name: h['name'] as String? ?? '',
            level: (h['level'] as num?)?.toInt() ?? 1,
          ),
        )
        .toList();
  }
}
