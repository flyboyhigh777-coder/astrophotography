package com.astrostacker.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.astrostacker.app.ui.AstroStackerRoot
import com.astrostacker.app.ui.theme.AstroStackerTheme

/**
 * Единственная Activity приложения (см. docs/ARCHITECTURE.md §2.2 - три
 * экрана переключаются `when`-ом внутри Compose, без Navigation-Compose и без
 * нескольких Activity). Классический (не edge-to-edge) стиль системных
 * панелей - см. `res/values/themes.xml`, где `statusBarColor`/
 * `navigationBarColor` уже заданы явно; включать edge-to-edge поверх этого
 * значило бы завести ещё один непроверенный здесь пласт кода (отступы под
 * системные панели в каждом из трёх экранов) без реальной необходимости для
 * v1 (targetSdk=34 - принудительный edge-to-edge Android 15/API 35 нас пока
 * не касается).
 */
class MainActivity : ComponentActivity() {

    private val viewModel: ProcessingViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AstroStackerTheme {
                AstroStackerRoot(viewModel)
            }
        }
    }
}
