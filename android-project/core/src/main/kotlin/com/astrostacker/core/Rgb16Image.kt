package com.astrostacker.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Итоговое изображение в sRGB, 16 бит на канал, RGB подряд в одном массиве.
 * В 2 раза компактнее [FloatImage] (6 байт/пиксель вместо 12) и хранит в 256
 * раз больше градаций, чем 8-битный Bitmap - из него пишется TIFF без потерь,
 * а PNG/JPEG получают 8 бит только в момент сохранения.
 */
class Rgb16Image(val width: Int, val height: Int, val data: ShortArray) {

    init {
        require(data.size == width * height * 3) { "data.size=${data.size} != width*height*3" }
    }

    /** Значение канала [c] (0=R,1=G,2=B) пикселя [i] в диапазоне 0..65535. */
    fun value(i: Int, c: Int): Int = data[i * 3 + c].toInt() and 0xFFFF

    /** Пиксели 0xAARRGGBB (8 бит на канал) - для Android Bitmap. */
    fun toArgb8(): IntArray {
        val out = IntArray(width * height)
        for (i in out.indices) {
            val r = value(i, 0) ushr 8
            val g = value(i, 1) ushr 8
            val b = value(i, 2) ushr 8
            out[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        return out
    }

    /** Уменьшенная копия (усреднение блоков) с длинной стороной не больше [maxSide] - для превью на экране. */
    fun downscale(maxSide: Int): Rgb16Image {
        val factor = (max(width, height) + maxSide - 1) / maxSide
        if (factor <= 1) return this
        val w = width / factor
        val h = height / factor
        val out = ShortArray(w * h * 3)
        val area = factor * factor
        for (y in 0 until h) for (x in 0 until w) {
            for (c in 0..2) {
                var sum = 0L
                for (dy in 0 until factor) for (dx in 0 until factor) {
                    sum += value((y * factor + dy) * width + x * factor + dx, c)
                }
                out[(y * w + x) * 3 + c] = (sum / area).toInt().toShort()
            }
        }
        return Rgb16Image(w, h, out)
    }

    /** Поворот на [turns] × 90° по часовой стрелке (без потерь - просто перестановка пикселей). */
    fun rotateQuarterTurns(turns: Int): Rgb16Image {
        val t = ((turns % 4) + 4) % 4
        if (t == 0) return this
        val w2 = if (t % 2 == 0) width else height
        val h2 = if (t % 2 == 0) height else width
        val out = ShortArray(data.size)
        for (y in 0 until height) for (x in 0 until width) {
            val (nx, ny) = when (t) {
                1 -> (height - 1 - y) to x
                2 -> (width - 1 - x) to (height - 1 - y)
                else -> y to (width - 1 - x)
            }
            val src = (y * width + x) * 3
            val dst = (ny * w2 + nx) * 3
            out[dst] = data[src]; out[dst + 1] = data[src + 1]; out[dst + 2] = data[src + 2]
        }
        return Rgb16Image(w2, h2, out)
    }

    /**
     * Поворот на произвольный угол (градусы, по часовой стрелке) вокруг центра,
     * размер холста прежний, уголки за пределами исходного кадра - чёрные.
     * Та же геометрия, что у `graphicsLayer(rotationZ)` в Compose - превью на
     * экране и сохранённый файл совпадают.
     */
    fun rotateDegrees(degrees: Double): Rgb16Image {
        if (abs(degrees) < 1e-6) return this
        val rad = Math.toRadians(degrees)
        val cs = cos(rad); val sn = sin(rad)
        val cx = (width - 1) / 2.0; val cy = (height - 1) / 2.0
        val out = ShortArray(data.size)
        for (y in 0 until height) for (x in 0 until width) {
            // Обратное отображение: откуда в исходнике берётся этот пиксель.
            val dx = x - cx; val dy = y - cy
            val sx = cs * dx + sn * dy + cx
            val sy = -sn * dx + cs * dy + cy
            if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue
            val x0 = sx.toInt().coerceAtMost(width - 2).coerceAtLeast(0)
            val y0 = sy.toInt().coerceAtMost(height - 2).coerceAtLeast(0)
            val fx = sx - x0; val fy = sy - y0
            val dst = (y * width + x) * 3
            for (c in 0..2) {
                val v00 = value(y0 * width + x0, c); val v10 = value(y0 * width + min(x0 + 1, width - 1), c)
                val v01 = value(min(y0 + 1, height - 1) * width + x0, c)
                val v11 = value(min(y0 + 1, height - 1) * width + min(x0 + 1, width - 1), c)
                val top = v00 + (v10 - v00) * fx
                val bottom = v01 + (v11 - v01) * fx
                out[dst + c] = (top + (bottom - top) * fy).roundToInt().coerceIn(0, 65535).toShort()
            }
        }
        return Rgb16Image(width, height, out)
    }

    /** Обрезка по прямоугольнику в долях от размера (0..1). */
    fun crop(rect: CropRect): Rgb16Image {
        val r = rect.normalized()
        val x0 = (r.left * width).roundToInt().coerceIn(0, width - 1)
        val y0 = (r.top * height).roundToInt().coerceIn(0, height - 1)
        val x1 = (r.right * width).roundToInt().coerceIn(x0 + 1, width)
        val y1 = (r.bottom * height).roundToInt().coerceIn(y0 + 1, height)
        if (x0 == 0 && y0 == 0 && x1 == width && y1 == height) return this
        val w = x1 - x0; val h = y1 - y0
        val out = ShortArray(w * h * 3)
        for (y in 0 until h) {
            System.arraycopy(data, ((y0 + y) * width + x0) * 3, out, y * w * 3, w * 3)
        }
        return Rgb16Image(w, h, out)
    }

    companion object {
        /** Из линейного [FloatImage] (как в пайплайне) в sRGB 16 бит. */
        fun fromLinear(image: FloatImage): Rgb16Image {
            val n = image.width * image.height
            val out = ShortArray(n * 3)
            for (i in 0 until n) {
                out[i * 3] = to16(image.r[i]); out[i * 3 + 1] = to16(image.g[i]); out[i * 3 + 2] = to16(image.b[i])
            }
            return Rgb16Image(image.width, image.height, out)
        }

        private fun to16(linear: Float): Short =
            (ColorSpace.linearToSrgb(linear.coerceIn(0f, 1f)) * 65535f + 0.5f).toInt().coerceIn(0, 65535).toShort()
    }
}

/** Прямоугольник обрезки в долях от ширины/высоты (0..1). */
data class CropRect(val left: Float = 0f, val top: Float = 0f, val right: Float = 1f, val bottom: Float = 1f) {
    fun normalized(): CropRect = CropRect(
        min(left, right).coerceIn(0f, 1f), min(top, bottom).coerceIn(0f, 1f),
        max(left, right).coerceIn(0f, 1f), max(top, bottom).coerceIn(0f, 1f)
    )

    fun intersect(o: CropRect): CropRect {
        val r = CropRect(max(left, o.left), max(top, o.top), min(right, o.right), min(bottom, o.bottom))
        return if (r.right - r.left < 0.02f || r.bottom - r.top < 0.02f) o else r
    }

    companion object {
        val FULL = CropRect()
    }
}

/** Параметры "Повернуть и обрезать": сначала повороты на 90°, потом выравнивание горизонта, потом обрезка. */
data class EditParams(
    val quarterTurns: Int = 0,
    val straightenDegrees: Float = 0f,
    val crop: CropRect = CropRect.FULL
) {
    val isIdentity: Boolean get() = quarterTurns % 4 == 0 && straightenDegrees == 0f && crop == CropRect.FULL

    fun applyTo(image: Rgb16Image): Rgb16Image =
        image.rotateQuarterTurns(quarterTurns).rotateDegrees(straightenDegrees.toDouble()).crop(crop)

    companion object {
        /**
         * Наибольший прямоугольник с теми же пропорциями, что и кадр, по
         * центру, целиком внутри повёрнутого на [degrees] кадра - без чёрных уголков.
         */
        fun inscribedCrop(width: Int, height: Int, degrees: Float): CropRect {
            val rad = Math.toRadians(abs(degrees.toDouble()))
            val c = cos(rad); val s = sin(rad)
            val w = width.toDouble(); val h = height.toDouble()
            val scale = min(w / (w * c + h * s), h / (w * s + h * c)).coerceAtMost(1.0)
            val m = ((1 - scale) / 2).toFloat()
            return CropRect(m, m, 1 - m, 1 - m)
        }
    }
}
