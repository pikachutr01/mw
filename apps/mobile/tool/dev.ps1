# ⭐⭐ GELİŞTİRME BAŞLATICISI — tüneli kurar, sonra `flutter run` koşar.
#
# Kullanım (apps/mobile içinden):
#     .\tool\dev.ps1
#     .\tool\dev.ps1 -Port 3002 -Device R6CW500FM4M
#
# ─ ⚠️⚠️ NEDEN VAR: "uygulama açılmıyor" arızasının TEK sebebi bu ────────────────────────────
# Uygulama geliştirmede `http://127.0.0.1:3002`ye bakıyor ve telefonun oradaki dinleyicisi
# `adb reverse tcp:3002 tcp:3002` tünelidir. Bu tünel **kalıcı değil**: USB'nin her yeniden
# bağlanmasında ve `flutter install`/`flutter run`ın kurulum adımında düşüyor. Tünel yokken
# ekranda "API çökmüş" gibi görünüyor — oysa API sapasağlam.
#
# 2026-08-20'de kullanıcı tam bunu bildirdi: *"flutter run ile debug kurduktan sonra yükleme
# aşamasında kalıyor, hiç veri gelmiyor. api de ayakta ama çalışmıyor."* Tek yapılan
# `adb reverse`i geri kurmak oldu ve uygulama açıldı.
#
# ⭐ Bu betik arızayı "daha iyi hata mesajı" ile anlatmıyor, **sınıfı ortadan kaldırıyor**:
# tünel her koşuda yeniden kuruluyor.
#
# ⚠️ `--release` KULLANMA: release APK yerel API'ye ASLA bağlanamaz (Android 9+ cleartext
# yasağı; izin yalnız `android/src/debug/AndroidManifest.xml`'de). Hata mesajı bunu söylemez,
# yalnız "Dünya listesi alınamadı" yazar. Ayrıntı `docs/BASLANGIC.md` tuzak tablosunda.
param(
  [int]$Port = 3002,
  [string]$Device = ''
)

$ErrorActionPreference = 'Stop'

# ⚠️ SDK konumu makineden makineye değişiyor; bu depoda kurulu olduğu yer `C:\Android\Sdk`
#    (Android Studio'nun varsayılanı olan `%LOCALAPPDATA%\Android\Sdk` DEĞİL). Bu yüzden önce
#    PATH'e, sonra bilinen adaylara bakılıyor — tek bir yol sabitlemek betiği kırılgan yapardı.
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $adaylar = @(
    'C:\Android\Sdk\platform-tools\adb.exe',
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
    (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe')
  )
  foreach ($a in $adaylar) { if ($a -and (Test-Path $a)) { $adb = $a; break } }
}
if (-not $adb) {
  Write-Host 'adb bulunamadi. Android SDK platform-tools PATH e ekli mi?' -ForegroundColor Red
  exit 1
}

# Cihaz secimi: parametre verilmediyse bagli TEK cihazi kullan.
if (-not $Device) {
  # ⚠️ @() ŞART: tek eşleşmede `Where-Object` dizi değil DİZE döndürüyor ve `[0]` o dizenin
  #    ilk KARAKTERİNİ veriyor. Betik ilk denemede tam bunu yaptı: cihaz kimliği 'R' oldu ve
  #    adb "device 'R' not found" dedi. Sayı kontrolü ise geçmişti (dizenin de .Count'u 1).
  $satirlar = @(& $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' })
  if ($satirlar.Count -eq 0) {
    Write-Host 'Bagli cihaz yok. USB hata ayiklama acik mi?' -ForegroundColor Red
    exit 1
  }
  if ($satirlar.Count -gt 1) {
    Write-Host 'Birden fazla cihaz bagli, -Device ile sec:' -ForegroundColor Yellow
    $satirlar | ForEach-Object { Write-Host "  $_" }
    exit 1
  }
  $Device = ($satirlar[0] -split '\s+')[0]
}

& $adb -s $Device reverse "tcp:$Port" "tcp:$Port" | Out-Null
Write-Host "tunel kuruldu: $Device  tcp:$Port -> localhost:$Port" -ForegroundColor Green

# ⚠️ API gercekten ayakta mi — tunel kurulsa bile arkasinda dinleyen yoksa ayni belirti cikar.
try {
  $saglik = Invoke-WebRequest -Uri "http://localhost:$Port/healthz" -UseBasicParsing -TimeoutSec 3
  if ($saglik.StatusCode -ne 200) { throw 'healthz 200 donmedi' }
  Write-Host "API ayakta (/healthz 200)" -ForegroundColor Green
} catch {
  Write-Host "UYARI: http://localhost:$Port/healthz cevap vermiyor - API kapali olabilir." -ForegroundColor Yellow
  Write-Host "       apps/api icinden: node --env-file=../../.env dist/main.js" -ForegroundColor Yellow
}

flutter run --debug -d $Device
