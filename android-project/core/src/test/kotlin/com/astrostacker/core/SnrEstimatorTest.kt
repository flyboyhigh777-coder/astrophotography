package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class SnrEstimatorTest {

    /** Тёмный фон с гауссовым шумом [noiseStdDev] + яркое пятно "звезды" в середине кадра, [starLevel] выше фона. */
    private fun syntheticFrame(width: Int, height: Int, backgroundLevel: Int, noiseStdDev: Double, starLevel: Int, seed: Long): Rgb16Image {
        val rnd = Random(seed)
        val data = ShortArray(width * height * 3)
        val cx = width / 2; val cy = height / 2; val starRadius = minOf(width, height) / 8.0
        for (y in 0 until height) for (x in 0 until width) {
            val dx = x - cx; val dy = y - cy
            val onStar = dx * dx + dy * dy < starRadius * starRadius
            val noise = rnd.nextGaussian() * noiseStdDev
            val value = (if (onStar) starLevel.toDouble() else backgroundLevel + noise).coerceIn(0.0, 65535.0).toInt()
            val i = (y * width + x) * 3
            data[i] = value.toShort(); data[i + 1] = value.toShort(); data[i + 2] = value.toShort()
        }
        return Rgb16Image(width, height, data)
    }

    @Test
    fun estimate_flatNoiselessFrame_hasNoSignalAboveBackground() {
        val flat = syntheticFrame(64, 64, backgroundLevel = 5000, noiseStdDev = 0.0, starLevel = 5000, seed = 1)
        val result = SnrEstimator.estimate(flat)
        // Фон и "сигнал" совпадают - шум нулевой, но и сигнала сверх фона нет.
        assertTrue("ожидали SNR около 0 на совершенно плоском кадре, получили ${result.snr}", result.snr < 1.0)
    }

    @Test
    fun estimate_brighterStar_increasesSnr() {
        val dim = SnrEstimator.estimate(syntheticFrame(64, 64, 2000, 200.0, starLevel = 4000, seed = 2))
        val bright = SnrEstimator.estimate(syntheticFrame(64, 64, 2000, 200.0, starLevel = 20000, seed = 2))
        assertTrue("более яркая звезда должна давать более высокий SNR: dim=${dim.snr} bright=${bright.snr}", bright.snr > dim.snr)
    }

    @Test
    fun estimate_noisierBackground_decreasesSnr() {
        val quiet = SnrEstimator.estimate(syntheticFrame(64, 64, 2000, 50.0, starLevel = 10000, seed = 3))
        val noisy = SnrEstimator.estimate(syntheticFrame(64, 64, 2000, 800.0, starLevel = 10000, seed = 3))
        assertTrue("более шумный фон должен давать более низкий SNR: quiet=${quiet.snr} noisy=${noisy.snr}", noisy.snr < quiet.snr)
    }

    @Test
    fun theoreticalGrowthCurve_endsAtFinalSnrAndIsMonotonic() {
        val curve = SnrEstimator.theoreticalGrowthCurve(finalSnr = 10.0, totalFrames = 20, steps = 10)
        assertTrue(curve.isNotEmpty())
        assertTrue("кривая должна заканчиваться близко к финальному SNR, получили ${curve.last()}", kotlin.math.abs(curve.last() - 10.0) < 0.5)
        for (i in 1 until curve.size) {
            assertTrue("кривая должна не убывать: ${curve[i - 1]} -> ${curve[i]}", curve[i] >= curve[i - 1] - 1e-9)
        }
    }

    @Test
    fun theoreticalGrowthCurve_degenerateInputs_returnEmpty() {
        assertTrue(SnrEstimator.theoreticalGrowthCurve(0.0, 10, 5).isEmpty())
        assertTrue(SnrEstimator.theoreticalGrowthCurve(5.0, 0, 5).isEmpty())
    }
}
