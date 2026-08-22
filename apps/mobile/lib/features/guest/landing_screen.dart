/// ANA SAYFA — siteye ilk gelen ziyaretçiyi karşılar. Web'deki `Landing.tsx` karşılığı.
///
/// ⚠️ Metinler web'dekiyle **birebir aynı** ve orada *taslak* olarak işaretli (kullanıcı:
/// *"ben taslak yazayım, sen düzeltirsin"*). Mobilde farklı bir tanıtım yazmak, aynı oyunu iki
/// ayrı oyun gibi anlatmak olurdu; düzeltme geldiğinde **iki dosya birden** güncellenecek.
///
/// ⚠️ Web'de giriş bir **modal** (`AuthModal`), burada ayrı bir ekran (`/auth`). Sebep platform:
/// telefonda tam ekran form klavyeyle birlikte daha az yer sorunu çıkarıyor ve geri tuşu
/// doğal olarak çalışıyor. Rota tablosundaki tek bilinçli ayrışma bu.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routing_rules.dart';
import '../../ui/primitives.dart';

/// Öne çıkan dört başlık — web `Landing.tsx` · `FEATURES` ile aynı dörtlü ve **aynı ikonlar**.
const _features = <({String folder, String id, String title, String text})>[
  (
    folder: 'menu',
    id: 'ordular',
    title: 'Ordular yolda',
    text:
        'Gönderdiğin her ordu haritada gerçek zaman harcar. Saldırı da savunma da '
        'saat tutar; zamanlama en az asker sayısı kadar önemlidir.',
  ),
  (
    folder: 'buildings',
    id: 'castle',
    title: 'Şehrini büyüt',
    text:
        'Çiftlik, maden, baraka, akademi… Her yapı bir sonrakinin kapısını açar. '
        'Kale bütçen neyi aynı anda barındırabileceğini belirler.',
  ),
  (
    folder: 'menu',
    id: 'komutamerkezi',
    title: 'İttifak kur',
    text:
        'Tek başına ayakta kalmak zor. İttifak sohbeti, ortak savunma ve sıralamalar '
        'komuta merkezinde.',
  ),
  (
    folder: 'buildings',
    id: 'temple',
    title: 'Kahramanlar',
    text:
        'Tapınağın büyüdükçe savaşta kahraman çıkma ihtimalin artar. Kahramanlar '
        'seviye atlar, yetenek dağıtır ve ölseler bile geri döner.',
  ),
];

class LandingScreen extends ConsumerWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        MwPanel(
          title: 'MobilWar',
          child: Column(
            children: [
              // ⚠️ `MwIcon` errorBuilder'ı sayesinde logo dosyası olmasa da ekran çökmez,
              // yerine aynı ölçüde boşluk kalır (`ui/primitives.dart` gerekçesi).
              const MwIcon(folder: 'ui', id: 'logo', size: 96),
              const SizedBox(height: 12),
              Text(
                'Bir başkent kur, ordularını yönet, dünyayı paylaş.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              MwButton(label: 'Oyuna gir', onTap: () => context.go(kAuthPath)),
              /* ⛔⛔ «Savaş simülatörünü dene» düğmesi KALDIRILDI (kullanıcı, 2026-08-22:
                 *"Uygulamada simülatöre oturumsuz ulaşılamasın"*).

                 ⚠️ Düğme zaten ÇALIŞMIYORDU: `/simulate` rotası hiç tanımlı değildi ve
                 dokunan ziyaretçi «Bilinmeyen sayfa» hatasına düşüyordu. Yani burada iki
                 şey birden kapandı — kırık bağlantı ve artık istenmeyen bir kapı.

                 ⚠️ Web'de simülatör misafire AÇIK kalmaya devam ediyor (uç oturumsuz);
                 ayrışan şey yalnız uygulamanın kapısı. */
            ],
          ),
        ),
        const SizedBox(height: 12),
        for (final f in _features) ...[
          MwPanel(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MwIcon(folder: f.folder, id: f.id, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        f.title,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(f.text, style: TextStyle(color: c.muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        Center(
          child: TextButton(
            onPressed: () => context.go('/destek'),
            // ⭐ Destek misafire de açık (kullanıcı şartı): en çok ihtiyaç duyan kişi zaten
            // giriş YAPAMAYAN kişidir.
            child: const Text('Yardıma mı ihtiyacın var? Destek'),
          ),
        ),
      ],
    );
  }
}
