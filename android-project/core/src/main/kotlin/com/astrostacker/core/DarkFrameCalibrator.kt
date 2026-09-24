package com.astrostacker.core

/**
 * Калибровка по тёмным кадрам (та же выдержка/ISO, объектив закрыт): строит
 * карту "горячих" пикселей по медиане тёмных кадров и интерполирует их по
 * соседям на каждом световом кадре до регистрации. См. docs/LITERATURE.md §3
 * (практика DeepSkyStacker). Необязательный шаг — используется, только если
 * пользователь предоставил тёмные кадры.
 */
object DarkFrameCalibrator {

    data class Config(val thresholdSigma: Double = 6.0)

    fun buildHotPixelMask(darkFrames: List<GrayImage>, config: Config = Config()): Array<BooleanArray> {
        require(darkFrames.isNotEmpty()) { "Нужен хотя бы один тёмный кадр" }
        val width = darkFrames[0].width
        val height = darkFrames[0].height

        val masterDark = FloatArray(width * height)
        val perPixel = DoubleArray(darkFrames.size)
        for (y in 0 until height) {
            for (x in 0 until width) {
                for (fi in darkFrames.indices) perPixel[fi] = darkFrames[fi][x, y].toDouble()
                val sorted = perPixel.sorted()
                val n = sorted.size
                val median = if (n % 2 == 1) sorted[n / 2] else (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
                masterDark[y * width + x] = median.toFloat()
            }
        }

        val globalStats = Stats.sigmaClipped(masterDark.map { it.toDouble() })
        val threshold = globalStats.mean + config.thresholdSigma * globalStats.stdDev

        val mask = Array(height) { BooleanArray(width) }
        for (y in 0 until height) {
            for (x in 0 until width) {
                mask[y][x] = masterDark[y * width + x] > threshold
            }
        }
        return mask
    }

    /** Заменяет отмеченные [hotPixelMask] пиксели средним по не-горячим соседям (3x3). */
    fun applyCalibration(image: FloatImage, hotPixelMask: Array<BooleanArray>): FloatImage {
        val outR = image.r.copyOf(); val outG = image.g.copyOf(); val outB = image.b.copyOf()
        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                if (!hotPixelMask[y][x]) continue
                var sumR = 0f; var sumG = 0f; var sumB = 0f; var count = 0
                for (dy in -1..1) {
                    for (dx in -1..1) {
                        if (dx == 0 && dy == 0) continue
                        val xx = x + dx; val yy = y + dy
                        if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue
                        if (hotPixelMask[yy][xx]) continue
                        val idx = yy * image.width + xx
                        sumR += image.r[idx]; sumG += image.g[idx]; sumB += image.b[idx]
                        count++
                    }
                }
                if (count > 0) {
                    val idx = y * image.width + x
                    outR[idx] = sumR / count; outG[idx] = sumG / count; outB[idx] = sumB / count
                }
            }
        }
        return FloatImage(image.width, image.height, outR, outG, outB)
    }
}
