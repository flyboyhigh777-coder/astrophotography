package com.astrostacker.core

import kotlin.math.sqrt

/**
 * Грубая оценка отношения сигнал/шум по уже готовому снимку - НЕ по
 * отдельным кадрам в процессе стекинга (такого трекинга по шагам в
 * пайплайне нет, см. docs/ARCHITECTURE.md §4). Шум - среднеквадратичное
 * отклонение яркости в тёмной части кадра (фон неба, без звёзд/туманности);
 * сигнал - насколько ярче фона самая яркая часть кадра (звёзды/туманность).
 * Считается по уже сохранённому [Rgb16Image] (sRGB), а не по линейным
 * значениям пайплайна - `FloatImage` к этому моменту уже освобождён; гамма
 * немного искажает абсолютное число, но для внутренней метрики "лучше/хуже
 * после стекинга" этого достаточно - не выдаём это за научное фотометрическое
 * измерение.
 */
object SnrEstimator {

    data class Estimate(val snr: Double, val backgroundMean: Double, val backgroundNoise: Double, val signalMean: Double)

    private const val BINS = 4096
    private const val LUMA_RANGE = 65536.0

    /**
     * [backgroundPercentile] - доля самых тёмных пикселей по яркости, взятая
     * как фон неба; [signalPercentile] - доля самых ярких, взятая как
     * "сигнал" (звёзды/туманность). Гистограммный подход вместо сортировки
     * всех пикселей - на 100-Мп кадре сортировка выделила бы сотни
     * мегабайт и была бы заметно медленнее.
     */
    fun estimate(image: Rgb16Image, backgroundPercentile: Double = 0.5, signalPercentile: Double = 0.02): Estimate {
        val n = image.width * image.height
        if (n == 0) return Estimate(0.0, 0.0, 0.0, 0.0)

        val hist = IntArray(BINS)
        for (i in 0 until n) {
            val luma = 0.299 * image.value(i, 0) + 0.587 * image.value(i, 1) + 0.114 * image.value(i, 2)
            hist[(luma / LUMA_RANGE * BINS).toInt().coerceIn(0, BINS - 1)]++
        }
        val backgroundMean = weightedMean(hist, n, backgroundPercentile, fromBrightEnd = false)
        val backgroundNoise = weightedStdDev(hist, n, backgroundPercentile, fromBrightEnd = false, backgroundMean)
        val signalMean = weightedMean(hist, n, signalPercentile, fromBrightEnd = true)

        val snr = if (backgroundNoise > 1e-6) (signalMean - backgroundMean) / backgroundNoise else 0.0
        return Estimate(snr.coerceAtLeast(0.0), backgroundMean, backgroundNoise, signalMean)
    }

    private inline fun walkPercentile(hist: IntArray, n: Int, percentile: Double, fromBrightEnd: Boolean, onBin: (binCenter: Double, count: Int) -> Unit) {
        var remaining = (n * percentile).toInt().coerceIn(1, n)
        val binWidth = LUMA_RANGE / BINS
        val range = if (fromBrightEnd) (BINS - 1 downTo 0) else (0 until BINS)
        for (b in range) {
            if (remaining <= 0) break
            val take = minOf(hist[b], remaining)
            if (take > 0) onBin((b + 0.5) * binWidth, take)
            remaining -= take
        }
    }

    private fun weightedMean(hist: IntArray, n: Int, percentile: Double, fromBrightEnd: Boolean): Double {
        var sum = 0.0; var count = 0
        walkPercentile(hist, n, percentile, fromBrightEnd) { center, take -> sum += center * take; count += take }
        return if (count > 0) sum / count else 0.0
    }

    private fun weightedStdDev(hist: IntArray, n: Int, percentile: Double, fromBrightEnd: Boolean, mean: Double): Double {
        var varSum = 0.0; var count = 0
        walkPercentile(hist, n, percentile, fromBrightEnd) { center, take -> val d = center - mean; varSum += d * d * take; count += take }
        return if (count > 0) sqrt(varSum / count) else 0.0
    }

    /** Теоретическая кривая роста SNR ~ sqrt(N) до измеренного [finalSnr] на [totalFrames] кадрах - НЕ замер по шагам (его нет), честная оценка по формуле стекинга независимого шума. */
    fun theoreticalGrowthCurve(finalSnr: Double, totalFrames: Int, steps: Int): List<Double> {
        if (totalFrames < 1 || finalSnr <= 0 || steps < 1) return emptyList()
        return (0..steps).map { i ->
            val n = 1 + i * (totalFrames - 1) / steps
            finalSnr * sqrt(n.toDouble() / totalFrames)
        }
    }
}
