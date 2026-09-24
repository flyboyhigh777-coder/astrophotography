package com.astrostacker.core

/**
 * Нейтрализация цветового оттенка фона: масштабирует каналы так, чтобы
 * σ-клиппированная медиана фона стала нейтрально-серой. Упрощённая замена
 * полной фотометрической калибровки по каталогу (PCC) — см.
 * docs/LITERATURE.md §6. Убирает цветной паразитный оттенок городской
 * засветки (натриевые/светодиодные фонари).
 */
object BackgroundNeutralizer {

    data class ChannelBackground(val r: Double, val g: Double, val b: Double)

    fun estimateBackground(image: FloatImage, sampleStride: Int = 4): ChannelBackground {
        val rSamples = ArrayList<Double>()
        val gSamples = ArrayList<Double>()
        val bSamples = ArrayList<Double>()
        var i = 0
        while (i < image.r.size) {
            rSamples.add(image.r[i].toDouble())
            gSamples.add(image.g[i].toDouble())
            bSamples.add(image.b[i].toDouble())
            i += sampleStride
        }
        return ChannelBackground(
            Stats.sigmaClipped(rSamples).median,
            Stats.sigmaClipped(gSamples).median,
            Stats.sigmaClipped(bSamples).median
        )
    }

    fun neutralize(image: FloatImage, background: ChannelBackground = estimateBackground(image)): FloatImage {
        val refLevel = (background.r + background.g + background.b) / 3.0
        val scaleR = if (background.r > 1e-6) (refLevel / background.r).toFloat() else 1f
        val scaleG = if (background.g > 1e-6) (refLevel / background.g).toFloat() else 1f
        val scaleB = if (background.b > 1e-6) (refLevel / background.b).toFloat() else 1f

        val outR = FloatArray(image.r.size) { (image.r[it] * scaleR).coerceIn(0f, 1f) }
        val outG = FloatArray(image.g.size) { (image.g[it] * scaleG).coerceIn(0f, 1f) }
        val outB = FloatArray(image.b.size) { (image.b[it] * scaleB).coerceIn(0f, 1f) }
        return FloatImage(image.width, image.height, outR, outG, outB)
    }
}
