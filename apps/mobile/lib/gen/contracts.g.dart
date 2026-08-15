// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/contracts/src/dart/registry.ts
// Üreteç: packages/contracts/src/dart/emit.ts  ·  Kapı: pnpm contracts:check
//
// ⚠️ Eksik alanlar `null` bırakılır, ASLA varsayılana düşürülmez: "alan yok" ile
// "alan sıfır" farklı şeylerdir (MOBIL_MIMARI.md §3.4, madde 4).

class CitySummary {
  const CitySummary({
    required this.id,
    required this.name,
    required this.coordinates,
    required this.isCapital,
  });

  final int id;
  final String name;
  final CitySummaryCoordinates coordinates;
  final bool isCapital;

  factory CitySummary.fromJson(Map<String, dynamic> json) => CitySummary(
    id: (json['id'] as num).toInt(),
    name: json['name'] as String,
    coordinates: CitySummaryCoordinates.fromJson(
      json['coordinates'] as Map<String, dynamic>,
    ),
    isCapital: json['isCapital'] as bool,
  );
}

class CitySummaryCoordinates {
  const CitySummaryCoordinates({
    required this.k,
    required this.d,
    required this.s,
  });

  final int k;
  final int d;
  final int s;

  factory CitySummaryCoordinates.fromJson(Map<String, dynamic> json) =>
      CitySummaryCoordinates(
        k: (json['k'] as num).toInt(),
        d: (json['d'] as num).toInt(),
        s: (json['s'] as num).toInt(),
      );
}

class QueueItem {
  const QueueItem({
    required this.id,
    required this.category,
    required this.itemType,
    this.targetLevel,
    this.count,
    required this.startedAt,
    required this.finishAt,
  });

  final int id;
  final String category;
  final String itemType;
  final int? targetLevel;
  final int? count;
  final String startedAt;
  final String finishAt;

  factory QueueItem.fromJson(Map<String, dynamic> json) => QueueItem(
    id: (json['id'] as num).toInt(),
    category: json['category'] as String,
    itemType: json['itemType'] as String,
    targetLevel: (json['targetLevel'] as num?)?.toInt(),
    count: (json['count'] as num?)?.toInt(),
    startedAt: json['startedAt'] as String,
    finishAt: json['finishAt'] as String,
  );
}

class WorldSlot {
  const WorldSlot({required this.s, this.city});

  final int s;
  final WorldSlotCity? city;

  factory WorldSlot.fromJson(Map<String, dynamic> json) => WorldSlot(
    s: (json['s'] as num).toInt(),
    city: json['city'] == null
        ? null
        : WorldSlotCity.fromJson(json['city'] as Map<String, dynamic>),
  );
}

class WorldSlotCity {
  const WorldSlotCity({
    required this.id,
    required this.name,
    required this.playerId,
    required this.username,
    required this.score,
    required this.isCapital,
    required this.isOwn,
    this.protection,
  });

  final int id;
  final String name;
  final int playerId;
  final String username;
  final int score;
  final bool isCapital;
  final bool isOwn;
  final String? protection;

  factory WorldSlotCity.fromJson(Map<String, dynamic> json) => WorldSlotCity(
    id: (json['id'] as num).toInt(),
    name: json['name'] as String,
    playerId: (json['playerId'] as num).toInt(),
    username: json['username'] as String,
    score: (json['score'] as num).toInt(),
    isCapital: json['isCapital'] as bool,
    isOwn: json['isOwn'] as bool,
    protection: json['protection'] as String?,
  );
}
