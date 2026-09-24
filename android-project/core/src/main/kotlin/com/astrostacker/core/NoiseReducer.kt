package com.astrostacker.core

/**
 * Лёгкое шумоподавление: переводит в YCbCr (стандартная матрица JPEG/Rec.601 —
 * см. константы ниже), применяет медианный фильтр только к цветовым (Cb,Cr)
 * каналам (глаз менее чувствителен к цветовому шуму, чем к потере яркостной
 * детализации — см. docs/LITERATURE.md §6), яркость (Y) не трогает: основной
 * выигрыш по шуму уже даёт сам стекинг (см. §3).
 */
object NoiseReducer {

    fun reduceChromaNoise(image: FloatImage, radius: Int = 1): FloatImage {
        val n = image.width * image.height
        val y = FloatArray(n); val cb = FloatArray(n); val cr = FloatArray(n)
        for (i in 0 until n) {
            val r = image.r[i]; val g = image.g[i]; val b = image.b[i]
            y[i] = 0.299f * r + 0.587f * g + 0.114f * b
            cb[i] = -0.168736f * r - 0.331264f * g + 0.5f * b
            cr[i] = 0.5f * r - 0.418688f * g - 0.081312f * b
        }

        val cbFiltered = medianFilter(cb, image.width, image.height, radius)
        val crFiltered = medianFilter(cr, image.width, image.height, radius)

        val outR = FloatArray(n); val outG = FloatArray(n); val outB = FloatArray(n)
        for (i in 0 until n) {
            val yy = y[i]; val cbb = cbFiltered[i]; val crr = crFiltered[i]
            outR[i] = (yy + 1.402f * crr).coerceIn(0f, 1f)
            outG[i] = (yy - 0.344136f * cbb - 0.714136f * crr).coerceIn(0f, 1f)
            outB[i] = (yy + 1.772f * cbb).coerceIn(0f, 1f)
        }
        return FloatImage(image.width, image.height, outR, outG, outB)
    }

    private fun medianFilter(data: FloatArray, width: Int, height: Int, radius: Int): FloatArray {
        val out = FloatArray(data.size)
        val windowSize = (2 * radius + 1) * (2 * radius + 1)
        val window = FloatArray(windowSize)
        for (y in 0 until height) {
            for (x in 0 until width) {
                var k = 0
                for (dy in -radius..radius) {
                    val yy = (y + dy).coerceIn(0, height - 1)
                    for (dx in -radius..radius) {
                        val xx = (x + dx).coerceIn(0, width - 1)
                        window[k] = data[yy * width + xx]
                        k++
                    }
                }
                window.sort()
                out[y * width + x] = window[windowSize / 2]
            }
        }
        return out
    }
}
