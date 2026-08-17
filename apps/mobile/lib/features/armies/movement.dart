/// ⭐ ORDU HAREKETİ — `GET /api/v1/missions` yanıtındaki tek satır.
///
/// ⚠️⚠️ **SÖZLEŞME BORCU** (`MOBIL_MIMARI.md` §4, `city_model.dart` ile aynı gerekçe). Bu uç
/// `mission.controller.ts` · `list()` içinde `Record<string, unknown>[]` biriktirip
/// `...base` yayılımıyla dönüyor; şemayla daraltmak DERLENİR ama hiçbir şey ölçmez
/// (TypeScript'in fazla-alan denetimi yayılıma uygulanmıyor) — sahte bir kapı olurdu.
///
/// ⚠️ Bu dosyada `?? 0` **savunma amaçlı değil, anlamlı**: sunucu `units`i her zaman gönderiyor
/// (`COALESCE(json_object_agg(...), '{}')`), boş nesne "ordu yok" demek değil **"tüm askerler
/// öldü, kahraman dönüyor"** demek. Yani `{}` gerçek bir durum; onu `null`dan ayırmaya gerek yok.
///
/// ─ ⚠️ SUNUCUDA MASKELENMİŞ ALANLAR ───────────────────────────────────────────────────────
/// Koordinatıma gelen bir `found_city` bana `attack` olarak geliyor ve `cargo`su siliniyor
/// (§13.6.5 maskesi). İstemci maskeyi **delmemeli**: burada `type` neyse o gösterilir, "acaba
/// gerçekten saldırı mı" diye bir çıkarım yapılmaz.
library;

typedef MwCoords = ({int k, int d, int s});

/// ⚠️ Yalnız ad + seviye. Kahramanın yetenek dağılımı sunucuda BİLEREK verilmiyor: savaşı
/// önceden simüle ettirirdi (casuslukla bile bu netlikte alınmıyor).
typedef MwHero = ({String name, int level});

class Movement {
  const Movement({
    required this.key,
    required this.id,
    required this.type,
    required this.direction,
    required this.icon,
    required this.cityId,
    required this.startedAt,
    required this.executeAt,
    required this.origin,
    required this.originPlayer,
    required this.target,
    required this.targetPlayer,
    required this.returnOf,
    required this.canceled,
    required this.canCancel,
    required this.units,
    required this.heroes,
    required this.cargo,
  });

  /// ⭐ Liste anahtarı — **`id` DEĞİL**. Aynı görev iki satır üretebiliyor: kendi şehrimden
  /// kendi şehrime nakliye hem `<id>-out` hem `<id>-in` olarak listeleniyor. `id` ile
  /// anahtarlasaydık Flutter iki satırı aynı sanardı.
  final String key;

  /// Görevin kendisi — iptal bu numarayla isteniyor.
  final int id;

  /// `attack` · `return` · `transport` · `support` · `spy` · `found_city` · `cave_return`.
  final String type;

  /// `out` (benim gönderdiğim) · `in` (bana gelen) · `own` (kendi dönüşüm).
  ///
  /// ⚠️ Kendi ordumun dönüşü `in` DEĞİL `own`: hedef şehir benim ama bu bir tehdit değil.
  final String direction;

  /// `assets/missions/<icon>.png` — dosya adını **sunucu seçiyor**.
  ///
  /// ⚠️ İstemci `type`tan simge TÜRETMİYOR: dönüş bacağında simge görevin ASLINA göre
  /// seçiliyor (casusluk dönüşü kuş, kılıç değil) ve o bilgi yalnız sunucuda tam.
  final String icon;

  /// Hareketin asıldığı **benim** şehrim: gidende kaynak, gelende hedef.
  final int cityId;

  final String startedAt;
  final String executeAt;

  final MwCoords? origin;
  final String? originPlayer;
  final MwCoords? target;
  final String? targetPlayer;

  /// Dönüş bacağında hangi görevden dönüldüğü; başlık «Casusluk dönüşü» yazabilsin diye.
  final String? returnOf;

  /// Dönüş, görevin iptalinden mi doğdu?
  final bool canceled;

  /// ⚠️ Kararı **sunucu** veriyor (`status === 'scheduled'` ve tip iptal edilebilir mi).
  /// İstemcide yeniden hesaplamak, worker görevi almışken hâlâ açık bir düğme göstermek
  /// olurdu.
  final bool canCancel;

  final Map<String, int> units;
  final List<MwHero> heroes;

  /// Taşınan yük: nakliye/destekte kargo, dönüşte ganimet.
  ///
  /// ⚠️ Saldırı/casusluk **GİDİŞİNDE `null`** — payload'da hiç yok, yani savunan savaştan önce
  /// kaynak bilgisi görmüyor. `null` ile `(0, 0)` farklı şeyler ve bu fark bir gizlilik sınırı.
  final ({int gold, int food})? cargo;

  static Movement fromJson(Map<String, dynamic> j) {
    final heroes = (j['heroes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (h) => (
            name: h['name'] as String? ?? '',
            level: (h['level'] as num?)?.toInt() ?? 0,
          ),
        )
        .toList();

    return Movement(
      key: j['key'] as String,
      id: (j['id'] as num).toInt(),
      type: j['type'] as String,
      direction: j['direction'] as String,
      icon: j['icon'] as String,
      cityId: (j['cityId'] as num).toInt(),
      startedAt: j['startedAt'] as String,
      executeAt: j['executeAt'] as String,
      origin: _coords(j['origin']),
      originPlayer: j['originPlayer'] as String?,
      target: _coords(j['target']),
      targetPlayer: j['targetPlayer'] as String?,
      returnOf: j['returnOf'] as String?,
      canceled: j['canceled'] as bool? ?? false,
      canCancel: j['canCancel'] as bool? ?? false,
      units: {
        for (final e
            in (j['units'] as Map<String, dynamic>? ?? const {}).entries)
          if (e.value is num) e.key: (e.value as num).toInt(),
      },
      heroes: heroes,
      cargo: _cargo(j['cargo']),
    );
  }

  /// ⚠️ Koordinat `null` OLABİLİR: şehir kurma dönüşünün kaynağı, şehir kurulamayan **boş bir
  /// koordinat**tır ve JOIN boş dönerse sunucu payload'dan okur; okuyamazsa alan null gelir.
  static MwCoords? _coords(Object? raw) {
    if (raw is! Map) return null;
    final k = raw['k'], d = raw['d'], s = raw['s'];
    if (k is! num || d is! num || s is! num) return null;
    return (k: k.toInt(), d: d.toInt(), s: s.toInt());
  }

  static ({int gold, int food})? _cargo(Object? raw) {
    if (raw is! Map) return null;
    return (
      gold: (raw['gold'] as num?)?.toInt() ?? 0,
      food: (raw['food'] as num?)?.toInt() ?? 0,
    );
  }
}
