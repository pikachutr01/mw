/// ⭐⭐ DESTEK — web'deki `Support.tsx` karşılığı.
///
/// ─ ⚠️ MİSAFİRE AÇIK OLMAK ZORUNDA (kullanıcı şartı) ──────────────────────────────────────
/// *"Desteğe en çok ihtiyaç duyan kişi zaten giriş YAPAMAYAN kişidir."* Ekran bu yüzden
/// `kGuestPaths` içinde ve iki kipte çalışıyor.
///
/// ⚠️⚠️ İKİ AYRI UÇ AİLESİ var ve seçimi İSTEMCİ yapmak zorunda: sunucu `OptionalAuthGuard`
/// kullanmıyor, yani oturumu olan biri public ucu çağırsa bile talep **anonim** açılıyor ve
/// oyuncunun kendi hesabından kopardı.
///
/// ─ ⚠️ MİSAFİRİN TAKİP JETONU ────────────────────────────────────────────────────────────
/// Anonim talep açılınca sunucu tek kullanımlık bir jeton döndürüyor; sunucuda yalnız
/// `sha256`'sı duruyor, yani ham değer bir daha alınamıyor. Jeton **cihaza yazılıyor** ki
/// misafir uygulamayı kapatıp açtığında talebini bulabilsin — web'de bunun karşılığı adresteki
/// `/destek/t/:token` bağlantısı ama telefonda oyuncunun bir adresi elle saklaması gerçekçi
/// değil. Aynı bağlantı e-postayla da gidiyor; depo kaybolursa yol yine açık.
///
/// ─ ⛔ EK (RESİM) YÜKLEME YOK — bilerek ──────────────────────────────────────────────────
/// Web'de talebe tek bir resim eklenebiliyor (`multipart`, 5 MB). Mobilde YOK çünkü:
///   1. `pubspec.yaml`da dosya/resim seçici paketi yok; eklemek yeni bir bağımlılık,
///   2. Android ve iOS'ta fotoğraf izni bildirimi ve izin akışı gerekiyor,
///   3. `dio` üzerinden `multipart` gövdesi kurmak `api_client`ın JSON varsayımını deler.
/// Üçü de yapılabilir ama üçü de bu ekranın işi değil. Metin talebi çekirdek işlevi karşılıyor;
/// eki olan bir YÖNETİCİ mesajı ise ekranda «ek var» diye işaretleniyor, sessizce yutulmuyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/clock.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'support_model.dart';
import 'support_rules.dart';

/// ⚠️ Web'le **aynı kavram** farklı taşıyıcı: orada jeton adreste, burada cihazda.
const String kSupportTokenKey = 'mw-support-token';

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _konu = TextEditingController();
  final _mesaj = TextEditingController();
  final _eposta = TextEditingController();
  String _kategori = kSupportCategories.first.id;

  bool _busy = false;
  String? _error;

  /// Misafirin cihaza yazılmış takip jetonu.
  String? _jeton;
  bool _jetonOkundu = false;

  /// Açık yazışma — oturumluda talep kimliği, misafirde jeton.
  int? _acikTalep;
  bool _misafirYazisma = false;

  @override
  void initState() {
    super.initState();
    _jetonuOku();
  }

  @override
  void dispose() {
    _konu.dispose();
    _mesaj.dispose();
    _eposta.dispose();
    super.dispose();
  }

  Future<void> _jetonuOku() async {
    final v = await ref.read(storeProvider).read(kSupportTokenKey);
    if (!mounted) return;
    setState(() {
      _jeton = v;
      _jetonOkundu = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final oturumlu = ref.watch(sessionProvider) != null;

    // ⚠️ Form paketi yalnız oturumluda çekiliyor: misafirde uç 401 döndürürdü ve ekran
    //    açılışta gereksiz bir hata gösterirdi.
    final form = oturumlu ? ref.watch(supportFormProvider).value : null;
    final epostaGerekli = !oturumlu || (form?.showEmail ?? false);

    /* ⚠️ Doğrulanmamış hesabın adresi sunucudan ÖN DOLU geliyor ama kutu kilitli değil:
       kullanıcı şartı *"e-posta otomatik doldurulur ama kullanıcı değiştirebilir"*. */
    if (form != null && form.showEmail && _eposta.text.isEmpty) {
      _eposta.text = form.email;
    }

    if (_acikTalep != null || _misafirYazisma) {
      return _Yazisma(
        id: _misafirYazisma ? null : _acikTalep,
        token: _misafirYazisma ? _jeton : null,
        onKapat: () => setState(() {
          _acikTalep = null;
          _misafirYazisma = false;
        }),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        if (oturumlu) ...[
          _Liste(onAc: (id) => setState(() => _acikTalep = id)),
          const SizedBox(height: 10),
        ],

        /* ⭐ Misafirin açık talebi — jeton cihazda duruyorsa. ⚠️ `_jetonOkundu` şart:
           disk okuması bitmeden kartı çizmemek, bir kare boyunca "talebin yok" demekten
           iyi. */
        if (!oturumlu && _jetonOkundu && _jeton != null) ...[
          MwPanel(
            title: 'Açık talebin',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Daha önce bir destek talebi açtın. Yanıtları burada görebilirsin.',
                  style: TextStyle(fontSize: 12, color: c.muted),
                ),
                const SizedBox(height: 8),
                MwSmallButton(
                  label: 'Talebi aç',
                  onTap: () => setState(() => _misafirYazisma = true),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],

        MwPanel(
          title: 'Yeni destek talebi',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Alan(
                label: 'Konu',
                controller: _konu,
                hint: 'Kısaca sorunun ne?',
                maxLength: kSubjectMax,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Text('Kategori', style: TextStyle(fontSize: 12, color: c.muted)),
              DropdownButton<String>(
                value: _kategori,
                isExpanded: true,
                items: [
                  for (final k in kSupportCategories)
                    DropdownMenuItem(value: k.id, child: Text(k.label)),
                ],
                onChanged: (v) =>
                    v == null ? null : setState(() => _kategori = v),
              ),
              if (epostaGerekli) ...[
                const SizedBox(height: 8),
                _Alan(
                  label: 'E-posta adresin',
                  controller: _eposta,
                  hint: 'ornek@eposta.com',
                  maxLength: kEmailMax,
                  keyboard: TextInputType.emailAddress,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 2),
                Text(
                  oturumlu
                      ? 'Hesabının e-postası henüz doğrulanmadı; yanıtı bu adrese yollayacağız.'
                      : 'Yanıtı bu adrese yollayacağız. Hesabın varsa giriş yapman takibi kolaylaştırır.',
                  style: TextStyle(fontSize: 11, color: c.muted),
                ),
              ],
              const SizedBox(height: 8),
              _Alan(
                label: 'Mesajın',
                controller: _mesaj,
                hint:
                    'Ne olduğunu, ne yapmaya çalıştığını ve ne gördüğünü yaz.',
                maxLength: kBodyMax,
                lines: 6,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              MwButton(
                label: 'Talebi gönder',
                busy: _busy,
                onTap: _busy || !_gecerli(epostaGerekli) ? null : _gonder,
              ),
              /* ⚠️ Sebep düğmenin ALTINDA ve yalnız oyuncu bir şey yazdıktan sonra: boş bir
                 formda kırmızı uyarılar göstermek, daha başlamadan azarlamak olurdu. */
              if (_ilkHata(epostaGerekli) != null) ...[
                const SizedBox(height: 6),
                Text(
                  _ilkHata(epostaGerekli)!,
                  style: TextStyle(fontSize: 11, color: c.warning),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                MwErrorBox(_error!),
              ],
            ],
          ),
        ),
      ],
    );
  }

  bool _gecerli(bool epostaGerekli) => canCreateTicket(
    subject: _konu.text,
    body: _mesaj.text,
    email: _eposta.text,
    emailRequired: epostaGerekli,
  );

  String? _ilkHata(bool epostaGerekli) {
    if (_konu.text.trim().isEmpty && _mesaj.text.trim().isEmpty) return null;
    return subjectError(_konu.text) ??
        emailError(_eposta.text, zorunlu: epostaGerekli) ??
        bodyError(_mesaj.text, ilkMesaj: true);
  }

  Future<void> _gonder() async {
    final oturumlu = ref.read(sessionProvider) != null;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (oturumlu) {
        final id = await ref
            .read(supportProvider)
            .create(
              subject: _konu.text.trim(),
              category: _kategori,
              body: _mesaj.text.trim(),
              email: _eposta.text.trim(),
            );
        await mwTapOk();
        if (mounted) {
          setState(() {
            _busy = false;
            _acikTalep = id;
          });
          _temizle();
        }
      } else {
        final r = await ref
            .read(supportProvider)
            .createAnon(
              subject: _konu.text.trim(),
              category: _kategori,
              body: _mesaj.text.trim(),
              email: _eposta.text.trim(),
            );
        /* ⚠️ Jeton HEMEN diske yazılıyor: sunucu onu bir daha vermiyor (yalnız sha256'sı
           saklanıyor) ve uygulama o an kapansa misafirin talebine ulaşmasının tek yolu
           e-postadaki bağlantı kalırdı. */
        if (r.token != null) {
          await ref.read(storeProvider).write(kSupportTokenKey, r.token!);
        }
        await mwTapOk();
        if (mounted) {
          setState(() {
            _busy = false;
            _jeton = r.token;
            _misafirYazisma = r.token != null;
          });
          _temizle();
          if (r.token == null) await _jetonsuzBilgi();
        }
      }
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

  /// ⚠️ Jeton gelmeyebiliyor (sunucu onu isteğe bağlı döndürüyor). O zaman oyuncuyu boş bir
  /// ekranla bırakmak yerine ne olduğunu söylüyoruz.
  Future<void> _jetonsuzBilgi() => mwInfoSheet(
    context,
    title: 'Talebin alındı',
    lines: const [
      Text(
        'Yanıtı e-posta adresine göndereceğiz. Takip bağlantısı da o postanın içinde '
        'olacak.',
      ),
    ],
  );

  void _temizle() {
    _konu.clear();
    _mesaj.clear();
  }
}

class _Alan extends StatelessWidget {
  const _Alan({
    required this.label,
    required this.controller,
    required this.hint,
    required this.maxLength,
    required this.onChanged,
    this.lines = 1,
    this.keyboard,
  });

  final String label;
  final TextEditingController controller;
  final String hint;
  final int maxLength;
  final ValueChanged<String> onChanged;
  final int lines;
  final TextInputType? keyboard;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    maxLength: maxLength,
    maxLines: lines,
    keyboardType: keyboard,
    onChanged: onChanged,
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      border: const OutlineInputBorder(),
      // ⚠️ Sayaç yalnız uzun alanlarda: tek satırlık bir konuda «0/120» gürültü.
      counterText: lines > 1 ? null : '',
    ),
  );
}

class _Liste extends ConsumerWidget {
  const _Liste({required this.onAc});

  final ValueChanged<int> onAc;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    final liste = ref.watch(supportTicketsProvider);

    return MwPanel(
      title: 'Taleplerin',
      child: liste.when(
        loading: () =>
            Text('Yükleniyor…', style: TextStyle(fontSize: 12, color: c.muted)),
        error: (_, _) => const MwErrorBox('Talepler okunamadı.'),
        data: (t) => t.isEmpty
            ? Text(
                'Henüz destek talebin yok.',
                style: TextStyle(fontSize: 12, color: c.muted),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final x in t)
                    InkWell(
                      onTap: () => onAc(x.id),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    x.subject,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 13,
                                      // ⚠️ Okunmamış yönetici mesajı olan satır KALIN:
                                      //    rozet tek başına dar ekranda gözden kaçıyor.
                                      fontWeight: x.unreadCount > 0
                                          ? FontWeight.w700
                                          : FontWeight.w400,
                                    ),
                                  ),
                                  Text(
                                    '${supportCategoryLabel(x.category)} · '
                                    '${clock.timeAgo(x.updatedAt)}',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: c.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (x.unreadCount > 0) ...[
                              Text(
                                '${x.unreadCount}',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: c.danger,
                                ),
                              ),
                              const SizedBox(width: 8),
                            ],
                            Text(
                              supportStatusLabel(x.status),
                              style: TextStyle(
                                fontSize: 11,
                                color: x.acik ? c.success : c.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _Yazisma extends ConsumerStatefulWidget {
  const _Yazisma({
    required this.id,
    required this.token,
    required this.onKapat,
  });

  final int? id;
  final String? token;
  final VoidCallback onKapat;

  @override
  ConsumerState<_Yazisma> createState() => _YazismaState();
}

class _YazismaState extends ConsumerState<_Yazisma> {
  final _yanit = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _yanit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    final anahtar = (id: widget.id, token: widget.token);
    final yazisma = ref.watch(supportThreadProvider(anahtar));

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        MwSmallButton(
          label: 'Taleplere dön',
          kind: MwButtonKind.ghost,
          onTap: widget.onKapat,
        ),
        const SizedBox(height: 10),
        yazisma.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          /* ⚠️ Misafirde 404 «jeton yok» değil «jeton SÜRESİ DOLMUŞ ya da hiç olmamış»
             demek olabilir; sunucu ikisini bilerek ayırmıyor (varlık sızıntısı). Metin de
             ayırmıyor. */
          error: (_, _) => const MwErrorBox(
            'Talep bulunamadı. Bağlantının süresi dolmuş olabilir.',
          ),
          data: (t) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MwPanel(
                title: t.ticket.subject,
                trailing: Text(
                  supportStatusLabel(t.ticket.status),
                  style: TextStyle(
                    fontSize: 11,
                    color: t.ticket.acik ? c.success : c.muted,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${supportCategoryLabel(t.ticket.category)} · '
                      '${clock.timeAgo(t.ticket.createdAt)}',
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                    const SizedBox(height: 8),
                    for (final m in t.messages) _Mesaj(m: m, clock: clock),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (t.canReply)
                MwPanel(
                  title: 'Yanıtla',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _yanit,
                        maxLines: 4,
                        maxLength: kBodyMax,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          hintText: 'Yanıtını yaz…',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      MwButton(
                        label: 'Yanıtla',
                        busy: _busy,
                        onTap: _busy || !canReply(_yanit.text)
                            ? null
                            : () => _gonder(anahtar),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        MwErrorBox(_error!),
                      ],
                    ],
                  ),
                )
              else
                MwPanel(
                  child: Text(
                    'Bu talep kapatıldı. Yeni bir sorun için yeni bir talep açabilirsin.',
                    style: TextStyle(fontSize: 12, color: c.muted),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _gonder(({int? id, String? token}) anahtar) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(supportProvider)
          .reply(
            id: anahtar.id,
            token: anahtar.token,
            body: _yanit.text.trim(),
          );
      await mwTapOk();
      if (mounted) {
        setState(() {
          _busy = false;
          _yanit.clear();
        });
      }
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

class _Mesaj extends StatelessWidget {
  const _Mesaj({required this.m, required this.clock});

  final MwTicketMessage m;
  final MwClock clock;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          // ⭐ Yönetici mesajı vurgulu: oyuncunun aradığı şey kendi yazdığı değil, gelen cevap.
          color: m.yonetici ? c.raised : null,
          border: Border.all(color: m.yonetici ? c.borderStrong : c.border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    // ⚠️ Yönetici tarafında sunucu daima «Yönetim» yolluyor; personel
                    //    kimliği oyuncuya sızmıyor ve istemci de uydurmuyor.
                    m.authorName.isEmpty ? 'Sen' : m.authorName,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: m.yonetici ? c.info : null,
                    ),
                  ),
                ),
                Text(
                  clock.timeAgo(m.createdAt),
                  style: TextStyle(fontSize: 11, color: c.muted),
                ),
              ],
            ),
            const SizedBox(height: 4),
            // ⚠️ Düz metin: sunucu HTML/markdown kabul etmiyor, istemci de çizmiyor.
            Text(m.body, style: const TextStyle(fontSize: 13)),
            /* ⚠️ Ek SESSİZCE YUTULMUYOR: mobilde gösterilemiyor (gerekçe dosya başlığında)
               ama var olduğu yazılıyor, yoksa yöneticinin gönderdiği bir ekran görüntüsü
               oyuncu için hiç var olmamış gibi olurdu. */
            if (m.attachmentId != null) ...[
              const SizedBox(height: 4),
              Text(
                'Bu mesajda bir ek var; mobilwar.com üzerinden görebilirsin.',
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
