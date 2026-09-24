package com.astrostacker.core

/** Одноканальное изображение с плавающей точкой (яркость, маска, карта фона...). */
class GrayImage(val width: Int, val height: Int, val data: FloatArray) {

    init {
        require(data.size == width * height) { "data.size=${data.size} != width*height=${width * height}" }
    }

    operator fun get(x: Int, y: Int): Float = data[y * width + x]
    operator fun set(x: Int, y: Int, v: Float) { data[y * width + x] = v }

    companion object {
        fun filled(width: Int, height: Int, value: Float = 0f): GrayImage =
            GrayImage(width, height, FloatArray(width * height) { value })
    }
}

/** RGB-изображение с плавающей точкой, значения обычно в диапазоне 0..1 (линейные, после декодирования гаммы). */
class FloatImage(val width: Int, val height: Int, val r: FloatArray, val g: FloatArray, val b: FloatArray) {

    init {
        val n = width * height
        require(r.size == n && g.size == n && b.size == n) { "несовпадение размера каналов" }
    }

    /** Яркость по весам Rec.709. */
    fun luminance(): GrayImage {
        val out = FloatArray(width * height)
        for (i in out.indices) out[i] = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
        return GrayImage(width, height, out)
    }

    /** Билинейная выборка в произвольной (нецелой) точке; вне кадра — null. */
    fun sampleBilinear(x: Double, y: Double): FloatArray? {
        if (x < 0.0 || y < 0.0 || x > width - 1.0 || y > height - 1.0) return null
        val x0 = x.toInt().coerceIn(0, width - 1)
        val y0 = y.toInt().coerceIn(0, height - 1)
        val x1 = (x0 + 1).coerceAtMost(width - 1)
        val y1 = (y0 + 1).coerceAtMost(height - 1)
        val fx = (x - x0).toFloat()
        val fy = (y - y0).toFloat()
        val out = FloatArray(3)
        val channels = arrayOf(r, g, b)
        for (c in 0..2) {
            val ch = channels[c]
            val i00 = y0 * width + x0; val i10 = y0 * width + x1
            val i01 = y1 * width + x0; val i11 = y1 * width + x1
            val top = ch[i00] + (ch[i10] - ch[i00]) * fx
            val bottom = ch[i01] + (ch[i11] - ch[i01]) * fx
            out[c] = top + (bottom - top) * fy
        }
        return out
    }

    companion object {
        fun filled(width: Int, height: Int, value: Float = 0f): FloatImage {
            val n = width * height
            return FloatImage(width, height, FloatArray(n) { value }, FloatArray(n) { value }, FloatArray(n) { value })
        }
    }
}
