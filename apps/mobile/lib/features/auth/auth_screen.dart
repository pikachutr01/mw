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

/// ⚠️⚠️ Gönderilen dünya, EKRANDA GÖRÜNENLE **aynı ifadeden** gelmek zorunda.
///
/// İlk yazımda dropdown listenin ilkini GÖSTERİYOR ama seçim durumu yalnız kullanıcı ona
/// dokununca yazılıyordu. Sonuç: form "Dunya 1" gösteriyor, «Giriş yap»a basınca
/// *"Önce bir dünya seç"* diyordu — **gösterdiği değeri göndermeyen bir form**. Gerçek cihazda
/// yakalandı (2026-08-15).
///
/// ⭐ Saf fonksiyon olması bilinçli: deponun deseni, kararı bileşenden çıkarıp test edilebilir
/// kılmak (`apps/web/src/lib/*` ile aynı gerekçe). Hem gösterim hem gönderim BUNU çağırıyor,
/// yani ikisinin ayrışması yapısal olarak imkânsız.
int? selectedWorld(int? chosen, List<({int id, String name})> list) =>
    chosen ?? list.firstOrNull?.id;

enum _Mode { login, register }

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  _Mode _mode = _Mode.login;
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _email = TextEditingController();
  int? _worldId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit(List<({int id, String name})> list) async {
    final w = selectedWorld(_worldId, list);
    if (w == null) {
      setState(() => _error = 'Dünya listesi yüklenemedi, tekrar dene.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final auth = ref.read(authProvider);
      if (_mode == _Mode.login) {
        await auth.login(
          username: _username.text.trim(),
          password: _password.text,
          worldId: w,
        );
      } else {
        await auth.register(
          email: _email.text.trim(),
          password: _password.text,
          username: _username.text.trim(),
          worldId: w,
        );
      }
      // Yönlendirme `router.dart`taki `redirect` tarafından yapılıyor — burada
      // `context.go` çağırmak iki yerde yönlendirme mantığı demekti.
    } on MwApiError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Sunucuya ulaşılamadı. Bağlantını kontrol et.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final boot = ref.watch(bootProvider);
    final isLogin = _mode == _Mode.login;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: MwPanel(
                title: isLogin ? 'Oyuna Gir' : 'Yeni Hesap',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!isLogin) ...[
                      TextField(
                        controller: _email,
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
                      controller: _username,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Kullanıcı adı',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Parola',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    boot.when(
                      loading: () => const LinearProgressIndicator(),
                      error: (e, _) =>
                          const MwErrorBox('Dünya listesi alınamadı.'),
                      data: (b) => DropdownButtonFormField<int>(
                        initialValue: selectedWorld(_worldId, b.worlds),
                        decoration: const InputDecoration(
                          labelText: 'Dünya',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          for (final w in b.worlds)
                            DropdownMenuItem(value: w.id, child: Text(w.name)),
                        ],
                        onChanged: (v) => setState(() => _worldId = v),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      MwErrorBox(_error!),
                    ],
                    const SizedBox(height: 16),
                    MwButton(
                      label: isLogin ? 'Giriş yap' : 'Hesap oluştur',
                      busy: _busy,
                      // ⚠️ Dünya listesi henüz gelmediyse düğme kapalı: gönderilecek değer
                      // yokken basılabilir bir düğme, kullanıcıyı boş bir hataya sokardı.
                      onTap: boot.hasValue
                          ? () => _submit(boot.requireValue.worlds)
                          : null,
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              _mode = isLogin ? _Mode.register : _Mode.login;
                              _error = null;
                            }),
                      child: Text(
                        isLogin
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
