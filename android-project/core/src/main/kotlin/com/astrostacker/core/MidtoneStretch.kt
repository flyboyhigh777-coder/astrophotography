package com.astrostacker.core

import kotlin.math.abs

/**
 * Нелинейная растяжка гистограммы по формуле Midtones Transfer Function (MTF).
 * Точная формула — PixInsight PCL `HistogramTransformation`, см.
 * docs/LITERATURE.md §5: MTF(m,x) = (m-1)x / ((2m-1)x - m).
 */
object MidtoneStretch {

    /** MTF(m,x), с явной обработкой вырожденных случаев (x=0,x=1,m=0,m=1). */
    fun mtf(m: Double, x: Double): Double {
        if (x <= 0.0) return 0.0
        if (x >= 1.0) return 1.0
        if (m <= 0.0) return 1.0
        if (m >= 1.0) return 0.0
        val denom = (2.0 * m - 1.0) * x - m
        if (abs(denom) < 1e-12) return 0.5
        return (m - 1.0) * x / denom
    }

    /**
     * Подбирает m так, чтобы [backgroundLevel] (обычно σ-клиппированная медиана
     * фона, 0..1) перешёл в [targetLevel] после растяжки — так работает
     * автоматический STF/AutoHistogram в PixInsight/Siril. Аналитическое решение
     * уравнения MTF(m,bg)=target относительно m (вывод — в комментариях к коду):
     *
     * (m-1)*bg = t*((2m-1)*bg - m)
     * m*(bg - 2*t*bg + t) = bg*(1-t)
     * m = bg*(1-t) / (bg*(1-2t) + t)
     */
    fun autoMidtoneForBackground(backgroundLevel: Double, targetLevel: Double = 0.25): Double {
        val bg = backgroundLevel.coerceIn(1e-6, 1.0 - 1e-6)
        val t = targetLevel.coerceIn(1e-6, 1.0 - 1e-6)
        val denom = bg - 2.0 * t * bg + t
        if (abs(denom) < 1e-12) return 0.5
        val m = bg * (1.0 - t) / denom
        // Нижний порог 0.02 (а не ~0) - защита от вырожденного случая, когда
        // фон после вычитания градиента оказывается статистически неотличим
        // от нуля (или чуть отрицателен): формула тогда требует m→0, что
        // растягивает шум фона так же сильно, как сигнал звёзд, и "выжигает"
        // всё изображение в белый. Вызывающая сторона (Pipeline) дополнительно
        // не должна отдавать сюда фон ниже собственного шумового пола - см.
        // docs/ARCHITECTURE.md.
        return m.coerceIn(0.02, 0.98)
    }

    fun stretchImage(image: FloatImage, m: Double, blackPoint: Double = 0.0, whitePoint: Double = 1.0): FloatImage {
        val range = (whitePoint - blackPoint).coerceAtLeast(1e-6)
        val outR = FloatArray(image.r.size)
        val outG = FloatArray(image.g.size)
        val outB = FloatArray(image.b.size)
        for (i in image.r.indices) {
            outR[i] = mtf(m, ((image.r[i] - blackPoint) / range).coerceIn(0.0, 1.0)).toFloat()
            outG[i] = mtf(m, ((image.g[i] - blackPoint) / range).coerceIn(0.0, 1.0)).toFloat()
            outB[i] = mtf(m, ((image.b[i] - blackPoint) / range).coerceIn(0.0, 1.0)).toFloat()
        }
        return FloatImage(image.width, image.height, outR, outG, outB)
    }
}
