/// ⭐ SIRALAMALAR — Oyuncu · İttifak · Kahraman.
///
/// Üç dal orijinalden (`g.java` case 101: *Oyuncuya Göre · İttifağa Göre · Kahramana Göre*).
///
/// ⚠️⚠️ **SIRA CANLI DEĞİL** (§13.17.2) ve panel başlığı bunu yazıyor. Yazmasaydı oyuncu
/// puanını artırıp sırasının değişmemesini hata sanardı — web'de canlıda bildirildi.
///
/// ─ ⭐ SATIR TIKLANABİLİR, AKSİYON SÜTUNU YOK ─────────────────────────────────────────────
/// Web'de bir ara satırın sağında iki simge vardı (mesaj · dünyada bul); dar ekranda tablonun
/// beşte birini yiyor ve dokunmatikte ipucu balonu açık kalıyordu. Kullanıcı kararıyla
/// (2026-08-06) aksiyonlar satıra dokununca açılan künyeye taşındı — mobilde de öyle.
///
/// ⭐ **İTTİFAK DALI DA ARTIK AÇILIYOR** (2026-08-19): satır bir ittifağı gösterdiği için
/// `playerId` yok, ama açacak bir şey VAR — herkese açık ittifak künyesi (metin · lider · üye
/// · başvuru). Web'de de aynı gün aynı sebeple açılmıştı.
/// ⚠️ Kahraman dalında satır oyuncu künyesini açıyor çünkü `playerId` geliyor (kahramanın
/// SAHİBİ) — mesaj ona gidiyor, kahramana değil.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import '../alliance/alliance_screen.dart';
import 'command_rules.dart';
import 'command_screen.dart';
import 'ranking_model.dart';
import 'ranking_sheet.dart';

class RankingPanel extends ConsumerStatefulWidget {
  const RankingPanel({super.key});

  @override
  ConsumerState<RankingPanel> createState() => _RankingPanelState();
}

class _RankingPanelState extends ConsumerState<RankingPanel> {
  String _kind = 'player';

  /// ⚠️ Sayfa **1 tabanlı** — sunucu da öyle. Posta kutusu 0 tabanlı; ikisi ayrı sözleşme ve
  /// karıştırmak sessizce bir sayfa kaydırırdı.
  int _page = 1;

  void _pick(String k) => setState(() {
    _kind = k;
    _page = 1;
  });

  @override
  Widget build(BuildContext context) {
    final sorgu = (kind: _kind, page: _page);
    final sonuc = ref.watch(rankingsProvider(sorgu));
    final d = sonuc.value;

    /* ⚠️ Sayfa aralık DIŞINA düşebiliyor (sıralama küçüldü, dal değişti). Gösterilen sayfa ile
       İSTENEN sayfa daima aynı olmalı — kelepçe `clampRankingPage`te ve testli. */
    final sayfaSayisi = d?.pages ?? 1;
    final gecerli = clampRankingPage(_page, sayfaSayisi);
    if (gecerli != _page && d != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _page = gecerli);
      });
    }

    return Column(
      children: [
        MwTabs(
          value: _kind,
          items: const [
            (id: 'player', label: 'Oyuncu'),
            (id: 'alliance', label: 'İttifak'),
            (id: 'hero', label: 'Kahraman'),
          ],
          onChange: _pick,
        ),
        const SizedBox(height: 10),
        MwPanel(
          title: 'Sıralama',
          trailing: d == null
              ? null
              : MwSnapshotNote(takenAt: d.takenAt, nextAt: d.nextAt),
          child: sonuc.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => MwErrorBox('Sıralama alınamadı: $e'),
            data: (p) => _Body(
              page: p,
              kind: _kind,
              onPage: (n) => setState(() => _page = n),
            ),
          ),
        ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.page, required this.kind, required this.onPage});

  final RankingPage page;
  final String kind;
  final void Function(int) onPage;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    /* ⚠️ Sunucunun kendi sebebi yazılıyor, uydurma bir cümle değil: hangi dalın neden kapalı
       olduğu (ör. ittifaklar henüz açılmadı) sunucunun bilgisi. */
    final kapali = page.unavailable;
    if (kapali != null && kapali.isNotEmpty) return MwEmpty(kapali);

    return Column(
      children: [
        /* ⭐ Sayfalayıcı ÜSTTE ve «Sayfa: 1 / 159» biçiminde — orijinaldeki yeri ve dili.
           ⚠️ Posta kutusundakinin aksine tek sayfada da çiziliyor: burada yanında «Beni
           göster» yaşıyor ve o düğme tek sayfalık bir sıralamada da anlamlı. */
        _Pager(page: page, onPage: onPage),
        Divider(height: 1, color: c.border),

        if (page.rows.isEmpty)
          const MwEmpty('Bu sıralamada henüz kayıt yok.')
        else
          for (var i = 0; i < page.rows.length; i++) ...[
            if (i > 0) Divider(height: 1, color: c.border),
            _Row(row: page.rows[i], kind: kind),
          ],
      ],
    );
  }
}

class _Pager extends StatelessWidget {
  const _Pager({required this.page, required this.onPage});

  final RankingPage page;
  final void Function(int) onPage;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          onPressed: page.page <= 1 ? null : () => onPage(page.page - 1),
          icon: const Icon(Icons.chevron_left),
          visualDensity: VisualDensity.compact,
        ),
        Text(
          'Sayfa: ${page.page} / ${page.pages}',
          style: TextStyle(
            fontSize: 12,
            color: c.muted,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        IconButton(
          onPressed: page.page >= page.pages
              ? null
              : () => onPage(page.page + 1),
          icon: const Icon(Icons.chevron_right),
          visualDensity: VisualDensity.compact,
        ),
        /* ⭐ «Beni göster» — sıralamaya hiç girmemiş oyuncuda `myPage` null ve düğme HİÇ
           çizilmiyor. 1. sayfaya atan bir düğme, oyuncuya orada olduğunu düşündürürdü. */
        if (page.myPage != null) ...[
          const SizedBox(width: 4),
          MwSmallButton(
            label: 'Beni göster (${mwNumber(page.myRank ?? 0)})',
            kind: MwButtonKind.ghost,
            onTap: () => onPage(page.myPage!),
          ),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row, required this.kind});

  final RankingRow row;
  final String kind;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final kahraman = kind == 'hero';

    /* ⭐ İki dal, iki farklı künye: oyuncu/kahraman satırı OYUNCU künyesini (mesaj + dünyada
       bul), ittifak satırı **ittifak künyesini** açıyor. ⚠️ İttifak dalında `playerId` yok ve
       olmamalı — satır bir ittifağı gösteriyor, bir oyuncuyu değil. */
    final ittifak = kind == 'alliance';
    final acilir = ittifak || row.playerId != null;

    return InkWell(
      onTap: !acilir
          ? null
          : ittifak
          // ⚠️ `row.id` ittifak dalında İTTİFAK kimliği (kahraman dalında kahraman kimliği).
          ? () => showAllianceProfileSheet(context, row.id)
          : () => showRankingSheet(context, row, kind),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Row(
          children: [
            SizedBox(
              width: 38,
              child: Text(
                mwNumber(row.rank),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  // ⭐ Kendi satırım vurgulu: uzun bir listede kendini bulmanın en hızlı yolu.
                  color: row.isMine ? scheme.primary : null,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    // ⚠️ Oyuncunun/kahramanın adı — gövde fontu, büyütme yok.
                    row.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      color: row.isMine ? scheme.primary : null,
                    ),
                  ),
                  /* İkinci satır dala göre: kahramanda SAHİBİ, oyuncuda ittifağı, ittifakta
                     üye sayısı. ⚠️ Kahramanın sahibi olmadan mesaj kime gidiyor belli olmaz. */
                  if (kahraman && (row.owner ?? '').isNotEmpty)
                    Text(
                      row.owner!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.muted),
                    )
                  else if (kind == 'alliance')
                    Text(
                      '${mwNumber(row.memberCount ?? 0)} üye',
                      style: TextStyle(fontSize: 11, color: c.muted),
                    )
                  else if ((row.alliance ?? '').isNotEmpty)
                    Text(
                      row.alliance!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  kahraman
                      ? 'sv ${mwNumber(row.level ?? 0)}'
                      : mwNumber(row.score ?? 0),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                if (kahraman)
                  Text(
                    '${mwNumber(row.xp ?? 0)} tecrübe',
                    style: TextStyle(
                      fontSize: 10,
                      color: c.muted,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  )
                else
                  MwChangeText(row.change, fontSize: 11),
              ],
            ),
            // ⚠️ Pasif satırda ok YOK: dokunulabilir olmayan bir satıra ok koymak yalan olurdu.
            if (acilir)
              Icon(Icons.chevron_right, size: 18, color: c.muted)
            else
              const SizedBox(width: 18),
          ],
        ),
      ),
    );
  }
}
