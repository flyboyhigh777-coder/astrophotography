package com.astrostacker.core

import kotlin.math.sqrt

enum class CombineMethod { MEAN, MEDIAN, TRIMMED_MEAN }

data class StackCombinerConfig(
    val method: CombineMethod = CombineMethod.MEAN,
    val kappaSigmaClip: Double = 2.5,
    val clipIterations: Int = 2,
    val trimmedMeanCenterPercentile: Double = 0.40,
    val trimmedMeanFraction: Double = 0.50
)

/**
 * Комбинирование значений одного пикселя из N зарегистрированных кадров с
 * отбраковкой выбросов: κ-σ клиппинг (практика DeepSkyStacker) или усечённое
 * среднее (практика Starry Landscape Stacker). См. docs/LITERATURE.md §3.
 */
object StackCombiner {

    /** [values] — значения одного и того же (выровненного) пикселя во всех кадрах, где он виден. */
    fun combine(values: FloatArray, config: StackCombinerConfig = StackCombinerConfig()): Float {
        if (values.isEmpty()) return 0f
        if (values.size == 1) return values[0]

        return when (config.method) {
            CombineMethod.MEAN -> kappaSigmaMean(values, config)
            CombineMethod.MEDIAN -> median(values.copyOf())
            CombineMethod.TRIMMED_MEAN -> trimmedMean(values.copyOf(), config)
        }
    }

    private fun kappaSigmaMean(values: FloatArray, config: StackCombinerConfig): Float {
        var current = values.copyOf()
        repeat(config.clipIterations) {
            if (current.size < 3) return@repeat
            var mean = 0.0
            for (v in current) mean += v
            mean /= current.size
            var variance = 0.0
            for (v in current) variance += (v - mean) * (v - mean)
            val sd = sqrt(variance / current.size)
            if (sd < 1e-9) return@repeat
            val lower = mean - config.kappaSigmaClip * sd
            val upper = mean + config.kappaSigmaClip * sd
            val filtered = current.filter { it in lower..upper }
            if (filtered.isEmpty() || filtered.size == current.size) return@repeat
            current = filtered.toFloatArray()
        }
        var sum = 0.0
        for (v in current) sum += v
        return (sum / current.size).toFloat()
    }

    private fun median(values: FloatArray): Float {
        values.sort()
        val n = values.size
        return if (n % 2 == 1) values[n / 2] else (values[n / 2 - 1] + values[n / 2]) / 2f
    }

    private fun trimmedMean(values: FloatArray, config: StackCombinerConfig): Float {
        values.sort()
        val n = values.size
        val centerIdx = (config.trimmedMeanCenterPercentile * (n - 1)).toInt().coerceIn(0, n - 1)
        val halfWindow = (config.trimmedMeanFraction * n / 2.0).toInt().coerceAtLeast(1)
        val lo = (centerIdx - halfWindow).coerceIn(0, n - 1)
        val hi = (centerIdx + halfWindow).coerceIn(0, n - 1)
        var sum = 0.0
        var count = 0
        for (i in lo..hi) { sum += values[i]; count++ }
        return if (count > 0) (sum / count).toFloat() else values[centerIdx]
    }
}
