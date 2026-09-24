package com.astrostacker.core

import kotlin.math.abs

/**
 * Модель видимого вращения звёздного неба из-за вращения Земли.
 * Используется как диагностика в UI и апостериорная проверка результата
 * [FrameRegistrator] — НЕ как вход в сам алгоритм подгонки преобразования.
 * Вывод константы и обоснование — см. docs/LITERATURE.md §2.1-2.2.
 */
object EarthRotationModel {

    /** Длина звёздных суток, секунды (источник: Wikipedia, "Sidereal time"). */
    const val SIDEREAL_DAY_SECONDS: Double = 86164.0905

    /** Угловая скорость вращения звёздного неба, угловые секунды в секунду. ≈15.041″/с. */
    val SIDEREAL_RATE_ARCSEC_PER_SEC: Double = 360.0 * 3600.0 / SIDEREAL_DAY_SECONDS

    /** Ожидаемый МОДУЛЬ поворота звёздного поля за промежуток времени [deltaSeconds], в градусах. */
    fun expectedRotationDegrees(deltaSeconds: Double): Double =
        SIDEREAL_RATE_ARCSEC_PER_SEC * abs(deltaSeconds) / 3600.0

    fun expectedRotationRadians(deltaSeconds: Double): Double =
        Math.toRadians(expectedRotationDegrees(deltaSeconds))
}
