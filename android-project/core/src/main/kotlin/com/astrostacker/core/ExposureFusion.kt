package com.astrostacker.core

import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Слияние экспозиций (Mertens, Kautz, Van Reeth, 2007 - "Exposure Fusion"):
 * вместо построения карты яркости сцены и подбора кривой тонмаппинга (что
 * требует точных выдержек из EXIF и выбора оператора тонмаппинга - см.
 * обсуждение честности в docs/ARCHITECTURE.md про SnrEstimator) берётся
 * попиксельный вес "насколько этот кадр хорош здесь" (контраст, насыщенность,
 * экспонированность), нормированный по кадрам этого пикселя и смешанный
 * через пирамиду Лапласа (Burt, Adelson, 1983), чтобы на стыках областей с
 * разным весом не было видимых границ/ореолов - наивное попиксельное
 * смешивание даёт на таких границах заметные полосы.
 *
 * Кадры должны быть уже выровнены в одну систему координат (см.
 * [HdrAligner]/[FrameWarp]) - эта функция ничего не совмещает, только
 * смешивает уже наложенные друг на друга кадры.
 */
object ExposureFusion {

    data class Config(
        val contrastWeight: Double = 1.0,
        val saturationWeight: Double = 1.0,
        val exposednessWeight: Double = 1.0,
        /** Сигма гауссианы "хорошей экспозиции" вокруг середины тонового диапазона (0.5). */
        val exposednessSigma: Double = 0.2,
        /** Верхняя граница числа уровней пирамиды - реальное число также ограничено размером кадра. */
        val maxPyramidLevels: Int = 7
    )

    /** [onProgress] - (сколько каналов готово, всего каналов=3), для индикатора прогресса в интерфейсе. */
    fun fuse(images: List<FloatImage>, config: Config = Config(), onProgress: (Int, Int) -> Unit = { _, _ -> }): FloatImage {
        require(images.isNotEmpty()) { "Нужен хотя бы один кадр" }
        val width = images[0].width
        val height = images[0].height
        for (img in images) require(img.width == width && img.height == height) { "Кадры должны быть одного размера (уже выровнены)" }
        if (images.size == 1) return images[0]

        val weights = normalizedWeights(images, config)
        val levels = pyramidLevelCount(width, height, config.maxPyramidLevels)

        val r = fuseChannel(images.map { it.r }, weights, width, height, levels); onProgress(1, 3)
        val g = fuseChannel(images.map { it.g }, weights, width, height, levels); onProgress(2, 3)
        val b = fuseChannel(images.map { it.b }, weights, width, height, levels); onProgress(3, 3)
        return FloatImage(width, height, r, g, b)
    }

    // ---------- Веса ----------

    /** Вес каждого кадра в каждом пикселе, нормированный так, чтобы в сумме по кадрам давать 1. */
    private fun normalizedWeights(images: List<FloatImage>, config: Config): List<FloatArray> {
        val n = images.size
        val size = images[0].width * images[0].height
        val raw = images.map { rawWeight(it, config) }
        val out = List(n) { FloatArray(size) }
        for (i in 0 until size) {
            var sum = 0.0
            for (k in 0 until n) sum += raw[k][i]
            if (sum < 1e-9) {
                val even = (1.0 / n).toFloat()
                for (k in 0 until n) out[k][i] = even
            } else {
                for (k in 0 until n) out[k][i] = (raw[k][i] / sum).toFloat()
            }
        }
        return out
    }

    private fun rawWeight(image: FloatImage, config: Config): DoubleArray {
        val n = image.width * image.height
        val out = DoubleArray(n) { 1.0 }
        if (config.contrastWeight > 0) {
            val contrast = laplacianMagnitude(image.luminance())
            for (i in 0 until n) out[i] *= contrast[i].toDouble().coerceAtLeast(1e-6).pow(config.contrastWeight)
        }
        if (config.saturationWeight > 0) {
            for (i in 0 until n) {
                val mean = (image.r[i] + image.g[i] + image.b[i]) / 3.0
                val dr = image.r[i] - mean; val dg = image.g[i] - mean; val db = image.b[i] - mean
                val sd = sqrt((dr * dr + dg * dg + db * db) / 3.0)
                out[i] *= sd.coerceAtLeast(1e-6).pow(config.saturationWeight)
            }
        }
        if (config.exposednessWeight > 0) {
            val sigma2 = 2.0 * config.exposednessSigma * config.exposednessSigma
            for (i in 0 until n) {
                val e = gauss(image.r[i].toDouble(), sigma2) * gauss(image.g[i].toDouble(), sigma2) * gauss(image.b[i].toDouble(), sigma2)
                out[i] *= e.coerceAtLeast(1e-9).pow(config.exposednessWeight)
            }
        }
        return out
    }

    private fun gauss(v: Double, sigma2: Double): Double {
        val d = v - 0.5
        return exp(-(d * d) / sigma2)
    }

    /** |Лапласиан| яркости - чем резче локальные перепады, тем больше деталей кадр показывает в этом месте. */
    private fun laplacianMagnitude(lum: GrayImage): FloatArray {
        val w = lum.width; val h = lum.height
        val out = FloatArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val c = lum[x, y]
            val up = lum[x, max(0, y - 1)]; val down = lum[x, min(h - 1, y + 1)]
            val left = lum[max(0, x - 1), y]; val right = lum[min(w - 1, x + 1), y]
            out[y * w + x] = Math.abs(up + down + left + right - 4f * c)
        }
        return out
    }

    // ---------- Смешивание одного канала через пирамиду Лапласа ----------

    private fun fuseChannel(channels: List<FloatArray>, weights: List<FloatArray>, w: Int, h: Int, levels: Int): FloatArray {
        val n = channels.size
        val blended = ArrayList<PyramidLevel>(levels)
        val imagePyramids = channels.map { Pyramid.laplacian(it, w, h, levels) }
        val weightPyramids = weights.map { Pyramid.gaussian(it, w, h, levels) }
        for (l in 0 until levels) {
            val lw = imagePyramids[0][l].width
            val lh = imagePyramids[0][l].height
            val acc = FloatArray(lw * lh)
            for (k in 0 until n) {
                val img = imagePyramids[k][l].data
                val wt = weightPyramids[k][l].data
                for (i in acc.indices) acc[i] += img[i] * wt[i]
            }
            blended.add(PyramidLevel(lw, lh, acc))
        }
        return Pyramid.collapseLaplacian(blended)
    }

    private fun pyramidLevelCount(w: Int, h: Int, maxLevels: Int): Int {
        var levels = 1
        var cw = w; var ch = h
        while (levels < maxLevels && cw > 4 && ch > 4) {
            cw = (cw + 1) / 2; ch = (ch + 1) / 2
            levels++
        }
        return levels
    }
}

/** Один уровень пирамиды: [data] размера [width]×[height] (row-major). */
private data class PyramidLevel(val width: Int, val height: Int, val data: FloatArray)

/**
 * Пирамиды Гаусса/Лапласа (Burt, Adelson, 1983): REDUCE - размытие 5-тапным
 * биномиальным ядром [1,4,6,4,1]/16 (сепарабельно по x и y) + прореживание
 * вдвое; EXPAND - обратная операция (вставка нулей + то же ядро, умноженное
 * на 4 - компенсация потери энергии после вставки нулей). Отражение на
 * границах (reflect), а не обрезка нулями - иначе края кадра темнеют.
 */
private object Pyramid {

    private val KERNEL = doubleArrayOf(1.0, 4.0, 6.0, 4.0, 1.0).map { it / 16.0 }.toDoubleArray()

    fun gaussian(data: FloatArray, w: Int, h: Int, levels: Int): List<PyramidLevel> {
        val out = ArrayList<PyramidLevel>(levels)
        var current = PyramidLevel(w, h, data)
        out.add(current)
        repeat(levels - 1) { current = reduce(current); out.add(current) }
        return out
    }

    /** Уровни 0..levels-2 - полосовые детали; последний - самый грубый уровень Гаусса (низкие частоты). */
    fun laplacian(data: FloatArray, w: Int, h: Int, levels: Int): List<PyramidLevel> {
        val g = gaussian(data, w, h, levels)
        val out = ArrayList<PyramidLevel>(levels)
        for (l in 0 until levels - 1) {
            val expanded = expandTo(g[l + 1], g[l].width, g[l].height)
            val diff = FloatArray(g[l].data.size) { i -> g[l].data[i] - expanded.data[i] }
            out.add(PyramidLevel(g[l].width, g[l].height, diff))
        }
        out.add(g.last())
        return out
    }

    fun collapseLaplacian(levels: List<PyramidLevel>): FloatArray {
        var current = levels.last()
        for (l in levels.size - 2 downTo 0) {
            val expanded = expandTo(current, levels[l].width, levels[l].height)
            val sum = FloatArray(levels[l].data.size) { i -> expanded.data[i] + levels[l].data[i] }
            current = PyramidLevel(levels[l].width, levels[l].height, sum)
        }
        return current.data
    }

    private fun reduce(level: PyramidLevel): PyramidLevel {
        val blurred = blur(level)
        val nw = (level.width + 1) / 2
        val nh = (level.height + 1) / 2
        val out = FloatArray(nw * nh)
        for (y in 0 until nh) for (x in 0 until nw) {
            val sx = min(x * 2, level.width - 1)
            val sy = min(y * 2, level.height - 1)
            out[y * nw + x] = blurred[sy * level.width + sx]
        }
        return PyramidLevel(nw, nh, out)
    }

    /** Увеличивает вдвое и обрезает/дополняет точно до [targetW]×[targetH] (нужно для нечётных исходных размеров). */
    private fun expandTo(level: PyramidLevel, targetW: Int, targetH: Int): PyramidLevel {
        val w2 = level.width * 2
        val h2 = level.height * 2
        val up = FloatArray(w2 * h2)
        for (y in 0 until level.height) for (x in 0 until level.width) {
            up[(y * 2) * w2 + (x * 2)] = level.data[y * level.width + x]
        }
        val blurred = blur(PyramidLevel(w2, h2, up))
        val out = FloatArray(targetW * targetH)
        for (y in 0 until targetH) for (x in 0 until targetW) {
            // w2,h2 >= targetW,targetH всегда (reduce всегда округляет вверх) - обрезаем лишнее.
            out[y * targetW + x] = blurred[min(y, h2 - 1) * w2 + min(x, w2 - 1)] * 4f
        }
        return PyramidLevel(targetW, targetH, out)
    }

    private fun blur(level: PyramidLevel): FloatArray {
        val w = level.width; val h = level.height; val d = level.data
        val tmp = FloatArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            var sum = 0.0
            for (k in -2..2) sum += KERNEL[k + 2] * d[y * w + reflect(x + k, w)]
            tmp[y * w + x] = sum.toFloat()
        }
        val out = FloatArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            var sum = 0.0
            for (k in -2..2) sum += KERNEL[k + 2] * tmp[reflect(y + k, h) * w + x]
            out[y * w + x] = sum.toFloat()
        }
        return out
    }

    private fun reflect(i: Int, n: Int): Int {
        if (n <= 1) return 0
        var v = i
        if (v < 0) v = -v
        if (v >= n) v = 2 * n - 2 - v
        return v.coerceIn(0, n - 1)
    }
}
