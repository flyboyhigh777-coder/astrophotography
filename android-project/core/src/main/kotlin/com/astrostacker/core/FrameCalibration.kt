package com.astrostacker.core

/**
 * Калибровка световых кадров по калибровочным кадрам — стандартная схема
 * Siril / DeepSkyStacker / PixInsight:
 *
 *     калиброванный = (кадр − мастер-дарк) / нормированный(мастер-флэт − мастер-биас)
 *
 *  - **Дарки** (тёмные кадры): та же выдержка и ISO, объектив закрыт. Содержат
 *    тепловой шум, "горячие" пиксели, засветку от электроники И смещение (bias),
 *    поэтому при наличии дарков биас из светового кадра отдельно не вычитается.
 *  - **Биасы** (кадры смещения): самая короткая выдержка, тот же ISO, объектив
 *    закрыт. Нужны для флэтов (флэт − биас); без дарков вычитаются и из
 *    световых кадров.
 *  - **Флэты** (плоские поля): равномерно освещённый объектив (белый экран,
 *    рассветное небо через ткань), та же диафрагма и фокус. Исправляют
 *    виньетирование и пылинки делением.
 *
 * Мастер-кадр — среднее всех кадров своего типа; строится через
 * [MasterAccumulator] по одному кадру, чтобы не держать всю серию в памяти.
 */
object FrameCalibration {

    /** Готовые мастер-кадры; любой может отсутствовать. */
    class Masters(
        val dark: FloatImage?,
        val bias: FloatImage?,
        /** Флэт, уже приведённый к среднему 1.0 по каждому каналу. */
        val normalizedFlat: FloatImage?,
        /** Горячие пиксели по мастер-дарку (для точечной замены соседями). */
        val hotPixels: Array<BooleanArray>?
    ) {
        val isEmpty: Boolean get() = dark == null && bias == null && normalizedFlat == null
    }

    /** Накопитель среднего по кадрам одного типа — добавляем кадры по одному. */
    class MasterAccumulator {
        private var sumR: FloatArray? = null
        private var sumG: FloatArray? = null
        private var sumB: FloatArray? = null
        private var width = 0
        private var height = 0
        var count = 0
            private set

        /** Возвращает false, если размер кадра не совпадает с первым (кадр пропускается). */
        fun add(image: FloatImage): Boolean {
            if (count == 0) {
                width = image.width; height = image.height
                val n = width * height
                sumR = FloatArray(n); sumG = FloatArray(n); sumB = FloatArray(n)
            } else if (image.width != width || image.height != height) {
                return false
            }
            val r = sumR!!; val g = sumG!!; val b = sumB!!
            for (i in r.indices) { r[i] += image.r[i]; g[i] += image.g[i]; b[i] += image.b[i] }
            count++
            return true
        }

        fun mean(): FloatImage? {
            if (count == 0) return null
            val inv = 1f / count
            val r = sumR!!; val g = sumG!!; val b = sumB!!
            return FloatImage(
                width, height,
                FloatArray(r.size) { r[it] * inv },
                FloatArray(g.size) { g[it] * inv },
                FloatArray(b.size) { b[it] * inv }
            )
        }
    }

    /** Флэт с долей ниже этой от среднего считается браком (край кадра, пыль) — делить на почти ноль нельзя. */
    private const val MIN_FLAT_LEVEL = 0.1f

    fun buildMasters(darkMean: FloatImage?, biasMean: FloatImage?, flatMean: FloatImage?): Masters {
        val normalizedFlat = flatMean?.let { flat ->
            val corrected = if (biasMean != null && sameSize(flat, biasMean)) subtract(flat, biasMean) else flat
            normalizePerChannel(corrected)
        }
        val hotPixels = darkMean?.let { DarkFrameCalibrator.buildHotPixelMask(listOf(it.luminance())) }
        return Masters(darkMean, biasMean, normalizedFlat, hotPixels)
    }

    /**
     * Применяет калибровку к одному световому кадру. Мастер-кадры другого
     * размера (снято в другом разрешении) молча пропускаются, а не ломают
     * обработку.
     */
    /**
     * [subtractDark] = false - для кадров с другой выдержкой (например,
     * отдельные снимки земли): дарк от основной серии к ним не подходит,
     * вычитается только биас, остаются флэт и исправление горячих пикселей.
     */
    fun calibrate(light: FloatImage, masters: Masters, subtractDark: Boolean = true): FloatImage {
        if (masters.isEmpty) return light
        val offset = when {
            subtractDark && masters.dark != null && sameSize(light, masters.dark) -> masters.dark
            masters.bias != null && sameSize(light, masters.bias) -> masters.bias
            else -> null
        }
        val flat = masters.normalizedFlat?.takeIf { sameSize(light, it) }

        val n = light.width * light.height
        val r = FloatArray(n); val g = FloatArray(n); val b = FloatArray(n)
        for (i in 0 until n) {
            var vr = light.r[i]; var vg = light.g[i]; var vb = light.b[i]
            if (offset != null) { vr -= offset.r[i]; vg -= offset.g[i]; vb -= offset.b[i] }
            if (flat != null) { vr /= flat.r[i]; vg /= flat.g[i]; vb /= flat.b[i] }
            r[i] = vr.coerceIn(0f, 1f); g[i] = vg.coerceIn(0f, 1f); b[i] = vb.coerceIn(0f, 1f)
        }
        var out = FloatImage(light.width, light.height, r, g, b)
        val hot = masters.hotPixels
        if (hot != null && hot.size == light.height && hot[0].size == light.width) {
            out = DarkFrameCalibrator.applyCalibration(out, hot)
        }
        return out
    }

    private fun sameSize(a: FloatImage, b: FloatImage) = a.width == b.width && a.height == b.height

    private fun subtract(a: FloatImage, b: FloatImage): FloatImage {
        val n = a.width * a.height
        return FloatImage(
            a.width, a.height,
            FloatArray(n) { a.r[it] - b.r[it] },
            FloatArray(n) { a.g[it] - b.g[it] },
            FloatArray(n) { a.b[it] - b.b[it] }
        )
    }

    /** Каждый канал делится на своё среднее — флэт не меняет общую яркость и цветовой баланс кадра. */
    private fun normalizePerChannel(flat: FloatImage): FloatImage {
        fun norm(ch: FloatArray): FloatArray {
            var sum = 0.0
            for (v in ch) sum += v
            val mean = (sum / ch.size).toFloat()
            if (mean <= 1e-6f) return FloatArray(ch.size) { 1f }
            return FloatArray(ch.size) { (ch[it] / mean).coerceAtLeast(MIN_FLAT_LEVEL) }
        }
        return FloatImage(flat.width, flat.height, norm(flat.r), norm(flat.g), norm(flat.b))
    }
}
