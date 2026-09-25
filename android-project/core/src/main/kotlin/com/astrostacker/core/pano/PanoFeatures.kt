package com.astrostacker.core.pano

import com.astrostacker.core.ColorSpace
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Кадр панорамы: 8-битный sRGB, упакованный 0xAARRGGBB (4 байта/пиксель -
 * в 3 раза компактнее FloatImage, панорама может состоять из десятков кадров).
 * [focal35mm] - эквивалентное фокусное расстояние из EXIF, если есть.
 */
class PanoImage(val width: Int, val height: Int, val argb: IntArray, val focal35mm: Double? = null) {
    init { require(argb.size == width * height) }

    /** Серое изображение (линейная яркость), уменьшенное в [factor] раз усреднением блоков. */
    fun grayDownscaled(factor: Int): Gray {
        val w = width / factor; val h = height / factor
        val out = FloatArray(w * h)
        val area = (factor * factor).toFloat()
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0f
            for (dy in 0 until factor) for (dx in 0 until factor) {
                val p = argb[(y * factor + dy) * width + x * factor + dx]
                s += 0.2126f * lin((p shr 16) and 0xFF) + 0.7152f * lin((p shr 8) and 0xFF) + 0.0722f * lin(p and 0xFF)
            }
            // Для поиска точек удобнее "перцептивная" яркость: корень сглаживает тёмные области.
            out[y * w + x] = sqrt(s / area)
        }
        return Gray(w, h, out)
    }

    private fun lin(v: Int) = ColorSpace.srgbByteToLinear(v)
}

/** Простое одноканальное изображение для поиска особых точек. */
class Gray(val w: Int, val h: Int, val d: FloatArray) {
    operator fun get(x: Int, y: Int) = d[y * w + x]

    fun sample(x: Double, y: Double): Float {
        val xc = x.coerceIn(0.0, w - 1.001); val yc = y.coerceIn(0.0, h - 1.001)
        val x0 = xc.toInt(); val y0 = yc.toInt()
        val fx = (xc - x0).toFloat(); val fy = (yc - y0).toFloat()
        val i = y0 * w + x0
        val top = d[i] + (d[i + 1] - d[i]) * fx
        val bot = d[i + w] + (d[i + w + 1] - d[i + w]) * fx
        return top + (bot - top) * fy
    }

    fun blur(sigma: Double): Gray {
        val r = max(1, (sigma * 3).toInt())
        val k = FloatArray(2 * r + 1) { exp(-((it - r) * (it - r)) / (2 * sigma * sigma)).toFloat() }
        val ks = k.sum(); for (i in k.indices) k[i] /= ks
        val tmp = FloatArray(d.size)
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0f
            for (i in -r..r) s += k[i + r] * d[y * w + (x + i).coerceIn(0, w - 1)]
            tmp[y * w + x] = s
        }
        val out = FloatArray(d.size)
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0f
            for (i in -r..r) s += k[i + r] * tmp[(y + i).coerceIn(0, h - 1) * w + x]
            out[y * w + x] = s
        }
        return Gray(w, h, out)
    }
}

/** Особая точка в координатах ИСХОДНОГО (не уменьшенного) кадра + дескриптор. */
class Feature(val x: Double, val y: Double, val descriptor: FloatArray)

/**
 * Особые точки Харриса + дескрипторы MOPS (Brown, Szeliski, Winder 2005 -
 * "Multi-Image Matching using Multi-Scale Oriented Patches", та же схема,
 * что в AutoStitch): окрестность 40×40, повёрнутая по локальному градиенту,
 * выборка 8×8 с шагом 5 из размытого изображения, нормировка по среднему и
 * разбросу - устойчиво к повороту камеры вокруг оси объектива и к разной
 * экспозиции кадров.
 */
object PanoFeatures {

    data class Config(
        /** Длинная сторона уменьшенного кадра для поиска точек. */
        val workingSize: Int = 1000,
        val maxFeatures: Int = 800,
        /** Сетка для равномерного распределения точек по кадру. */
        val gridX: Int = 16,
        val gridY: Int = 12
    )

    private const val SPACING = 5.0
    private const val HALF = 3.5 // 8 отсчётов: -3.5..3.5 шага

    fun detect(image: PanoImage, config: Config = Config()): List<Feature> {
        val factor = max(1, max(image.width, image.height) / config.workingSize)
        val g = image.grayDownscaled(factor)
        val smooth = g.blur(1.0)
        val w = g.w; val h = g.h

        // Тензор структуры и отклик Харриса (среднее гармоническое собственных значений: det/trace).
        val ixx = FloatArray(w * h); val iyy = FloatArray(w * h); val ixy = FloatArray(w * h)
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val gx = (smooth[x + 1, y] - smooth[x - 1, y]) * 0.5f
            val gy = (smooth[x, y + 1] - smooth[x, y - 1]) * 0.5f
            val i = y * w + x
            ixx[i] = gx * gx; iyy[i] = gy * gy; ixy[i] = gx * gy
        }
        val sxx = Gray(w, h, ixx).blur(1.5); val syy = Gray(w, h, iyy).blur(1.5); val sxy = Gray(w, h, ixy).blur(1.5)
        val resp = FloatArray(w * h)
        for (i in resp.indices) {
            val det = sxx.d[i] * syy.d[i] - sxy.d[i] * sxy.d[i]
            val tr = sxx.d[i] + syy.d[i]
            resp[i] = if (tr > 1e-12f) det / tr else 0f
        }

        // Локальные максимумы, не ближе радиуса окна дескриптора к краю.
        val margin = (HALF * SPACING * 1.5 + 3).toInt()
        val candidates = ArrayList<Triple<Int, Int, Float>>()
        var maxResp = 0f
        for (v in resp) if (v > maxResp) maxResp = v
        val threshold = maxResp * 1e-3f
        for (y in margin until h - margin) for (x in margin until w - margin) {
            val v = resp[y * w + x]
            if (v <= threshold) continue
            var isMax = true
            loop@ for (dy in -1..1) for (dx in -1..1) {
                if ((dx != 0 || dy != 0) && resp[(y + dy) * w + x + dx] >= v) { isMax = false; break@loop }
            }
            if (isMax) candidates.add(Triple(x, y, v))
        }

        // Равномерность: не больше K самых сильных точек в каждой клетке сетки.
        val perCell = max(1, config.maxFeatures / (config.gridX * config.gridY)) * 2
        val cells = HashMap<Int, MutableList<Triple<Int, Int, Float>>>()
        for (c in candidates) {
            val key = (c.second * config.gridY / h) * config.gridX + (c.first * config.gridX / w)
            cells.getOrPut(key) { ArrayList() }.add(c)
        }
        val selected = cells.values.flatMap { list -> list.sortedByDescending { it.third }.take(perCell) }
            .sortedByDescending { it.third }.take(config.maxFeatures)

        val orientSrc = g.blur(4.5)
        val descSrc = g.blur(2.5)
        return selected.map { (x, y, _) ->
            val gx = orientSrc[min(x + 1, w - 1), y] - orientSrc[max(x - 1, 0), y]
            val gy = orientSrc[x, min(y + 1, h - 1)] - orientSrc[x, max(y - 1, 0)]
            val angle = atan2(gy.toDouble(), gx.toDouble())
            val c = cos(angle); val s = sin(angle)
            val desc = FloatArray(64)
            var k = 0
            for (j in 0 until 8) for (i in 0 until 8) {
                val u = (i - HALF) * SPACING; val v = (j - HALF) * SPACING
                desc[k++] = descSrc.sample(x + c * u - s * v, y + s * u + c * v)
            }
            normalize(desc)
            // Субпиксельное уточнение: вершина параболы через отклик соседей.
            val ox = subPixel(resp[y * w + x - 1], resp[y * w + x], resp[y * w + x + 1])
            val oy = subPixel(resp[(y - 1) * w + x], resp[y * w + x], resp[(y + 1) * w + x])
            // Координаты - в пикселях исходного кадра (центр блока уменьшения).
            Feature((x + ox + 0.5) * factor - 0.5, (y + oy + 0.5) * factor - 0.5, desc)
        }
    }

    private fun subPixel(left: Float, center: Float, right: Float): Double {
        val denom = left - 2 * center + right
        if (denom >= 0f) return 0.0
        return (0.5 * (left - right) / denom).coerceIn(-0.5, 0.5)
    }

    private fun normalize(d: FloatArray) {
        var mean = 0f
        for (v in d) mean += v
        mean /= d.size
        var sd = 0f
        for (v in d) sd += (v - mean) * (v - mean)
        sd = sqrt(sd / d.size) + 1e-6f
        for (i in d.indices) d[i] = (d[i] - mean) / sd
    }

    /**
     * Сопоставление по ближайшему соседу с тестом Лоу (второй сосед должен
     * быть заметно дальше) и взаимной проверкой. Возвращает пары индексов (a, b).
     */
    fun match(a: List<Feature>, b: List<Feature>, ratio: Double = 0.75): List<Pair<Int, Int>> {
        if (a.isEmpty() || b.size < 2) return emptyList()
        val bestAB = IntArray(a.size) { -1 }
        val bestBA = IntArray(b.size) { -1 }
        val bestBAdist = FloatArray(b.size) { Float.MAX_VALUE }
        for (i in a.indices) {
            var d1 = Float.MAX_VALUE; var d2 = Float.MAX_VALUE; var j1 = -1
            val da = a[i].descriptor
            for (j in b.indices) {
                val db = b[j].descriptor
                var d = 0f
                for (k in 0 until 64) { val t = da[k] - db[k]; d += t * t }
                if (d < d1) { d2 = d1; d1 = d; j1 = j } else if (d < d2) d2 = d
                if (d < bestBAdist[j]) { bestBAdist[j] = d; bestBA[j] = i }
            }
            if (j1 >= 0 && d1 < ratio * ratio * d2) bestAB[i] = j1
        }
        val out = ArrayList<Pair<Int, Int>>()
        for (i in a.indices) {
            val j = bestAB[i]
            if (j >= 0 && bestBA[j] == i) out.add(i to j)
        }
        return out
    }
}
