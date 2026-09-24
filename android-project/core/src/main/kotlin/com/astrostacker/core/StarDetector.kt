package com.astrostacker.core

import kotlin.math.max
import kotlin.math.min

data class Star(val x: Double, val y: Double, val flux: Double, val area: Int, val peak: Float)

data class StarDetectorConfig(
    val cellSize: Int = 32,
    val thresholdSigma: Double = 5.0,
    val minArea: Int = 2,
    val maxArea: Int = 500,
    val maxElongation: Double = 4.0,
    val maxStars: Int = 200
)

/**
 * Детектор звёзд: локальный фон по сетке ячеек с σ-клиппингом → порог
 * `фон+k·σ` → связные компоненты (flood fill) → фильтр по площади/вытянутости
 * → интенсивностно-взвешенный центроид. См. docs/LITERATURE.md §1
 * (Bertin & Arnouts 1996; практика DeepSkyStacker).
 */
object StarDetector {

    fun detect(image: GrayImage, config: StarDetectorConfig = StarDetectorConfig()): List<Star> {
        val (background, sigma) = estimateBackground(image, config.cellSize)
        val visited = BooleanArray(image.width * image.height)
        val stars = ArrayList<Star>()
        val stackCapacity = config.maxArea + 32
        val stackX = IntArray(stackCapacity)
        val stackY = IntArray(stackCapacity)

        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                val idx = y * image.width + x
                if (visited[idx]) continue
                val v = image[x, y]
                val threshold = background[x, y] + config.thresholdSigma.toFloat() * sigma[x, y]
                if (v <= threshold) { visited[idx] = true; continue }

                var sp = 0
                stackX[sp] = x; stackY[sp] = y; sp++
                visited[idx] = true

                var minX = x; var maxX = x; var minY = y; var maxY = y
                var sumW = 0.0; var sumWx = 0.0; var sumWy = 0.0
                var peak = Float.NEGATIVE_INFINITY
                var area = 0
                var overflowed = false

                while (sp > 0) {
                    sp--
                    val cx = stackX[sp]; val cy = stackY[sp]
                    val cv = image[cx, cy]
                    val cbg = background[cx, cy]
                    val w = (cv - cbg).toDouble().coerceAtLeast(0.0)
                    sumW += w; sumWx += w * cx; sumWy += w * cy
                    area++
                    if (cv > peak) peak = cv
                    if (cx < minX) minX = cx
                    if (cx > maxX) maxX = cx
                    if (cy < minY) minY = cy
                    if (cy > maxY) maxY = cy

                    if (area > config.maxArea) { overflowed = true; break }

                    val nOffsets = intArrayOf(-1, 0, 1, 0, 0, -1, 0, 1)
                    var k = 0
                    while (k < nOffsets.size) {
                        val nx = cx + nOffsets[k]; val ny = cy + nOffsets[k + 1]; k += 2
                        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue
                        val nIdx = ny * image.width + nx
                        if (visited[nIdx]) continue
                        val nv = image[nx, ny]
                        val nThreshold = background[nx, ny] + config.thresholdSigma.toFloat() * sigma[nx, ny]
                        visited[nIdx] = true
                        if (nv > nThreshold) {
                            if (sp < stackCapacity) { stackX[sp] = nx; stackY[sp] = ny; sp++ }
                            else overflowed = true
                        }
                    }
                }
                if (overflowed || area < config.minArea) continue

                val w = (maxX - minX + 1).toDouble()
                val h = (maxY - minY + 1).toDouble()
                val elongation = max(w, h) / min(w, h)
                if (elongation > config.maxElongation) continue
                if (sumW <= 0.0) continue

                stars.add(Star(sumWx / sumW, sumWy / sumW, sumW, area, peak))
            }
        }
        return stars.sortedByDescending { it.flux }.take(config.maxStars)
    }

    /**
     * Оценка локального фона и его σ по сетке ячеек размера [cellSize] с
     * σ-клиппингом (см. [Stats]) внутри каждой ячейки, растянутая (nearest) до
     * полного разрешения. Для порога детекции гладкость не критична (в отличие
     * от BackgroundExtractor, который вычитается из финальной картинки).
     */
    private fun estimateBackground(image: GrayImage, cellSize: Int): Pair<GrayImage, GrayImage> {
        val cols = (image.width + cellSize - 1) / cellSize
        val rows = (image.height + cellSize - 1) / cellSize
        val cellBg = FloatArray(cols * rows)
        val cellSigma = FloatArray(cols * rows)

        for (cy in 0 until rows) {
            for (cx in 0 until cols) {
                val x0 = cx * cellSize; val x1 = min(x0 + cellSize, image.width)
                val y0 = cy * cellSize; val y1 = min(y0 + cellSize, image.height)
                val values = ArrayList<Double>((x1 - x0) * (y1 - y0))
                for (yy in y0 until y1) for (xx in x0 until x1) values.add(image[xx, yy].toDouble())

                val stats = Stats.sigmaClipped(values)
                val idx = cy * cols + cx
                cellBg[idx] = stats.mean.toFloat()
                cellSigma[idx] = max(stats.stdDev.toFloat(), 1e-6f)
            }
        }

        val bgFull = FloatArray(image.width * image.height)
        val sgFull = FloatArray(image.width * image.height)
        for (y in 0 until image.height) {
            val cy = min(y / cellSize, rows - 1)
            for (x in 0 until image.width) {
                val cx = min(x / cellSize, cols - 1)
                val idx = y * image.width + x
                bgFull[idx] = cellBg[cy * cols + cx]
                sgFull[idx] = cellSigma[cy * cols + cx]
            }
        }
        return Pair(GrayImage(image.width, image.height, bgFull), GrayImage(image.width, image.height, sgFull))
    }
}
