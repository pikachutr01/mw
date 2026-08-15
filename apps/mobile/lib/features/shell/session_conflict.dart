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

class OturumCakismaPerdesi extends ConsumerWidget {
  const OturumCakismaPerdesi({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cakisma = ref.watch(cakismaProvider);
    if (cakisma == null) return child;

    return Stack(
      children: [
        child,
        // ⚠️ `AbsorbPointer` + tam ekran: altındaki ekran GÖRÜNÜR ama tıklanamaz. Oyuncu
        // nerede kaldığını görsün, ama yanlışlıkla istek göndermesin.
        const Positioned.fill(
          child: AbsorbPointer(child: ColoredBox(color: Color(0xAA000000))),
        ),
        Positioned.fill(child: _Perde(cakisma: cakisma)),
      ],
    );
  }
}

class _Perde extends ConsumerStatefulWidget {
  const _Perde({required this.cakisma});

  final OturumCakismasi cakisma;

  @override
  ConsumerState<_Perde> createState() => _PerdeState();
}

class _PerdeState extends ConsumerState<_Perde> {
  bool _mesgul = false;
  String? _hata;

  Future<void> _devral() async {
    setState(() {
      _mesgul = true;
      _hata = null;
    });
    try {
      // ⚠️ `/auth/**` tek cihaz kuralından MUAF (`auth.guard.ts` PRESENCE_EXEMPT), yani bu
      // çağrının kendisi 409 almıyor — devralma düğmesi başka türlü çalışamazdı.
      await ref
          .read(apiProvider)
          .istek('POST', '/api/v1/auth/session/claim', govde: {'force': true});
      ref.read(cakismaProvider.notifier).ayarla(null);
    } on MwApiHatasi catch (e) {
      setState(() => _hata = e.mesaj);
    } catch (_) {
      setState(() => _hata = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _mesgul = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nerede = widget.cakisma.platform;
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: MwPanel(
              baslik: 'Hesabın başka bir yerde açık',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    nerede == null
                        ? 'Bu hesap şu anda başka bir kopyada açık görünüyor.'
                        : 'Bu hesap şu anda ${_platformAdi(nerede)} üzerinde açık görünüyor.',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Oyunu bu cihazda sürdürürsen diğer kopya kapanır.',
                    style: TextStyle(color: MwRenk.of(context).muted),
                  ),
                  if (_hata != null) ...[
                    const SizedBox(height: 12),
                    MwHataKutusu(_hata!),
                  ],
                  const SizedBox(height: 16),
                  MwButon(
                    etiket: 'Bu cihazda devam et',
                    mesgul: _mesgul,
                    onTap: _devral,
                  ),
                  const SizedBox(height: 8),
                  MwButon(
                    etiket: 'Çıkış yap',
                    tur: MwButonTuru.hayalet,
                    onTap: _mesgul
                        ? null
                        : () => ref.read(kimlikDogrulamaProvider).cikisYap(),
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

String _platformAdi(String p) => switch (p) {
  'web' => 'tarayıcı',
  'android' => 'başka bir Android cihaz',
  'ios' => 'bir iPhone/iPad',
  _ => p,
};
