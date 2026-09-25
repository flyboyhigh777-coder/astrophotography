plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.astrostacker.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.astrostacker.app"
        // minSdk=28 (Android 9) выбран в том числе потому, что с этой версии
        // платформа нативно декодирует HEIF/HEIC через BitmapFactory - без
        // этого пришлось бы отдельно тянуть кодек. См. docs/ARCHITECTURE.md §2.2.
        minSdk = 28
        targetSdk = 34
        // Номер сборки GitHub Actions - чтобы на телефоне было видно, какая версия установлена.
        val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionCode = buildNumber
        versionName = "0.4.$buildNumber"

        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Robolectric-тесты запускают настоящее приложение (Activity + Compose)
    // на JVM без эмулятора - см. app/src/test/.../AppFlowTest.kt.
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.maxHeapSize = "3g"
            it.systemProperty("robolectric.graphicsMode", "NATIVE")
            it.systemProperty("roborazzi.test.record", "true")
            it.testLogging {
                events("passed", "failed")
                showStandardStreams = true
                exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
            }
        }
    }
}

dependencies {
    implementation(project(":core"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.exifinterface)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
