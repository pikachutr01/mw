/// ⭐⭐ POSTA KUTUSU — raporlar + mesajlar, iki sekme.
///
/// ⭐ Açılışta **RAPORLAR** seçili (kullanıcı kararı): oyuncunun ilk merak ettiği şey savaş
/// sonucudur.
///
/// ─ ⭐⭐ SEÇİM MODU: UZUN BASMA (mobile özgü karar) ────────────────────────────────────────
/// Web'de her satırın solunda kalıcı bir kutucuk ve üstte «Hepsini Seç» duruyor. Telefonda
/// kalıcı kutucuk satırın en dar kaynağını — yatay yeri — sürekli tüketir; oysa oyuncu posta
/// kutusunu **okumak** için açıyor, silmek için değil.
///
/// Bu yüzden seçim ayrı bir kip: satıra **uzun basınca** açılıyor (Android posta/mesaj
/// uygulamalarının ortak dili) ve kipteyken normal dokunma seçmeye dönüşüyor. ⚠️ Uzun basma
/// tek başına **keşfedilebilir değil**, bu yüzden panel başlığında ayrıca bir «Seç» düğmesi
/// var — kip iki yoldan da açılıyor.
///
/// ⚠️ Seçim **sayfa değişince ve sekme değişince sıfırlanıyor**: "Hepsini Seç" yalnız görünen
/// sayfayı seçiyor (web'de de aynı kural, 2026-08-01) ve görünmeyen bir satırın seçili
/// kalması, oyuncunun göremediği bir şeyi silmesi demek olurdu.
///
/// ─ ⭐⭐ MESAJLAR SEKMESİ İKİ KAYNAKLI ─────────────────────────────────────────────────────
/// Oyun mesajları (`messages` tablosu — ittifak daveti/başvurusu/sistem duyurusu) ile **DM
/// sohbetleri** (`chat_*`) tarihe göre TEK listede yaşıyor (kullanıcı kararı, 2026-07-31).
/// ⚠️ Sunucuda birleştirme YOK: DM satırı `messages` tablosuna yazılmıyor (rapor kutusunu
/// kirletmesin diye), iki sorgu **burada** birleşiyor. Karar `mergeInbox`ta ve testli.
///
/// ⚠️ İki kaynak iki farklı silme yolundan geçiyor ve bu bir tesadüf değil: mesaj gerçekten
/// SİLİNİYOR (`messages/delete`), sohbet yalnız **benden** siliniyor ve karşı tarafta duruyor
/// (`DELETE /chat/conversations/:id`). Tek uca indirmek ikinci davranışı kaybettirirdi.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../chat/chat_rules.dart';
import '../chat/chat_sheet.dart';
import 'message.dart';
import 'message_rules.dart';
import 'message_sheet.dart';

/* ⚠️ ESKİ KARAR GERİ ALINDI (kullanıcı, 2026-08-19). Burada *"sayfa boyu SABİT ve seçici yok;
   telefonda açılır liste bir masaüstü mobilyası"*  yazıyordu ve boy 20'de sabitti. Kullanıcı
   seçiciyi istedi: *"Uygulamada da henüz bu özellik yok gibi görünüyor. Ekleyip aynı mantığı
   buraya da uygulayalım."* Seçenekler ve varsayılan artık `message_rules.dart`ta, web'le
   birebir; seçim `messagePageSizeProvider` ile cihazda kalıcı.

   ⚠️ Açılır liste yerine ÜÇ KÜÇÜK DÜĞME: üç seçenek için menü açmak fazladan bir dokunuş ve
   fazladan bir katman olurdu; sekme şeridi (`_TabButton`) zaten aynı dili konuşuyor. */

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  String _tab = 'reports';
  int _page = 0;

  /// ⭐ Rapor tür süzgeci (2026-08-19). Varsayılan «Hepsi».
  ///
  /// ⚠️ Sekme değişince SIFIRLANIYOR: Mesajlar sekmesinde «Casusluk» süzgeci anlamsız ve
  /// orada takılı kalsaydı sekme boş görünürdü — oyuncu bunu bir arıza sanardı.
  String _type = 'all';

  /// `null` → seçim kipi kapalı. Boş küme ile `null` FARKLI: kip açık ama hiçbir şey seçili
  /// değil hâli gerçek bir durum (oyuncu «Seç»e bastı, henüz dokunmadı).
  ///
  /// ⚠️ Anahtar **ön ekli dize** (`m7` · `c7`), sayı DEĞİL: liste iki kaynaklı ve iki
  /// kaynağın kimlikleri aynı sayı olabiliyor (gerekçe `InboxRow.key`).
  Set<String>? _selected;

  bool _busy = false;
  String? _error;

  bool get _selecting => _selected != null;

  void _switchTab(String tab) {
    if (tab == _tab) return;
    setState(() {
      _tab = tab;
      _page = 0;
      _type = 'all';
      _selected = null;
    });
  }

  void _goPage(int p) => setState(() {
    _page = p;
    _selected = null;
  });

  /// ⚠️ Süzgeç değişince sayfa SIFIRLANIYOR: 5. sayfadayken «Casusluk» seçen oyuncu aksi
  /// hâlde 3 kayıtlık bir kümenin 5. sayfasını ister ve boş liste görürdü.
  void _setType(String t) {
    if (t == _type) return;
    setState(() {
      _type = t;
      _page = 0;
      _selected = null;
    });
  }

  /// ⚠️ Sayfa **sıfırlanıyor**: 10'luk listenin 5. sayfasındayken 50'ye geçen oyuncu aksi
  /// hâlde var olmayan bir sayfaya bakardı. `clampPage` bunu düzeltirdi ama gözle görülür bir
  /// zıplamayla ve fazladan bir istekle — web de aynı sebeple `setPage(0)` yapıyor.
  void _setPageSize(int n) {
    if (n == ref.read(messagePageSizeProvider).value) return;
    setState(() {
      _page = 0;
      _selected = null;
    });
    unawaited(ref.read(messagePageSizeProvider.notifier).select(n));
  }

  @override
  Widget build(BuildContext context) {
    /* ⚠️⚠️ SAYFA BOYU GELMEDEN SORGU AÇILMIYOR. Tercih diskten okunuyor ve ilk karede henüz
       yok. Varsayılanla bir sorgu açıp sonra gerçek değerle ikincisini açmak, 50 seçmiş bir
       oyuncuda posta kutusunu HER açılışta iki kez istemek olurdu. Riverpod'da koşullu
       `watch` serbest (bağımlılık kümesi her `build`te yeniden kuruluyor), bu yüzden sorguyu
       geciktirmek tek satırlık bir iş. Ekran zaten bir yükleniyor durumu çiziyor. */
    final boyut = ref.watch(messagePageSizeProvider).value;
    final sorgu = boyut == null
        ? null
        : (kind: _tab, page: _page, pageSize: boyut, type: _type);
    final sayfa = sorgu == null
        ? const AsyncValue<MessagePage>.loading()
        : ref.watch(messagesProvider(sorgu));

    /* ⭐ SAYAÇLAR HER İKİ SEKME İÇİN de gerekiyor ve **süzgeçten bağımsız** geliyor: oyuncu
       Raporlar sekmesindeyken Mesajlar rozetini de görmeli. Bu yüzden sayaçlar hangi sekmede
       olursak olalım aynı yanıttan okunuyor, ikinci bir istek gitmiyor. */
    final data = sayfa.value;
    final counts = data?.counts;

    /* ⭐ SOHBETLER — ayrı bir uçtan (`chat_*`), sayfalanmıyor. Sorgu HER İKİ sekmede de
       dinleniyor çünkü Mesajlar rozeti Raporlar sekmesindeyken de doğru sayıyı yazmalı. */
    final sohbetler = ref.watch(chatConversationsProvider).value;

    /* ⚠️ Sayfa numarası aralık DIŞINA düşebiliyor: arka planda gelen bir tazeleme ya da başka
       bir cihazdan silinen kayıtlar toplamı küçültünce son sayfada duran oyuncu boş listeye
       bakar. Gösterilen sayfa ile İSTENEN sayfa daima aynı olmalı — kelepçe `clampPage`te ve
       testle kilitli. */
    final toplam = data?.total ?? 0;
    final sayfaSayisi = pageCount(toplam, boyut ?? kMessagePageSizeDefault);
    final gecerli = clampPage(_page, sayfaSayisi);
    if (gecerli != _page) {
      // ⚠️ Çerçeve sonrası: `build` içinde `setState` çağırmak Flutter'da hatadır.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _goPage(gecerli);
      });
    }

    final gorunen = mergeInbox(
      messages: data?.items ?? const [],
      chats: sohbetler?.items ?? const [],
      tab: _tab,
      page: gecerli,
    );

    /* ⚠️ İKİ KAYNAK da tazeleniyor: posta kutusu ve sohbet listesi ayrı uçlar ve ekran
       ikisini birleştirip gösteriyor (`mergeInbox`). Yalnız birini tazelemek, listenin
       yarısını bayat bırakırdı. */
    return MwRefresh(
      onRefresh: () {
        // ⚠️ Tercih daha okunmadıysa tazelenecek bir posta kutusu sorgusu da YOK; sohbet
        //    listesi yine tazeleniyor, o sayfa boyundan bağımsız.
        if (sorgu != null) ref.invalidate(messagesProvider(sorgu));
        ref.invalidate(chatConversationsProvider);
        return mwRefreshAll([
          if (sorgu != null) ref.read(messagesProvider(sorgu).future),
          ref.read(chatConversationsProvider.future),
        ]);
      },
      builder: (physics) => ListView(
        physics: physics,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: [
          _Tabs(
            tab: _tab,
            counts: counts,
            chatUnread: sohbetler?.unread ?? 0,
            onTab: _switchTab,
          ),
          const SizedBox(height: 10),

          if (_error != null) ...[
            MwErrorBox(_error!),
            const SizedBox(height: 10),
          ],

          /* ⭐ TÜR SÜZGECİ — YALNIZ Raporlar sekmesinde. Kullanıcının isteği tek sekmeyi
             anıyor (*"Mesajlar sayfasının raporlar bölümüne filtre ekleyelim"*) ve Mesajlar
             sekmesinde yalnız üç tür var (ittifak daveti/başvurusu/duyuru) — orada süzgeç
             kazançtan çok gürültü olurdu. */
          if (_tab == 'reports') ...[
            _Filtreler(
              secili: _type,
              favoriler: counts?.favorites ?? 0,
              onSelect: _setType,
            ),
            const SizedBox(height: 8),
          ],

          MwPanel(
            title: _tab == 'reports' ? 'Raporlar' : 'Mesajlar',
            trailing: _Trailing(
              selecting: _selecting,
              total: toplam,
              onToggleSelect: () =>
                  setState(() => _selected = _selecting ? null : <String>{}),
            ),
            child: sayfa.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => MwErrorBox('Posta kutusu alınamadı: $e'),
              data: (_) => _List(
                items: gorunen,
                tab: _tab,
                selected: _selected,
                onOpen: _open,
                onToggle: _toggle,
                onLongPress: _startSelection,
              ),
            ),
          ),

          if (_selecting) ...[
            const SizedBox(height: 10),
            _SelectionBar(
              visible: gorunen,
              selected: _selected!,
              busy: _busy,
              onSelectAll: _toggleAll,
              onDelete: () => _deleteSelected(gorunen),
            ),
          ],

          const SizedBox(height: 10),
          _Footer(
            page: gecerli,
            pageCount: sayfaSayisi,
            pageSize: boyut,
            onPage: _goPage,
            onPageSize: _setPageSize,
          ),
        ],
      ),
    );
  }

  /// Satıra dokunma — kaynağına göre rapor sheet'i ya da sohbet sheet'i açılıyor.
  ///
  /// ⚠️ Okundu işareti **sheet açılmadan ÖNCE** gönderiliyor ve beklenmiyor: sunucu turu
  /// sheet'in açılış animasyonundan uzun sürebilir ve oyuncuyu bekletmenin bir sebebi yok.
  /// Hata olursa sessiz geçiliyor — okunmamış kalan bir satır, açılmayan bir rapordan iyidir.
  ///
  /// ⚠️ Sohbette okundu işareti BURADA gönderilmiyor: onu sohbetin kendisi, mesaj listesi
  /// gerçekten ekrana düştüğünde yapıyor (`chat_sheet.dart`). Açılışta işaretlemek, yüklenmesi
  /// başarısız olan bir sohbeti okunmuş saymak olurdu.
  Future<void> _open(InboxRow row) async {
    switch (row) {
      case InboxMessage(:final message):
        if (message.unread) {
          // ⚠️ `catchError` ŞART: beklenmeyen bir `Future`ın hatası Flutter'da yakalanmamış
          // zone hatasına dönüşüyor ve hata perdesini açıyor. Burada hata gerçekten önemsiz.
          unawaited(
            ref
                .read(messagesActionsProvider)
                .markRead(message.id)
                .catchError((Object _) {}),
          );
        }
        await showMessageSheet(context, message);
      case InboxChat(:final chat):
        await showChatSheet(context, (
          channelId: chat.channelId,
          playerId: chat.playerId,
          username: chat.username,
          blocked: chat.blocked,
        ));
    }
  }

  void _startSelection(InboxRow row) {
    mwTapOk();
    setState(() => _selected = {row.key});
  }

  void _toggle(InboxRow row) => setState(() {
    final s = _selected;
    if (s == null) return;
    if (!s.remove(row.key)) s.add(row.key);
  });

  void _toggleAll(List<InboxRow> visible) => setState(() {
    final s = _selected;
    if (s == null) return;
    final hepsi = visible.every((r) => s.contains(r.key));
    s.clear();
    if (!hepsi) s.addAll(visible.map((r) => r.key));
  });

  /// ⚠️ Silme **iyimser DEĞİL**: liste yalnız sunucu onayından sonra tazeleniyor. Okundu
  /// işareti yanlışsa bedeli bir rozet, silme yanlışsa bedeli kalıcı veri (web'de de aynı
  /// asimetri).
  Future<void> _deleteSelected(List<InboxRow> visible) async {
    final secili = _selected ?? const <String>{};
    final secilenler = visible.where((r) => secili.contains(r.key)).toList();
    if (secilenler.isEmpty) return;

    final mesajlar = [
      for (final r in secilenler)
        if (r case InboxMessage(:final message)) message.id,
    ];
    final sohbetler = [
      for (final r in secilenler)
        if (r case InboxChat(:final chat)) chat.channelId,
    ];

    final ok = await mwConfirmSheet(
      context,
      title: '${secilenler.length} kayıt silinsin mi?',
      // ⚠️ İki kaynağın davranışı FARKLI ve onay metni bunu açıkça söylüyor: mesaj gerçekten
      // siliniyor, sohbet yalnız benden siliniyor. Tek cümleyle geçseydik oyuncu karşı
      // taraftan da sildiğini sanardı.
      body: sohbetler.isEmpty
          ? 'Seçtiğin kayıtlar posta kutundan kalıcı olarak silinir.'
          : 'Seçtiğin kayıtlar posta kutundan kalıcı olarak silinir. '
                'Sohbetler yalnız senden silinir; karşı tarafta aynen durur.',
      confirmLabel: 'Sil',
    );
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // ⚠️ Sohbetler TEK TEK siliniyor: sunucuda toplu bir uç yok ve olmaması doğru —
      // «yalnız bende sil» kanal başına bir imleç yazıyor, toplu silme ucunun (`ids` dizisi)
      // anlattığı şey değil.
      await ref.read(messagesActionsProvider).delete(mesajlar);
      for (final id in sohbetler) {
        await ref.read(chatProvider).clear(id);
      }
      if (mounted) {
        setState(() {
          _selected = null;
          // ⚠️ Silme sonrası ilk sayfaya dönülüyor: eski kayıtlar bu sayfaya yükseliyor ve
          // oyuncunun bulunduğu sayfa numarası artık başka bir kümeyi gösteriyor.
          _page = 0;
        });
      }
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.tab,
    required this.counts,
    required this.chatUnread,
    required this.onTab,
  });

  final String tab;
  final MessageCounts? counts;

  /// DM sohbetlerinin okunmamışı — `messages` tablosundan gelmiyor, ayrı kaynak.
  final int chatUnread;
  final void Function(String) onTab;

  @override
  Widget build(BuildContext context) {
    final c = counts;
    final okunmamis = c == null
        ? (unreadReports: 0, unreadMessages: 0)
        : (unreadReports: c.unreadReports, unreadMessages: c.unreadMessages);

    return Row(
      children: [
        Expanded(
          child: _TabButton(
            label: 'Raporlar',
            active: tab == 'reports',
            badge: tabUnread(okunmamis, 'reports'),
            onTap: () => onTab('reports'),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: _TabButton(
            label: 'Mesajlar',
            active: tab == 'messages',
            // ⭐ Sohbet okunmamışı YALNIZ bu sekmeye ekleniyor (gerekçe `tabUnread`da).
            badge: tabUnread(okunmamis, 'messages', chatUnread: chatUnread),
            onTap: () => onTab('messages'),
          ),
        ),
      ],
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.active,
    required this.badge,
    required this.onTap,
  });

  final String label;
  final bool active;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? scheme.primary : scheme.surface,
          border: Border.all(
            color: active ? c.borderStrong : c.border,
            width: 2,
          ),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                color: active ? scheme.onPrimary : c.muted,
              ),
            ),
            if (badge > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: c.danger,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badge > 99 ? '99+' : '$badge',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: scheme.onPrimary,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Panel başlığının sağı: seçim kipi anahtarı ya da kayıt sayısı.
class _Trailing extends StatelessWidget {
  const _Trailing({
    required this.selecting,
    required this.total,
    required this.onToggleSelect,
  });

  final bool selecting;
  final int total;
  final VoidCallback onToggleSelect;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    if (total == 0) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!selecting)
          Text(
            '$total kayıt',
            style: TextStyle(fontSize: 11, color: c.onPanelHeader),
          ),
        const SizedBox(width: 8),
        InkWell(
          onTap: onToggleSelect,
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: Text(
              selecting ? 'Bitir' : 'Seç',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: c.onPanelHeader,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _List extends StatelessWidget {
  const _List({
    required this.items,
    required this.tab,
    required this.selected,
    required this.onOpen,
    required this.onToggle,
    required this.onLongPress,
  });

  final List<InboxRow> items;
  final String tab;
  final Set<String>? selected;
  final void Function(InboxRow) onOpen;
  final void Function(InboxRow) onToggle;
  final void Function(InboxRow) onLongPress;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return MwEmpty(
        tab == 'reports' ? 'Hiç raporun yok.' : 'Hiç mesajın yok.',
      );
    }
    final c = MwColors.of(context);
    return Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) Divider(height: 1, color: c.border),
          _Row(
            row: items[i],
            selected: selected?.contains(items[i].key),
            onOpen: onOpen,
            onToggle: onToggle,
            onLongPress: onLongPress,
          ),
        ],
      ],
    );
  }
}

/// ⭐ SATIR — tür ikonu + başlık + damga; okunmamışsa sol kenarda kırmızı şerit.
///
/// ⚠️ Ganimet/kayıp önizlemesi BİLEREK yok (kullanıcı, 2026-07-30): liste tek tip kalır,
/// sayılar detayda.
class _Row extends ConsumerWidget {
  const _Row({
    required this.row,
    required this.selected,
    required this.onOpen,
    required this.onToggle,
    required this.onLongPress,
  });

  final InboxRow row;

  /// `null` → seçim kipi kapalı.
  final bool? selected;
  final void Function(InboxRow) onOpen;
  final void Function(InboxRow) onToggle;
  final void Function(InboxRow) onLongPress;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final clock = ref.watch(clockProvider);
    final secili = selected == true;
    final okunmadi = row.unread;

    /* ⭐ İki kaynak, TEK satır iskeleti: solda simge, sağda başlık + damga, altta ayrıntı.
       Kaynağa göre değişen yalnız üç değer — simge, başlık ve ayrıntı. Ayrı iki satır
       bileşeni yazmak, aynı düzeni iki kez bakımı demekti (web'de tam bu ayrışmıştı:
       sohbet satırı `<img>` kullanırken rapor satırı `MissionIcon` kullanıyor). */
    final (Widget simge, String baslik, String ayrinti) = switch (row) {
      InboxMessage(:final message) => (
        _typeIcon(
          context,
          reportType(message.kind, message.side, message.subject),
        ),
        reportType(message.kind, message.side, message.subject).title,
        // Ayrıntı satırı: sunucunun konusu — tür başlığını tekrarlamıyorsa.
        message.subject !=
                reportType(message.kind, message.side, message.subject).title
            ? message.subject
            : '',
      ),
      /* ⭐ Sohbet satırının simgesi `menu/mesaj.png` — alt bardaki Mesaj sekmesiyle AYNI
         dosya. Görev simgelerinden biri olamazdı: sohbet bir ordu hareketi değil. */
      InboxChat(:final chat) => (
        const MwIcon(folder: 'menu', id: 'mesaj', size: 26),
        // ⚠️ Oyuncunun kullanıcı adı — başlık olarak ham yazılıyor, büyütülmüyor.
        chat.username,
        previewText(lastMessage: chat.lastMessage, lastFromMe: chat.lastFromMe),
      ),
    };

    return InkWell(
      onTap: () => selected == null ? onOpen(row) : onToggle(row),
      onLongPress: selected == null ? () => onLongPress(row) : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
        decoration: BoxDecoration(
          color: secili
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.14)
              : okunmadi
              ? c.danger.withValues(alpha: 0.06)
              : null,
          border: Border(
            left: BorderSide(
              color: okunmadi ? c.danger : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Row(
          children: [
            if (selected != null) ...[
              Icon(
                secili ? Icons.check_circle : Icons.circle_outlined,
                size: 22,
                color: secili ? Theme.of(context).colorScheme.primary : c.muted,
              ),
              const SizedBox(width: 8),
            ],
            /* ⚠️ Simge sabit genişlikte: ikonu OLMAYAN türlerde (ittifak, sistem) metin sola
               kayar ve liste düzensiz görünürdü. */
            SizedBox(width: 28, child: simge),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          baslik,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: okunmadi
                                ? FontWeight.w700
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      /* ⚠️ Okunmamış SOHBETTE sayı, mesajda yalnız şerit: sohbette "kaç
                         mesaj birikti" gerçek bir bilgi (sunucu `unreadCount` veriyor),
                         raporda ise her satır tek bir olay — «1» yazmak gürültü olurdu. */
                      if (row case InboxChat(
                        :final chat,
                      ) when chat.unreadCount > 0) ...[
                        _CountBadge(chat.unreadCount),
                        const SizedBox(width: 5),
                      ],
                      Text(
                        // ⚠️ Damgası olmayan satır («—») boş bırakılmıyor: hiç mesaj
                        // yazılmamış sohbette de sütun hizası korunuyor.
                        clock.timeAgo(row.at),
                        style: TextStyle(fontSize: 10, color: c.muted),
                      ),
                    ],
                  ),
                  if (ayrinti.isNotEmpty)
                    Text(
                      ayrinti,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Rapor türünün simgesi; türün ikonu yoksa nötr bir dişli.
  static Widget _typeIcon(
    BuildContext context,
    ({String? icon, String title}) tur,
  ) => tur.icon != null
      ? MwIcon(folder: 'missions', id: tur.icon!, size: 26)
      : Icon(
          Icons.settings_outlined,
          size: 22,
          color: MwColors.of(context).muted,
        );
}

/// Okunmamış mesaj sayısı — yalnız sohbet satırında.
class _CountBadge extends StatelessWidget {
  const _CountBadge(this.count);

  final int count;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: c.danger,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: Theme.of(context).colorScheme.onPrimary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// Seçim kipinin eylem çubuğu — «Hepsini Seç» ve «Sil».
///
/// ⚠️ «Hepsini Seç» yalnız **görünen sayfayı** seçiyor (kullanıcı, 2026-08-01): sayfalama
/// sunucuya inince istemcinin elinde başka satır yok ve olmayan bir şeyi seçmiş gibi
/// göstermek yanıltıcı olurdu.
class _SelectionBar extends StatelessWidget {
  const _SelectionBar({
    required this.visible,
    required this.selected,
    required this.busy,
    required this.onSelectAll,
    required this.onDelete,
  });

  final List<InboxRow> visible;
  final Set<String> selected;
  final bool busy;
  final void Function(List<InboxRow>) onSelectAll;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final hepsi =
        visible.isNotEmpty && visible.every((r) => selected.contains(r.key));
    return Row(
      children: [
        MwSmallButton(
          label: hepsi ? 'Seçimi bırak' : 'Hepsini Seç',
          kind: MwButtonKind.ghost,
          onTap: visible.isEmpty ? null : () => onSelectAll(visible),
        ),
        const Spacer(),
        MwSmallButton(
          label: selected.isEmpty ? 'Sil' : 'Sil (${selected.length})',
          kind: MwButtonKind.danger,
          onTap: selected.isEmpty || busy ? null : onDelete,
        ),
      ],
    );
  }
}

/// ⭐ RAPOR TÜR SÜZGECİ — açılır liste.
///
/// ⚠️ Çip şeridi DEĞİL (kullanıcı, 2026-08-19: *"teker teker badge şeklinde değil de
/// selectbox dan seçecek şekilde yapalım"*). İlk yazımda yedi çip yatay kayan bir şeritteydi:
/// tek satıra sığıyordu ama seçili olmayan seçeneklerin çoğu ekran dışında kalıyordu, yani
/// oyuncu neyin var olduğunu görmek için kaydırmak zorundaydı. Açılır liste hepsini tek
/// dokunuşta gösteriyor.
///
/// ⚠️ `DropdownButton` — uygulamada zaten var (Dünya'daki kıta seçici) ve Android'in kendi
/// menüsünü açıyor. Bottom sheet'e çevirmek, yedi satırlık bir seçim için fazladan bir katman
/// olurdu; native davranış politikası *"web'de modal olan şey"* için sheet diyor, açılır liste
/// zaten native bir denetim.
class _Filtreler extends StatelessWidget {
  const _Filtreler({
    required this.secili,
    required this.favoriler,
    required this.onSelect,
  });

  final String secili;

  /// Favori sayısı — 0 ise parantez hiç yazılmıyor («Favoriler (0)» bir bilgi değil).
  final int favoriler;
  final void Function(String) onSelect;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      decoration: BoxDecoration(
        color: c.raised.withValues(alpha: 0.5),
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text('Tür', style: TextStyle(fontSize: 12, color: c.muted)),
          const SizedBox(width: 10),
          Expanded(
            child: DropdownButton<String>(
              value: secili,
              isExpanded: true,
              isDense: true,
              underline: const SizedBox.shrink(),
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
              items: [
                for (final f in kReportFilters)
                  DropdownMenuItem(
                    value: f.id,
                    child: Text(
                      f.id == 'favorites' && favoriler > 0
                          ? '${f.label} ($favoriler)'
                          : f.label,
                    ),
                  ),
              ],
              onChanged: (v) => v == null ? null : onSelect(v),
            ),
          ),
        ],
      ),
    );
  }
}

/// Liste altı — sayfalayıcı ve sayfa boyu seçici.
///
/// ⚠️ **Seçici HER ZAMAN çiziliyor, sayfalayıcı yalnız birden çok sayfa varsa.** İkisi farklı
/// sorular: "başka sayfa var mı" duruma bağlı, "kaç kayıt görmek istiyorum" değil. Seçiciyi de
/// gizleseydik tek sayfaya düşen bir kutuda oyuncu boyu bir daha DEĞİŞTİREMEZDİ — 50'yi seçip
/// listeyi tek sayfaya indiren biri 10'a geri dönemezdi.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.page,
    required this.pageCount,
    required this.pageSize,
    required this.onPage,
    required this.onPageSize,
  });

  final int page;
  final int pageCount;

  /// `null` → tercih henüz diskten okunmadı; hiçbir düğme seçili görünmez.
  final int? pageSize;
  final void Function(int) onPage;
  final void Function(int) onPageSize;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Column(
      children: [
        if (pageCount > 1) ...[
          _Pager(page: page, pageCount: pageCount, onPage: onPage),
          const SizedBox(height: 4),
        ],
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Sayfa başına',
              style: TextStyle(fontSize: 13, color: c.muted),
            ),
            const SizedBox(width: 10),
            for (final n in kMessagePageSizes)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: MwSmallButton(
                  label: '$n',
                  minWidth: 46,
                  kind: n == pageSize
                      ? MwButtonKind.primary
                      : MwButtonKind.ghost,
                  onTap: () => onPageSize(n),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Sayfalayıcı — «‹ 2 / 5 ›».
class _Pager extends StatelessWidget {
  const _Pager({
    required this.page,
    required this.pageCount,
    required this.onPage,
  });

  final int page;
  final int pageCount;
  final void Function(int) onPage;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          onPressed: page <= 0 ? null : () => onPage(page - 1),
          icon: const Icon(Icons.chevron_left),
        ),
        Text(
          '${page + 1} / $pageCount',
          style: TextStyle(
            color: c.muted,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        IconButton(
          onPressed: page >= pageCount - 1 ? null : () => onPage(page + 1),
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}
