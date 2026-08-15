plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.mobilwar.mobilwar"
    // ⚠️ `flutter.compileSdkVersion` (36) YETMİYOR: flutter_secure_storage 11.0.0 kendisine
    // bağımlı olan uygulamanın **37 veya üstüne** derlenmesini şart koşuyor ve derleme
    // `checkDebugAarMetadata` adımında kırılıyor. Sabit yazılmasının sebebi bu; Flutter
    // varsayılanı 37'ye çıkınca bu satır kaldırılabilir.
    // ⚠️ AGP 9.0.1 "önerilen en yüksek 36" diye UYARIYOR — uyarı, engel değil. Alternatif
    // (flutter_secure_storage'ı 10.x'e düşürmek) jetonların saklandığı katmanı eskitirdi.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.mobilwar.mobilwar"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
