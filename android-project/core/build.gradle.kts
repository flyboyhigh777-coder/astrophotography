// :core - чистый Kotlin/JVM модуль, без Android SDK (см. docs/ARCHITECTURE.md §1-2).
// Компилируется и тестируется даже без установленного Android SDK - подтверждено
// в этой же сборке напрямую компилятором kotlinc, см. docs/TEST_RESULTS.md.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    testImplementation(libs.junit4)
}

tasks.test {
    useJUnit()
}
