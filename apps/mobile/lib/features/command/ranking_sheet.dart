/// ⭐ SIRALAMA SATIRI KÜNYESİ — «Mesaj gönder» ve «Dünyada bul».
///
/// Kullanıcı kararı (2026-08-06): *"Sıralamada bir oyuncunun üzerine tıklanınca modal açılsın
/// ve Mesaj gönder ve Dünyada bul seçenekleri açılan bu modalın üzerinde gözüksün."*
/// Web'de modal, mobilde bottom sheet.
///
/// ⚠️⚠️ **KAHRAMAN DALINDA İKİ AD VAR ve ikisi de yazılmak zorunda:** satırın adı KAHRAMANIN
/// adı, mesaj ise **sahibine** gidiyor. Yalnız birini yazsaydık oyuncu kime yazdığını bilemezdi.
///
/// ⚠️ `row.id` kahraman dalında KAHRAMAN kimliği; mesaj `playerId` ile açılıyor. İkisini
/// karıştırmak rastgele bir oyuncuya sohbet açardı.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../chat/chat_rules.dart';
import '../chat/chat_sheet.dart';
import 'ranking_model.dart';

Future<void> showRankingSheet(
  BuildContext context,
  RankingRow row,
  String kind,
) => mwSheet<void>(
  context,
  // ⚠️ Oyuncunun/kahramanın adı — `mwSheet` başlığı `mwUpper` + Cinzel uyguluyor ve bu bir
  // KULLANICI metni. Bu yüzden başlık sabit bir sistem sözcüğü, ad gövdenin içinde yazılıyor.
  title: kind == 'hero' ? 'Kahraman' : 'Oyuncu',
  child: _Body(row: row, kind: kind),
);

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.row, required this.kind});

  final RankingRow row;
  final String kind;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  /// ⭐ BAŞKENT KOORDİNATI (kullanıcı, 2026-08-19): *"sıra puan gibi bilgilerinin yanında
  /// başkent koordinatı da yazsın. Sadece başkent"*.
  ///
  /// ⚠️ Yeni uç YOK: «Dünyada bul»un çağırdığı arama ucu (`kind=player&byId=`) yapısı gereği
  /// `is_capital` ile sınırlı, yani "sadece başkent" şartı zaten sunucuda yazılı.
  ///
  /// ⚠️⚠️ Koordinat **sıralama listesine EKLENMEDİ**. Öyle yapmak tek istekte bir sayfa dolusu
  /// başkent dağıtırdı; bu depo o farka duyarlı (kahramanın `xp` alanı, ekranda görünmediği
  /// hâlde ağ sekmesinden okunabildiği için sorgudan çıkarılmıştı). Künye açılınca **tek**
  /// oyuncu için istek gidiyor — «Dünyada bul»un bugünkü maliyetiyle aynı.
  SearchHit? _hit;

  @override
  void initState() {
    super.initState();
    unawaited(_loadCapital());
  }

  /// ⚠️ Hata **yutuluyor**: koordinat künyenin süsü, ana işlevi değil. Kırmızı bir kutu
  /// çizmek, «Mesaj gönder» için açılmış bir sheet'i bozuk gösterirdi. Düğme yine çalışıyor
  /// ve orada hata görünür hâle geliyor.
  Future<void> _loadCapital() async {
    final playerId = widget.row.playerId;
    if (playerId == null) return;
    try {
      final hit = await findInWorld(ref.read(apiProvider), playerId);
      if (mounted) setState(() => _hit = hit);
    } catch (_) {
      /* koordinat gösterilmez */
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.row;
    final c = MwColors.of(context);
    final kahraman = widget.kind == 'hero';

    /// Mesajın gideceği kişinin adı. ⚠️ Kahramanda satırın adı DEĞİL, sahibinin adı.
    final oyuncuAdi = kahraman ? (r.owner ?? r.name) : r.name;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          r.name,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 14,
          runSpacing: 4,
          children: [
            _Chip(label: 'Sıra', value: mwNumber(r.rank)),
            if (kahraman) ...[
              _Chip(label: 'Seviye', value: mwNumber(r.level ?? 0)),
              _Chip(label: 'Sahibi', value: r.owner ?? '-'),
            ] else ...[
              _Chip(label: 'Puan', value: mwNumber(r.score ?? 0)),
              if ((r.alliance ?? '').isNotEmpty)
                _Chip(label: 'İttifak', value: r.alliance!),
            ],
            /* ⚠️ Yalnız koordinat GELDİĞİNDE çiziliyor. «Başkent —» yazmak oyuncunun başkenti
               yokmuş gibi okunurdu; yükleniyor iskeleti çizmek de tek satır için gürültü. */
            if (_hit != null)
              _Chip(
                label: 'Başkent',
                value: '${_hit!.k}:${_hit!.d}:${_hit!.s}',
              ),
          ],
        ),

        if (_error != null) ...[
          const SizedBox(height: 12),
          MwErrorBox(_error!),
        ],

        const SizedBox(height: 16),

        /* ⚠️ Kendine mesaj gönderilemez. Düğmeyi GİZLEMEK yerine sebebi yazılıyor: düğmenin
           "kaybolması" hata gibi görünüyordu (web'de aynı karar). */
        if (r.isMine)
          Text('Bu sensin.', style: TextStyle(fontSize: 13, color: c.muted))
        else
          MwButton(
            label: 'Mesaj gönder',
            busy: _busy,
            onTap: () => _chat(oyuncuAdi),
          ),

        const SizedBox(height: 8),
        /* ⭐ «Dünyada Bul» orijinalde YALNIZ sıralama satırının menüsündeydi (`g.java:2040`,
           ekran 106) — arama sonucunda yoktu, çünkü arama koordinatı zaten getiriyor. Aynı
           yerde kaldı, yalnız kabuğu değişti. */
        MwButton(
          label: 'Dünyada bul',
          kind: MwButtonKind.ghost,
          busy: _busy,
          onTap: _findInWorld,
        ),
      ],
    );
  }

  Future<void> _chat(String username) async {
    final playerId = widget.row.playerId;
    if (playerId == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final channelId = await ref.read(chatProvider).open(playerId);
      if (!mounted) return;
      // ⚠️ ÖNCE künye kapanıyor: iki sheet üst üste yığıldığında geri tuşu oyuncuyu
      // beklemediği bir ekrana düşürüyor (hedef künyesindeki `_MessageButton` ile aynı karar).
      Navigator.of(context).pop();
      await showChatSheet(context, (
        channelId: channelId,
        playerId: playerId,
        username: username,
        // ⚠️ Engel bilgisi burada YOK (sohbet listesinden gelir ve bu kanal listede
        // olmayabilir). `false` güvenli taraf: kutu açık kalır, engel varsa sunucu reddeder
        // ve metni `chatErrorText` yazar.
        blocked: false,
      ));
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = chatErrorText(e.code));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _findInWorld() async {
    final playerId = widget.row.playerId;
    if (playerId == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // ⭐ Künye için çekilmiş sonuç varsa ikinci istek atılmıyor.
      final hit = _hit ?? await findInWorld(ref.read(apiProvider), playerId);
      if (!mounted) return;
      if (hit == null) {
        // ⚠️ Sessiz geçilmiyor: oyuncu düğmeye bastı ve hiçbir şey olmaması "bozuk" demek.
        setState(() => _error = 'Bu oyuncunun başkenti bulunamadı.');
        return;
      }
      // ⚠️ ÖNCE kapat, SONRA git — oyuncu nereye düştüğünü görsün (rapor güzergâhındaki
      // `MwRouteLine` ile aynı kural).
      Navigator.of(context).pop();
      // ⭐ `?s=` — hedef slot Dünya listesinde kısa bir an parlıyor (2026-08-19).
      context.go('/world/${hit.k}/${hit.d}?s=${hit.s}');
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('$label ', style: TextStyle(fontSize: 12, color: c.muted)),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
