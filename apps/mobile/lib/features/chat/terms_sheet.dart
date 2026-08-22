/// ⭐⭐ SOHBET KURALLARI SHEET'İ — gönderen tarafın onay penceresi.
///
/// Sunucu, kurallar onaylanmadan yazmayı reddediyor (`terms_required`, göç 0052). Ham hatayı
/// basmak yerine metni gösterip onay düğmesi sunuyoruz: oyuncunun yapması gereken şey bir
/// hata mesajı okumak değil, kuralları okuyup kabul etmek.
///
/// ⚠️ İki sohbet türü de aynı sheet'i kullanıyor; ayıran tek şey `channelId`. Özel mesajda
/// onay kanal başına, ittifakta oyun başına (`chat.terms.ts` · iki kapsam).
///
/// ⚠️ ALICI tarafı bu sheet'i KULLANMIYOR: orada kurallar mesaj isteği ekranının içinde
/// gösteriliyor (`chat_sheet.dart` · `_Istek`) ve tek bir kabul ikisini birden kapsıyor.
/// İki ayrı pencerede iki kez onay tıklatmak, ikincisini okutmamanın en kestirme yolu olurdu.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';

/// Kuralları gösterir; onaylanırsa `true` döner.
Future<bool> showChatTermsSheet(
  BuildContext context, {

  /// Özel mesajda kanal kimliği; ittifak sohbetinde `null`.
  int? channelId,
}) async {
  final sonuc = await mwTallSheet<bool>(
    context,
    title: 'Sohbet kuralları',
    child: _Terms(channelId: channelId),
  );
  return sonuc ?? false;
}

class _Terms extends ConsumerStatefulWidget {
  const _Terms({required this.channelId});

  final int? channelId;

  @override
  ConsumerState<_Terms> createState() => _TermsState();
}

class _TermsState extends ConsumerState<_Terms> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final kurallar = ref.watch(chatTermsProvider);

    return kurallar.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, _) => const MwErrorBox('Kurallar okunamadı.'),
      data: (k) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(k.intro, style: TextStyle(fontSize: 13, color: c.muted)),
          const SizedBox(height: 12),
          for (final madde in k.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('• $madde', style: const TextStyle(fontSize: 13)),
            ),
          const SizedBox(height: 12),
          MwButton(
            label: k.confirmLabel,
            busy: _busy,
            onTap: _busy ? null : _onayla,
          ),
          const SizedBox(height: 8),
          MwButton(
            label: 'Vazgeç',
            kind: MwButtonKind.ghost,
            onTap: () => Navigator.of(context).pop(false),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            MwErrorBox(_error!),
          ],
        ],
      ),
    );
  }

  Future<void> _onayla() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(chatProvider).acceptTerms(channelId: widget.channelId);
      await mwTapOk();
      if (mounted) Navigator.of(context).pop(true);
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      await mwTapError();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Sunucuya ulaşılamadı.';
        });
      }
    }
  }
}
