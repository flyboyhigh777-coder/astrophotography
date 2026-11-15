package com.astrostacker.core

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.pow

/**
 * Обнаружение "призраков" - объектов, сдвинувшихся между кадрами серии
 * (ветки на ветру, люди, рябь на воде) - для слияния экспозиций
 * ([ExposureFusion]). Ту же задачу в Affinity Photo решает опция "Automatically
 * Remove Ghosts" при склейке HDR (включена по умолчанию) - без неё движущийся
 * объект при наивном попиксельном слиянии получается полупрозрачным/раздвоенным,
 * т.к. в разных кадрах оказывается в разных местах.
 *
 * Идея (тот же принцип, что в большинстве HDR-пакетов, см. Grosch, 2006 -
 * "Fast and Robust Removal of Ghost Artifacts in HDR Images"): без движения
 * яркость одной и той же точки сцены в разных кадрах отличается ПРЕДСКАЗУЕМО -
 * только за счёт разной выдержки/усиления. Грубо оцениваем этот множитель по
 * надёжной (не пересвеченной/недосвеченной) части кадра и сравниваем остаток
 * после его компенсации с опорным кадром совмещения ([HdrAligner]). Там, где
 * расхождение всё равно велико - скорее всего, в кадре что-то физически
 * сдвинулось, а не просто иначе экспонировано; такому кадру в этом месте
 * уменьшается вес при слиянии. Опорный кадр никогда не штрафуется - он задаёт
 * "истину", с которой сравниваются остальные.
 *
 * Критически важно: там, где сам ОПОРНЫЙ кадр пересвечен/недосвечен, сравнивать
 * не с чем - в этих местах проверка отключается (а не наоборот!), иначе
 * "защита от призраков" задавила бы ровно те детали, ради которых существует
 * HDR (другой кадр законно показывает иначе экспонированную область).
 */
object GhostDetector {

    data class Config(
        /** Допустимое расхождение (в "ступенях" экспозиции, log2) прежде, чем вес начинает падать. */
        val toleranceStops: Double = 1.0
    )

    /** Для кадра [referenceIndex] возвращает массив из единиц - он не сравнивается сам с собой. */
    fun consistencyWeights(images: List<FloatImage>, referenceIndex: Int, config: Config = Config()): List<DoubleArray> {
        val reference = images[referenceIndex]
        val refLum = reference.luminance()
        return images.mapIndexed { idx, img ->
            if (idx == referenceIndex) DoubleArray(img.width * img.height) { 1.0 }
            else consistency(img.luminance(), refLum, config)
        }
    }

    private fun consistency(lum: GrayImage, refLum: GrayImage, config: Config): DoubleArray {
        val ratio = robustExposureRatio(lum, refLum)
        val toleranceLn = config.toleranceStops * LN2
        val n = lum.data.size
        val out = DoubleArray(n)
        for (i in 0 until n) {
            val refValue = refLum.data[i]
            val refReliability = referenceReliability(refValue)
            if (refReliability < 1e-3) { out[i] = 1.0; continue }
            val normalized = lum.data[i] * ratio
            val diff = abs(ln((normalized + EPS) / (refValue + EPS)))
            val rawConsistency = exp(-(diff / toleranceLn).pow(2))
            out[i] = 1.0 - refReliability * (1.0 - rawConsistency)
        }
        return out
    }

    /** Гауссиана вокруг середины тонового диапазона - насколько опорному значению вообще есть смысл доверять как "истине" (мягче основного веса экспонированности в ExposureFusion - это только шлюз, не сам вес). */
    private fun referenceReliability(v: Float): Double {
        val d = (v - 0.5) / 0.25
        return exp(-(d * d).toDouble())
    }

    /**
     * Во сколько раз [a] темнее/светлее [b] - грубая глобальная оценка по
     * пикселям, не пересвеченным и не недосвеченным ни в одном из двух кадров
     * (середина диапазона надёжнее всего отражает именно разницу экспозиции,
     * а не шум/клиппинг). Движущиеся объекты обычно меньшинство кадра, поэтому
     * даже простое среднее по такой выборке устойчиво к ним.
     */
    private fun robustExposureRatio(a: GrayImage, b: GrayImage): Double {
        var sumA = 0.0; var sumB = 0.0; var count = 0
        for (i in a.data.indices) {
            val av = a.data[i]; val bv = b.data[i]
            if (av in 0.1f..0.9f && bv in 0.1f..0.9f) { sumA += av; sumB += bv; count++ }
        }
        return if (count > 100 && sumA > 1e-6) sumB / sumA else 1.0
    }

    private const val EPS = 1e-4
    private val LN2 = ln(2.0)
}
