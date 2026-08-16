/// TEK CİHAZ ÇAKIŞMASI PERDESİ — web'deki `SessionConflictGate` karşılığı.
///
/// Oyun bir hesabın aynı anda tek yerde açık olmasını zorluyor (`session.singleDevice`,
/// varsayılan AÇIK). Çakışma iki kanaldan gelebiliyor: HTTP **409** `session_conflict` ve
/// WS `session:takeover`.
///
/// ⚠️⚠️ **Oturum DÜŞMEZ.** Jeton geçerli; kaybedilen şey yalnız SAHİPLİK. Bu yüzden perde
/// kapanamaz bir bindirme, giriş ekranına atma değil — oyuncu "bu cihazda devam et" deyince
/// kaldığı yerden sürüyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/primitives.dart';

class SessionConflictGate extends ConsumerWidget {
  const SessionConflictGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conflict = ref.watch(conflictProvider);
    if (conflict == null) return child;

    return Stack(
      children: [
        child,
        // ⚠️ `AbsorbPointer` + tam ekran: altındaki ekran GÖRÜNÜR ama tıklanamaz. Oyuncu
        // nerede kaldığını görsün, ama yanlışlıkla istek göndermesin.
        const Positioned.fill(
          child: AbsorbPointer(child: ColoredBox(color: Color(0xAA000000))),
        ),
        Positioned.fill(child: _Overlay(conflict: conflict)),
      ],
    );
  }
}

class _Overlay extends ConsumerStatefulWidget {
  const _Overlay({required this.conflict});

  final SessionConflict conflict;

  @override
  ConsumerState<_Overlay> createState() => _OverlayState();
}

class _OverlayState extends ConsumerState<_Overlay> {
  bool _busy = false;
  String? _error;

  Future<void> _claim() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // ⚠️ `/auth/**` tek cihaz kuralından MUAF (`auth.guard.ts` PRESENCE_EXEMPT), yani bu
      // çağrının kendisi 409 almıyor — devralma düğmesi başka türlü çalışamazdı.
      await ref
          .read(apiProvider)
          .request('POST', '/api/v1/auth/session/claim', body: {'force': true});
      ref.read(conflictProvider.notifier).update(null);

      // ⭐⭐ **SOKETİ YENİDEN KUR** (kullanıcı, 2026-08-16 — cihazda gözle görüldü:
      // *"devralmaya rağmen sunucuya bağlanamamış görünüyor, sağ üstteki nokta kırmızı"*).
      //
      // ⚠️ Devralma HTTP ile oluyor (`/auth/**` kuraldan muaf) ama soket bu noktada ÖLÜ ve
      // kendi kendine dirilmiyor: el sıkışma `session_conflict` ile reddedilince
      // `realtime.dart` o soketin `reconnection` seçeneğini **kapatıyor** — bilerek, yoksa
      // istemci sonsuz yeniden bağlanma döngüsüne girerdi. Kapatılan seçenek yalnız o soket
      // örneğine ait; `connect()` yeni bir örnek kuruyor ve bayrak da sıfırlanıyor.
      //
      // ⚠️ İki şeyi birden düzeltiyor ve ikincisi görünmezdi:
      //   1. gerçek zamanlı akış geri geliyor (kırmızı nokta yeşile dönüyor),
      //   2. **sahiplik yerinde kalıyor.** `seen_at` damgasını asıl olarak soket taze tutuyor;
      //      soketsiz cihaz yalnız istek attıkça damga yeniliyordu ve hiç istek atmayan bir
      //      ekranda 90 saniye sonra sahiplik düşüyor, karşı taraftaki kopya onu geri
      //      kapıyordu. Ölçüldü: devralınan tarayıcı sekmesi ~90 sn sonra oyunu geri aldı.
      //
      // ⚠️ Ayrıca veri tazeliyor: `connect()` → `onConnect` → `onTopic('*')`. Ayrı bir
      // tazeleme çağrısına gerek yok; web'in `window.location.reload()` ile yaptığı işin
      // mobildeki karşılığı bu.
      ref.read(realtimeProvider).connect();
    } on MwApiError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final where = widget.conflict.platform;
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: MwPanel(
              title: 'Hesabın başka bir yerde açık',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    where == null
                        ? 'Bu hesap şu anda başka bir kopyada açık görünüyor.'
                        : 'Bu hesap şu anda ${_platformName(where)} üzerinde açık görünüyor.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Oyunu bu cihazda sürdürürsen diğer kopya kapanır.',
                    style: TextStyle(color: MwColors.of(context).muted),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    MwErrorBox(_error!),
                  ],
                  const SizedBox(height: 16),
                  MwButton(
                    label: 'Bu cihazda devam et',
                    busy: _busy,
                    onTap: _claim,
                  ),
                  const SizedBox(height: 8),
                  MwButton(
                    label: 'Çıkış yap',
                    kind: MwButtonKind.ghost,
                    onTap: _busy ? null : () => ref.read(authProvider).logout(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _platformName(String p) => switch (p) {
  'web' => 'tarayıcı',
  'android' => 'başka bir Android cihaz',
  'ios' => 'bir iPhone/iPad',
  _ => p,
};
