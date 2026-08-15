// ⭐ TEMA TESİSATI — üretilen paletin gerçekten EKRANA bağlandığını ölçer.
//
// Neden ayrı bir test: `pnpm tokens:check` token'ların İÇERİĞİNİ kilitliyor (dosya kaynakla
// senkron mu), ama `MwTheme`in o renkleri gerçekten `ThemeData`ya BOYADIĞINI hiçbir şey
// ölçmüyordu. İkisi farklı arıza: birincisi "dosya bayat", ikincisi "dosya taze ama kimse
// kullanmıyor". Bu dosya ikincisini kapatıyor.
//
// ⚠️ Ölçülen şey ekranın görüntüsü DEĞİL tesisat — o yüzden golden değil, düz eşitlik testi.
// Görsel doğrulama `test/golden/` altında ve yalnız `lib/ui/` primitifleri için (MOBIL_MIMARI §5.4).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/gen/tokens.dart';

void main() {
  group('MwTheme', () {
    test('⭐ gündüz teması üretilmiş gündüz paletini kullanır', () {
      final t = MwTheme.light();
      expect(t.brightness, Brightness.light);
      expect(t.scaffoldBackgroundColor, MwLightColors.bg);
      expect(t.colorScheme.primary, MwLightColors.accent);
      expect(t.colorScheme.onPrimary, MwLightColors.onAccent);
      expect(t.colorScheme.surface, MwLightColors.surface);
      expect(t.colorScheme.onSurface, MwLightColors.textPrimary);
      expect(t.colorScheme.error, MwLightColors.danger);
    });

    test('⭐ gece teması üretilmiş gece paletini kullanır', () {
      final t = MwTheme.dark();
      expect(t.brightness, Brightness.dark);
      expect(t.scaffoldBackgroundColor, MwDarkColors.bg);
      expect(t.colorScheme.primary, MwDarkColors.accent);
      expect(t.colorScheme.onPrimary, MwDarkColors.onAccent);
      expect(t.colorScheme.surface, MwDarkColors.surface);
      expect(t.colorScheme.onSurface, MwDarkColors.textPrimary);
    });

    test(
      '⚠️ iki tema BİRBİRİNDEN farklı — tek palet iki kez üretilmiş olmamalı',
      () {
        // Üretecin tema seçimi bozulursa (ör. `resolveTheme` her iki çağrıda 'light' dönerse)
        // yukarıdaki iki test de GEÇER, çünkü ikisi de kendi sabitine bakıyor. Bu test o kör
        // noktayı kapatıyor: gece ile gündüz aynı olamaz.
        expect(MwDarkColors.bg, isNot(MwLightColors.bg));
        expect(MwDarkColors.textPrimary, isNot(MwLightColors.textPrimary));
        expect(
          MwTheme.dark().scaffoldBackgroundColor,
          isNot(MwTheme.light().scaffoldBackgroundColor),
        );
      },
    );
  });

  testWidgets('⭐ uygulama kabuğu temayı gerçekten uygular', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: MwTheme.light(),
        home: const Scaffold(body: Text('x')),
      ),
    );
    final ctx = tester.element(find.text('x'));
    expect(Theme.of(ctx).colorScheme.primary, MwLightColors.accent);
  });
}
