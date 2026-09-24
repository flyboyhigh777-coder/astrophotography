package com.astrostacker.core

import kotlin.math.sqrt

/**
 * Общие статистические утилиты с σ-клиппингом, переиспользуемые в детекторе
 * звёзд, удалении градиента фона и нейтрализации цвета (не дублировать логику
 * по трём файлам — она должна вести себя одинаково везде).
 */
object Stats {

    data class ClippedStats(val mean: Double, val stdDev: Double, val median: Double, val count: Int)

    /**
     * Итеративный σ-клиппинг: на каждом шаге отбрасывает значения дальше
     * [kappa]·σ от текущего среднего, затем пересчитывает среднее/σ/медиану по
     * оставшимся. По умолчанию κ=3, 2 итерации — как в StarDetector/DSS-подобных
     * инструментах, см. docs/LITERATURE.md.
     */
    fun sigmaClipped(values: List<Double>, kappa: Double = 3.0, iterations: Int = 2): ClippedStats {
        if (values.isEmpty()) return ClippedStats(0.0, 0.0, 0.0, 0)
        var current = values.sorted()
        for (iter in 0 until iterations) {
            if (current.size < 3) break
            val mean = current.average()
            val sd = sqrt(current.sumByDouble { (it - mean) * (it - mean) } / current.size)
            if (sd < 1e-9) break
            val lower = mean - kappa * sd
            val upper = mean + kappa * sd
            val filtered = current.filter { it in lower..upper }
            if (filtered.isEmpty() || filtered.size == current.size) break
            current = filtered
        }
        val mean = current.average()
        val sd = sqrt(current.sumByDouble { (it - mean) * (it - mean) } / current.size)
        val n = current.size
        val median = if (n % 2 == 1) current[n / 2] else (current[n / 2 - 1] + current[n / 2]) / 2.0
        return ClippedStats(mean, sd, median, n)
    }
}
