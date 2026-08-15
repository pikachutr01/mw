// MobilWar mobil istemcisi — giriş noktası.
//
// ⭐ Tema `lib/gen/tokens.dart`ten geliyor ve o dosya ÜRETİLMİŞTİR
// (`packages/design-tokens/tokens.json` → `pnpm tokens:build`). Burada ham renk yazılmaz;
// palet web ile TEK kaynaktan besleniyor (§13.13.1) ve `pnpm tokens:check` sürüklenmeyi kırar.
//
// ⚠️ `ThemeMode.system` bilinçli: web'de de üç kip var (`system` varsayılan) ve oyuncunun
// seçimi ileride hesaba yazılacak (`accounts.ui_theme`) — o zaman buraya bağlanır.
import 'package:flutter/material.dart';

import 'gen/tokens.dart';

void main() => runApp(const MobilWarApp());

class MobilWarApp extends StatelessWidget {
  const MobilWarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MobilWar',
      debugShowCheckedModeBanner: false,
      theme: MwTheme.light(),
      darkTheme: MwTheme.dark(),
      themeMode: ThemeMode.system,
      home: const _Iskele(),
    );
  }
}

/// Faz 0 iskelesi — Faz 1'de `go_router` kabuğuyla değişecek.
class _Iskele extends StatelessWidget {
  const _Iskele();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('MobilWar'),
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
      ),
      body: Center(
        child: Text(
          'Faz 0 — zemin kuruldu',
          style: TextStyle(color: scheme.onSurface),
        ),
      ),
    );
  }
}
