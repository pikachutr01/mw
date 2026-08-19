/// ⭐ ARAMA — oyuncu adına göre.
///
/// Orijinalde Komuta Merkezi'nin altında ayrı bir ekran (`g.java` ekran 107).
///
/// ⚠️⚠️ **YALNIZ BAŞKENT dönüyor** (§13.16.5) ve bu bir gizlilik kuralı, bir eksiklik değil:
/// oyuncunun tüm şehirlerini adından bulabilmek koloni saklamayı imkânsız kılardı. Ekran
/// bunu yazmıyor çünkü sonuç satırı zaten tek ve «başkent» olduğu koordinatın yanında
/// görünüyor — kural anlatan metin Yardım'a ait (kullanıcı kararı, 2026-07-28).
///
/// ⚠️ **Önek araması** (`lower(username) LIKE 'abc%'`): sunucu `text_pattern_ops` indeksini
/// kullanıyor, ortadan eşleşme (infix) `pg_trgm` isterdi. Yani «ral» yazmak «Baturalp»ı
/// bulmuyor ve bu bilinçli bir sınır.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import 'command_rules.dart';
import 'ranking_model.dart';

class SearchPanel extends ConsumerStatefulWidget {
  const SearchPanel({super.key});

  @override
  ConsumerState<SearchPanel> createState() => _SearchPanelState();
}

class _SearchPanelState extends ConsumerState<SearchPanel> {
  final _controller = TextEditingController();

  /// Gönderilen sorgu — kutunun İÇERİĞİNDEN ayrı.
  ///
  /// ⚠️⚠️ Ayrım ŞART: sağlayıcıyı doğrudan kutunun metnine bağlasaydık **her tuş vuruşu bir
  /// istek** olurdu. Arama düğmeye (ya da klavyenin «ara» tuşuna) basınca gidiyor; gecikmeli
  /// tetikleme (debounce) de denenebilirdi ama önek araması zaten kısa ve oyuncu ne aradığını
  /// yazıp bitiriyor.
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final q = _controller.text.trim();
    if (!canSearch(q)) return;
    setState(() => _query = q);
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final yazilan = _controller.text;

    return MwPanel(
      title: 'Arama',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _submit(),
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Oyuncu adı',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              MwSmallButton(
                label: 'Ara',
                onTap: canSearch(yazilan) ? _submit : null,
              ),
            ],
          ),

          /* ⚠️ Kısa sorguda sebep AÇIKÇA yazılıyor: sunucu iki karakterden kısa sorguda boş
             liste dönüyor ve sebebini söylemeseydik oyuncu aramanın bozuk olduğunu sanırdı. */
          if (yazilan.isNotEmpty && !canSearch(yazilan))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'En az iki harf yaz.',
                style: TextStyle(fontSize: 12, color: c.muted),
              ),
            ),

          const SizedBox(height: 4),
          if (_query.isNotEmpty) _Results(query: _query),
        ],
      ),
    );
  }
}

class _Results extends ConsumerWidget {
  const _Results({required this.query});

  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    return ref
        .watch(searchProvider(query))
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => MwErrorBox('Arama yapılamadı: $e'),
          data: (hits) {
            if (hits.isEmpty) {
              // ⚠️ «Önek» sınırı burada hatırlatılıyor: oyuncu adın ORTASINI yazmış olabilir
              // ve sonuçsuz kalmasının sebebi bu.
              return const MwEmpty('Sonuç yok. Adın BAŞINI yazmayı dene.');
            }
            return Column(
              children: [
                for (var i = 0; i < hits.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: c.border),
                  _Hit(hit: hits[i]),
                ],
              ],
            );
          },
        );
  }
}

class _Hit extends StatelessWidget {
  const _Hit({required this.hit});

  final SearchHit hit;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;

    return InkWell(
      // ⚠️ Diyara gidiliyor, şehir yerine değil: Dünya ekranı bir DİYAR listesi (§13.16).
      // ⭐ `?s=` — arama sonucundaki slot Dünya listesinde kısa bir an parlıyor.
      onTap: () => context.go('/world/${hit.k}/${hit.d}?s=${hit.s}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
        child: Row(
          children: [
            const MwIcon(folder: 'buildings', id: 'city', size: 30),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hit.username,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: hit.isOwn ? scheme.primary : null,
                    ),
                  ),
                  Row(
                    children: [
                      Text(
                        '${hit.k}:${hit.d}:${hit.s}',
                        style: TextStyle(
                          fontSize: 11,
                          color: c.muted,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      if ((hit.alliance ?? '').isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            hit.alliance!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: c.muted),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            if (hit.rank != null)
              Text(
                '${mwNumber(hit.rank!)}.',
                style: TextStyle(
                  fontSize: 12,
                  color: c.muted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            Icon(Icons.chevron_right, size: 18, color: c.muted),
          ],
        ),
      ),
    );
  }
}
