# SAAT SIÇRAMASI — konak (ESXi) saatinin konuğa sızması

> **2026-08-16 olayının tam hesabı.** Kod tarafının gerekçeleri `missions/scheduler.service.ts`
> ve `test/clock-skew.test.ts` başlıklarında; burası **operasyon** tarafı: sunucuda ne
> değiştirildi, nasıl doğrulanır, sağlayıcıya ne söylenir, tekrarı nasıl anlaşılır.

---

## 1. Ne oldu

16 Ağustos 10:09:44'te (yerel) oyuncular *"attığım saldırı anında gerçekleşti"*, *"rapor
gerçekleşeceği saatten önce geldi"* diye bildirdi. **12 görev** aynı anda, vadesinden **43 sn
ile 2 sa 28 dk arası önce** çalıştı.

| Görev | Sahip | Karşı taraf | Ne kadar erken |
|---|---|---|---|
| attack 6686 | Kaos | hükümdar2 | 1 sa 52 dk |
| attack 6700 | haqan | Haze | 1 sa 38 dk |
| attack 6699 | haqan | den | 1 sa 28 dk |
| attack 6687 | Kaos | hükümdar3 | 1 sa 10 dk |
| attack 6681 / 6682 | ahmetbatar | caner1 | 1 sa 07 dk |
| return 6684 / 6675 / 6637 / 6698 | Kaos · haqan | — | 43 sn – 2 sa 28 dk |
| building_finish 6685 | Canerator | — | 9 dk |
| ranking_snapshot 6658 | — | — | 5 sa 50 dk (**atlandı**, aşağıya bak) |

**Yan hasar:** 6 savaş raporu gelecek damgalı yazıldı · 4 şehrin `resources_at` çıpası geleceğe
kaydı (üretim, gerçek saat yetişene kadar durur — kayıp YOK, ileriye ödenmiş sayılır) ·
`missions.claimed_at` 12 satırda **bitişinden sonraya** düştü.

## 2. Kök neden

```
ESXi konak saati : 16 Aug 2026 20:52:59
Konuk (VM) saati : 16 Aug 2026 11:27:55 +03
Fark             : +9 sa 25 dk 04 sn
```

Konak saatinde NTP yok ve **sürekli ileri kayıyor** (3 Ağustos'ta sapma 7 sa 47 dk, 16
Ağustos'ta 9 sa 25 dk → günde ~7,5 dk). VMware Tools'un *periyodik* eşitlemesi kapalıydı, ama
**olay tabanlı** (snapshot/yedek sırasındaki duraklat–devam et) eşitleme açıktı: her
tetiklenişinde konuk saati bir anlığına konak saatine sıçradı, `systemd-timesyncd` saniyeler
içinde geri çekti.

O pencerede PostgreSQL `now()` geleceği okudu ve `claimDue`'nun `execute_at <= now()` yüklemi
o saate kadar vadesi olan **her şeyi** aldı.

### Kanıt zinciri
1. `missions.claimed_at = 2026-08-16 16:34:48.162413+00` (12 satır, hepsi aynı), `finished_at`
   ise `07:09:44` → **bitişi alınışından önce** olan satırlar.
2. `journald`: `Aug 16 19:34:48 Clock change detected` → hemen ardından
   `Aug 16 10:09:44 Clock change detected` + `Time jumped backwards, rotating`.
   **19:34:48 yerel = 16:34:48 UTC** — `claimed_at` ile birebir.
3. `vmware-toolbox-cmd stat hosttime` farkı, sıçrama miktarıyla birebir aynı.
4. PG checkpoint günlüğü ve `scheduler_samples` **kesintisiz** → sıçrama saniyenin altında sürdü,
   başka hiçbir yere iz bırakmadı.

### Tekrar sıklığı
Günde ~3 sıçrama, sabah penceresinde: 14 Ağu 10:11–10:12 · 15 Ağu 11:08–11:10 · 16 Ağu
10:09–10:47. Aynı sınıf daha önce de vurmuştu: **2026-08-03** (sıralama 7 sa 47 dk erken),
**2026-08-05** (zincir öldü), **2026-08-12** (nabız + `healthz`, bkz. `clock-skew.test.ts`).

## 3. Neden mevcut korumalar tutmadı

2026-08-03'te alınan önlem (`GAME_NOW_SQL` — kıyaslamanın iki ucu da DB saatinden) **süreç ile
DB arasındaki** kaymayı kapatıyor. Ama **DB'nin kendi saati** sıçrayınca iki uç da aynı yanlış
saati okuyor; önlem tanımı gereği kör.

Tek çalışan kapı `ranking.handler.ts`'teki `MAX_ILERI_VADE_MS` oldu: sıralama anlık görüntüsü
atlandı ve zincir korundu (6707 yeniden 13:00'e kuruldu). **O kapı olmasaydı sıralama da
bozulacaktı** — 2026-08-03'te tam olarak bu olmuştu.

## 4. Sunucuda ne değiştirildi (2026-08-16, uygulandı)

### 4.1 `/etc/vmware-tools/tools.conf`
```ini
[timesync]
disable = true
```
Yedek: `/etc/vmware-tools/tools.conf.bak-<damga>`.

### 4.2 `/etc/systemd/system/open-vm-tools.service.d/no-time-sync.conf`
```ini
[Service]
CapabilityBoundingSet=~CAP_SYS_TIME
```

⚠️ **İkisi birden gerekli.** `tools.conf` ayarı *periyodik* eşitlemeyi kapatır; host tarafından
tetiklenen **tek seferlik** (resume/snapshot/vMotion) senkronlar bazı sürümlerde yine çalışır.
`CAP_SYS_TIME` düşürülünce vmtoolsd `clock_settime` çağrısını **yapamaz** — bu bir ayar değil,
çekirdek kuralı. vmtoolsd'nin diğer işlevleri (heartbeat, quiesced snapshot, graceful shutdown)
bu yetkiyi kullanmıyor.

### 4.3 Doğrulama (uygulandı, geçti)
```bash
# vmtoolsd'nin yetkisi gitti mi?
PID=$(systemctl show -p MainPID --value open-vm-tools)
capsh --decode=$(awk '/^CapBnd/{print $2}' /proc/$PID/status) | tr ',' '\n' | grep -i sys_time
# → çıktı YOK = yetki düşmüş

# mekanizma gerçekten engelliyor mu? (1 sn'lik zarar yarıçapı)
systemd-run --quiet --pipe --wait --property=CapabilityBoundingSet=~CAP_SYS_TIME \
  /bin/date -s '+1 second'
# → "cannot set date: Operation not permitted", çıkış 1
```

## 5. Kodda ne değiştirildi

`scheduler.service.ts` — **iki kat**, ikisi de `missions/scheduler.service.ts` başlığında
gerekçeli:

1. **Monotonik kapı** (`clockJumpToleranceMs`, 30 sn) — iki tur arasında oyun saati monotonik
   saatten koparsa **tur atlanır**. Monotonik saat sıçramaz; duvar saatinin doğruluğunu
   ölçebilecek tek yerel referans odur.
2. **Alım sonrası doğrulama** (`maxFutureDueMs`, 60 sn) — alınan görevin vadesi TAZE okunan oyun
   saatinden ileriyse çalıştırılmadan `releaseFuture` ile kuyruğa geri bırakılır.
   `markFailed` **değil**: vade kaydırılmaz, deneme hakkı yakılmaz, bozuk `claimed_at`/`lag_ms`
   temizlenir.

⚠️ 1. kat tek başına yetmez: `clock.read()` ile `claimDue` iki ayrı sorgu, sıçrama tam aralarına
düşebilir. 2. kat o yarışı kapatıyor ve 16 Ağustos'ta **12 görevin 12'sini de** yakalardı
(handler'lar zaten düzelmiş saatle koşmuştu).

Regresyon testleri: `test/clock-skew.test.ts` → `⭐⭐⭐ scheduler — saat ileri sıçraması`.

## 6. Hasar onarımı — bilinçli olarak YAPILMAYANLAR

- **`cities.resources_at` geleceğe kaymış 4 şehir ELLENMEDİ.** Üretim o ana kadar zaten
  kredilendi; çıpayı geri çekmek aynı aralığı **ikinci kez** ödetirdi (bedava kaynak).
  Gerçek saat yetişince kendiliğinden normale döner.
- **12 görevin bozuk `claimed_at`/`lag_ms` değerleri BIRAKILDI** — olayın kaydı onlar.
- Erken çözülen 6 savaşın telafisi **ürün kararı**, teknik bir onarım değil.

## 7. Sağlayıcıya bildirilecek

Metin `docs/YAYINA_ALMA.md` yerine burada, çünkü konu sunucu değil **konak**:

> Sanal makinemizin (31.210.36.185) üzerinde çalıştığı ESXi konağının saati **9 saat 25 dakika
> ileri** ve NTP ile senkron değil; sapma günde ~7,5 dakika büyüyor (3 Ağustos'ta 7 sa 47 dk
> ölçtük, 16 Ağustos'ta 9 sa 25 dk). `vmware-toolbox-cmd stat hosttime` konak saatini
> `16 Aug 2026 20:52:59` olarak veriyor; konuk saati doğru (`11:27:55 +03`, Cloudflare/Google
> NTP ile senkron).
>
> Konak, snapshot/yedek işlemleri sırasında konuk saatini kendi saatine eşitliyor ve günde
> ~3 kez saatimizi 9,5 saat ileri sıçratıyor (14–16 Ağustos günlüklerinde
> `Clock change detected` kayıtları var). Bu, uygulamamızda veri bozulmasına yol açtı.
>
> Ricalarımız:
> 1. **ESXi konağının saati NTP ile senkronize edilsin** — bu, o konaktaki tüm müşterileri
>    etkiliyor.
> 2. VM'imizin VMX dosyasında zaman eşitlemesi kapatılsın:
>    `tools.syncTime = "FALSE"` ve `time.synchronize.continue/restore/resume.disk/resume.host/shrink/tools.startup = "FALSE"`.
>
> Konuk tarafında geçici önlemi kendimiz aldık (vmtoolsd'den `CAP_SYS_TIME` düşürüldü), ama
> konak saatinin yanlış olması yedekleme damgaları ve destek günlükleri için de sorun.

## 8. Tekrarı nasıl anlaşılır

```bash
# saat sıçraması izi (konuk)
journalctl | grep -E "Clock change detected|Time jumped backwards"

# konak–konuk farkı
vmware-toolbox-cmd stat hosttime; date

# kuyruk tarafı: sıçrama kapıya takıldı mı?
#   scheduler log: "[scheduler] saat sıçraması: ... tur ATLANDI"
#   scheduler log: "[scheduler] görev N ... GELECEKTE, kuyruğa geri bırakıldı"
```

```sql
-- bir daha olursa ilk bakılacak sorgu: bitişi alınışından önce olan görev
SELECT id, type, execute_at, claimed_at, finished_at, lag_ms
  FROM missions WHERE claimed_at > finished_at OR claimed_at > now();
```
