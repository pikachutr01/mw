/// GİRİŞ / KAYIT — web'deki `AuthModal`ın mobil karşılığı.
///
/// ⚠️ Dünya seçici ZORUNLU: sunucu `login` isteğinde `worldId` bekliyor (kullanıcı adı dünya
/// başına tekil, `auth.service.ts:257`). Web'de de öyle; atlanırsa 400 dönüyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/primitives.dart';

enum _Kip { giris, kayit }

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  _Kip _kip = _Kip.giris;
  final _kullanici = TextEditingController();
  final _parola = TextEditingController();
  final _eposta = TextEditingController();
  int? _worldId;
  bool _mesgul = false;
  String? _hata;

  @override
  void dispose() {
    _kullanici.dispose();
    _parola.dispose();
    _eposta.dispose();
    super.dispose();
  }

  Future<void> _gonder() async {
    final w = _worldId;
    if (w == null) {
      setState(() => _hata = 'Önce bir dünya seç.');
      return;
    }
    setState(() {
      _mesgul = true;
      _hata = null;
    });

    try {
      final auth = ref.read(kimlikDogrulamaProvider);
      if (_kip == _Kip.giris) {
        await auth.girisYap(
          kullaniciAdi: _kullanici.text.trim(),
          parola: _parola.text,
          worldId: w,
        );
      } else {
        await auth.kayitOl(
          eposta: _eposta.text.trim(),
          parola: _parola.text,
          kullaniciAdi: _kullanici.text.trim(),
          worldId: w,
        );
      }
      // Yönlendirme `router.dart`taki `redirect` tarafından yapılıyor — burada
      // `context.go` çağırmak iki yerde yönlendirme mantığı demekti.
    } on MwApiHatasi catch (e) {
      setState(() => _hata = e.mesaj);
    } catch (_) {
      setState(() => _hata = 'Sunucuya ulaşılamadı. Bağlantını kontrol et.');
    } finally {
      if (mounted) setState(() => _mesgul = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dunyalar = ref.watch(dunyalarProvider);
    final girisMi = _kip == _Kip.giris;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: MwPanel(
                baslik: girisMi ? 'Oyuna Gir' : 'Yeni Hesap',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!girisMi) ...[
                      TextField(
                        controller: _eposta,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'E-posta',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: _kullanici,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Kullanıcı adı',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _parola,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Parola',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    dunyalar.when(
                      loading: () => const LinearProgressIndicator(),
                      error: (e, _) =>
                          const MwHataKutusu('Dünya listesi alınamadı.'),
                      data: (liste) => DropdownButtonFormField<int>(
                        initialValue: _worldId ?? liste.firstOrNull?.id,
                        decoration: const InputDecoration(
                          labelText: 'Dünya',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          for (final d in liste)
                            DropdownMenuItem(value: d.id, child: Text(d.ad)),
                        ],
                        onChanged: (v) => setState(() => _worldId = v),
                      ),
                    ),
                    if (_hata != null) ...[
                      const SizedBox(height: 12),
                      MwHataKutusu(_hata!),
                    ],
                    const SizedBox(height: 16),
                    MwButon(
                      etiket: girisMi ? 'Giriş yap' : 'Hesap oluştur',
                      mesgul: _mesgul,
                      onTap: _gonder,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _mesgul
                          ? null
                          : () => setState(() {
                              _kip = girisMi ? _Kip.kayit : _Kip.giris;
                              _hata = null;
                            }),
                      child: Text(
                        girisMi
                            ? 'Hesabın yok mu? Kayıt ol'
                            : 'Zaten hesabın var mı? Giriş yap',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
