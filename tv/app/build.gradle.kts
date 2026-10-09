plugins {
    id("com.android.application")
}

android {
    namespace = "dev.mobium.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.mobium.tv"
        // Fire OS 6 is Android 7.1 (API 25); Fire OS 7 is Android 9 (API 28).
        minSdk = 25
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
