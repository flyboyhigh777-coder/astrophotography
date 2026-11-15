package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt

class ExposureFusionTest {

    private fun solidImage(width: Int, height: Int, value: Float): FloatImage = FloatImage.filled(width, height, value)

    /** Серое (r=g=b) изображение: внутри [range] - шахматный паттерн [low]/[high] (блоки 4x4), снаружи - сплошная заливка [outside]. */
    private fun patternedImage(width: Int, height: Int, range: IntRange, outside: Float, low: Float, high: Float): FloatImage {
        val n = width * height
        val ch = FloatArray(n) { i ->
            val x = i % width; val y = i / width
            if (x in range) { if ((x / 4 + y / 4) % 2 == 0) low else high } else outside
        }
        return FloatImage(width, height, ch.copyOf(), ch.copyOf(), ch.copyOf())
    }

    private fun stdDev(image: FloatImage, xRange: IntRange): Double {
        val m = mean(image, xRange)
        var variance = 0.0; var count = 0
        for (y in 0 until image.height) for (x in xRange) { val d = image.r[y * image.width + x] - m; variance += d * d; count++ }
        return sqrt(variance / count)
    }

    private fun mean(image: FloatImage, xRange: IntRange): Double {
        var sum = 0.0; var count = 0
        for (y in 0 until image.height) for (x in xRange) { sum += image.r[y * image.width + x]; count++ }
        return sum / count
    }

    @Test
    fun fuse_singleImage_returnsSameInstance() {
        val img = patternedImage(20, 20, 0 until 20, outside = 0.5f, low = 0.3f, high = 0.7f)
        assertTrue(ExposureFusion.fuse(listOf(img)) === img)
    }

    @Test
    fun fuse_recoversDetailInBothShadowsAndHighlights() {
        val width = 96; val height = 48
        val shadowRange = 0 until 48
        val highlightRange = 48 until 96

        // Низкая экспозиция: тени проработаны (чёткий паттерн 0.3/0.7), света пересвечены (ровная заливка 1.0, без деталей).
        val lowExposure = patternedImage(width, height, shadowRange, outside = 1f, low = 0.3f, high = 0.7f)
        // Высокая экспозиция: тени "задавлены" в чёрный (0.0, без деталей), света проработаны (тот же паттерн).
        val highExposure = patternedImage(width, height, highlightRange, outside = 0f, low = 0.3f, high = 0.7f)

        val fused = ExposureFusion.fuse(listOf(lowExposure, highExposure))

        // В тенях должен остаться контраст из lowExposure, а не пересвеченная заливка из highExposure.
        val shadowStd = stdDev(fused, shadowRange)
        assertTrue("нет детализации в тенях: std=$shadowStd", shadowStd > 0.1)
        // В светах - контраст из highExposure, а не чёрная заливка из lowExposure.
        val highlightStd = stdDev(fused, highlightRange)
        assertTrue("нет детализации в светах: std=$highlightStd", highlightStd > 0.1)
        // Средний уровень в обеих областях - нормальный тон, а не крайнее значение источника-"неудачника".
        assertTrue("тени пересвечены/недосвечены: mean=${mean(fused, shadowRange)}", mean(fused, shadowRange) in 0.2..0.8)
        assertTrue("света пересвечены/недосвечены: mean=${mean(fused, highlightRange)}", mean(fused, highlightRange) in 0.2..0.8)
    }

    @Test(expected = IllegalArgumentException::class)
    fun fuse_mismatchedSizes_throws() {
        val a = solidImage(10, 10, 0.5f)
        val b = solidImage(20, 10, 0.5f)
        ExposureFusion.fuse(listOf(a, b))
    }
}
