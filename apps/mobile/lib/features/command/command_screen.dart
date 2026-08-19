/// ⭐⭐ KOMUTA MERKEZİ — Genel Durum · Sıralamalar · Arama.
///
/// Orijinal J2ME istemcisinde Komuta Merkezi bir **hub** (`g.java` case 10):
/// *Mesajlar · Genel Durum · İttifak · Arama · Sıralamalar*. Mesajlar bizde ayrı bir sekme
/// (okunmamış rozeti sürekli görünsün diye); kalan dördü burada ve **orijinaldeki sırayla**.
/// Sıralamanın üç dalı da aynı dosyadan (`g.java` case 101).
///
/// ⚠️ «Genel Durum» sekmesinin etiketi **«Durum»**: dört sekme dar telefonda yan yana
/// sığmıyordu ve kısaltılacak tek etiket oydu (diğer üçü zaten tek kelime). Panel başlığı
/// «Hükümdarlık» olarak kalıyor — orijinalde de sayfa adı ile panel adı farklı.
///
/// ⚠️ Ekrana **kural anlatan bilgi metni konulmaz** (kullanıcı kararı, 2026-07-28): puanın
/// nasıl hesaplandığı gibi açıklamalar Yardım sayfasında toplanacak.
///
/// ─ ⚠️⚠️ SEKME = DURUM, ROTA DEĞİL ────────────────────────────────────────────────────────
/// Web'de sekmeler ayrı rota (`/command/rankings`), çünkü orada geri tuşu tarayıcının kendi
/// tuşu ve derin bağlantı bekleniyor. Mobilde sekmeler **ekranın kendi durumu**: alt bardaki
/// «Komuta» sekmesi tek bir hedef ve her alt sekmeyi ayrı rota yapmak, geri tuşuna basan
/// oyuncuyu Sıralamalar'dan Genel Durum'a düşürürdü — oysa beklediği şey ekrandan çıkmak.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/primitives.dart';
import '../alliance/alliance_screen.dart';
import 'command_rules.dart';
import 'overview_panel.dart';
import 'ranking_panel.dart';
import 'search_panel.dart';

class CommandScreen extends ConsumerStatefulWidget {
  const CommandScreen({super.key});

  @override
  ConsumerState<CommandScreen> createState() => _CommandScreenState();
}

class _CommandScreenState extends ConsumerState<CommandScreen> {
  /// `overview` · `rankings` · `search`.
  String _tab = 'overview';

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        MwTabs(
          value: _tab,
          items: const [
            (id: 'overview', label: 'Durum'),
            (id: 'alliance', label: 'İttifak'),
            (id: 'rankings', label: 'Sıralama'),
            (id: 'search', label: 'Arama'),
          ],
          onChange: (v) => setState(() => _tab = v),
        ),
        const SizedBox(height: 10),
        switch (_tab) {
          // ⭐ 2026-08-19: İttifak ekranı gelince web'deki dörtlü sekme tamamlandı.
          'alliance' => const AllianceScreen(),
          'rankings' => const RankingPanel(),
          'search' => const SearchPanel(),
          _ => const OverviewPanel(),
        },
      ],
    );
  }
}

/// Sekme şeridi — Komuta Merkezi ve Sıralama dalları aynı bileşeni kullanıyor.
///
/// ⚠️ `TabBar` KULLANILMADI: o bir `TabController` ve `DefaultTabController` istiyor, sekme
/// içerikleri de `TabBarView` altında **hepsi birden** kurulan sayfalar oluyor. Burada her
/// sekme kendi ağını çekiyor; hepsini birden kurmak, oyuncu hiç bakmadan üç istek atmak
/// olurdu. Bu şerit yalnız seçili olanı çiziyor.
class MwTabs extends StatelessWidget {
  const MwTabs({
    super.key,
    required this.value,
    required this.items,
    required this.onChange,
  });

  final String value;
  final List<({String id, String label})> items;
  final void Function(String) onChange;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final t in items) ...[
          if (t != items.first) const SizedBox(width: 6),
          Expanded(
            child: _TabButton(
              label: t.label,
              active: t.id == value,
              onTap: () => onChange(t.id),
            ),
          ),
        ],
      ],
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? scheme.primary : scheme.surface,
          border: Border.all(
            color: active ? c.borderStrong : c.border,
            width: 2,
          ),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.w700 : FontWeight.normal,
            color: active ? scheme.onPrimary : c.muted,
          ),
        ),
      ),
    );
  }
}

/// ⭐ ANLIK GÖRÜNTÜ NOTU — panel başlığının sağında.
///
/// ⚠️⚠️ Bu not olmadan oyuncu puanını artırıp sırasının değişmemesini **hata sanıyor**
/// (§13.17.2). Web'de ipucu balonu içinde; mobilde tooltip yok, bu yüzden metnin kendisi
/// yeterince açık olmak zorunda ve o yüzden «güncelleme HH:mm» diye yazıyor.
class MwSnapshotNote extends StatelessWidget {
  const MwSnapshotNote({
    super.key,
    required this.takenAt,
    required this.nextAt,
  });

  final String? takenAt;
  final String nextAt;

  @override
  Widget build(BuildContext context) => Text(
    snapshotNote(takenAt: takenAt, nextAt: nextAt),
    style: TextStyle(fontSize: 11, color: MwColors.of(context).onPanelHeader),
  );
}

/// Sıra değişimi metni — rengi tona göre.
class MwChangeText extends StatelessWidget {
  const MwChangeText(this.change, {super.key, this.fontSize = 13});

  final int? change;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final renk = switch (changeTone(change)) {
      MwChangeTone.up => c.success,
      MwChangeTone.down => c.danger,
      MwChangeTone.neutral => c.muted,
    };
    return Text(
      changeMark(change),
      style: TextStyle(
        fontSize: fontSize,
        color: renk,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}
