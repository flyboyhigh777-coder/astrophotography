package com.astrostacker.app

import android.app.Application

/**
 * Точка входа приложения. Явного DI-фреймворка (Hilt/Koin) в v1 нет: единственная
 * зависимость от `Context`, которая нужна `ProcessingViewModel`/`ExportRepository`/
 * `ImageDecoding`, покрывается обычным `AndroidViewModel` (получает `Application`
 * от системы) без отдельного контейнера. Класс объявлен (`android:name` в
 * `AndroidManifest.xml`) на случай будущей инициализации (например, логирования
 * необработанных исключений при реальном тестировании на устройстве) - сейчас пуст.
 */
class AstroStackerApp : Application()
