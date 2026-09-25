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

    /**
     * То же, что [combine], но по первым [count] значениям [buffer] и без
     * выделения памяти для метода MEAN - вызывается для каждого пикселя
     * кадра, поэтому важна скорость. Порядок значений в [buffer] не меняется.
     */
    fun combinePrefix(buffer: FloatArray, count: Int, config: StackCombinerConfig = StackCombinerConfig()): Float {
        if (count <= 0) return 0f
        if (count == 1) return buffer[0]
        if (config.method != CombineMethod.MEAN) return combine(buffer.copyOf(count), config)
        var lo = Float.NEGATIVE_INFINITY
        var hi = Float.POSITIVE_INFINITY
        var kept = count
        for (iter in 0 until config.clipIterations) {
            if (kept < 3) break
            var sum = 0.0; var n = 0
            for (i in 0 until count) { val v = buffer[i]; if (v >= lo && v <= hi) { sum += v; n++ } }
            val mean = sum / n
            var variance = 0.0
            for (i in 0 until count) { val v = buffer[i]; if (v >= lo && v <= hi) variance += (v - mean) * (v - mean) }
            val sd = sqrt(variance / n)
            if (sd < 1e-9) break
            val newLo = (mean - config.kappaSigmaClip * sd).toFloat()
            val newHi = (mean + config.kappaSigmaClip * sd).toFloat()
            var newKept = 0
            for (i in 0 until count) { val v = buffer[i]; if (v >= lo && v <= hi && v >= newLo && v <= newHi) newKept++ }
            if (newKept == 0 || newKept == kept) break
            lo = maxOf(lo, newLo); hi = minOf(hi, newHi); kept = newKept
        }
        var sum = 0.0; var n = 0
        for (i in 0 until count) { val v = buffer[i]; if (v >= lo && v <= hi) { sum += v; n++ } }
        return if (n > 0) (sum / n).toFloat() else buffer[0]
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
