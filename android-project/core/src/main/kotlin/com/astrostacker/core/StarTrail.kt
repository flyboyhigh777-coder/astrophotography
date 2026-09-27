package com.astrostacker.core

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin

/**
 * Стиль отрисовки трека - см. docs/LITERATURE.md и справку в интерфейсе.
 * Все стили - один и тот же покадровый лайтен (максимум по каналу), только с
 * разным множителем яркости кадра перед комбинированием (см. [StarTrail.weightAndScale]).
 */
enum class TrailStyle {
    /** Каждая звезда на всём треке - в полную яркость (обычный лайтен). */
    FULL,
    /** Трек становится ярче к концу серии - создаёт ощущение движения. */
    FADE,
    /** Как FADE, но самый последний кадр - ярче любого другого ("голова кометы"). */
    SHOOTING_STAR,
    /** Оба конца трека затухают, середина - самая яркая ("остриё копья"). */
    JAVELIN
}

/** В каком порядке кадры считаются "первыми"/"последними" для [TrailStyle] и масштаба [StarTrailConfig.warpZoom]. */
enum class StackingOrder { CHRONOLOGICAL, REVERSE }

data class StarTrailConfig(
    val style: TrailStyle = TrailStyle.FULL,
    val order: StackingOrder = StackingOrder.CHRONOLOGICAL,
    /** "Warp": прогрессивное увеличение кадра к центру по ходу серии - звёзды расходятся из центра, как при скачке в гиперпространство. Как и в референсном приложении, затрагивает весь кадр целиком, включая землю. */
    val warpZoom: Boolean = false,
    /** Во сколько раз увеличен (по центру) последний по счёту кадр относительно первого. */
    val warpMaxScale: Double = 1.35,
    /** Яркость первого (для FADE/SHOOTING_STAR) или обоих крайних (для JAVELIN) кадров - доля от полной. */
    val minWeight: Double = 0.35,
    /** Во сколько раз ярче обычного берётся самый последний кадр в SHOOTING_STAR - специально может давать пересвет (это и есть "вспышка" головы кометы). */
    val shootingStarBoost: Double = 1.6,
    /** Длинная сторона результата, пикс.; null - исходное разрешение декодированных кадров. */
    val maxOutputSide: Int? = null
)

/**
 * Звёздные треки: в отличие от [Pipeline] (совмещение кадров, чтобы погасить
 * вращение неба и снизить шум - звёзды остаются точками), здесь кадры
 * специально НЕ совмещаются - камера неподвижна, и вращение неба само
 * прочерчивает дуги. Комбинирование - поканальный максимум (см.
 * [StarTrailAccumulator]), как в StarStaX/Star Stacker: в каждой точке кадра
 * остаётся самое яркое значение среди всех кадров, поэтому звёзды
 * "прорисовывают" свой путь, а статичный передний план остаётся на месте.
 */
object StarTrail {

    /**
     * Множитель яркости и масштаб (для warp) кадра №[indexInOrder] (с нуля) из
     * [count] кадров серии, УЖЕ упорядоченных так, как задаёт [StarTrailConfig.order]
     * (см. [orderIndices]) - то есть indexInOrder=0 - самый "первый" кадр трека,
     * count-1 - самый "последний".
     */
    fun weightAndScale(indexInOrder: Int, count: Int, config: StarTrailConfig): Pair<Double, Double> {
        require(count >= 1) { "count must be >= 1" }
        require(indexInOrder in 0 until count) { "indexInOrder=$indexInOrder вне диапазона [0, $count)" }
        val t = if (count == 1) 1.0 else indexInOrder.toDouble() / (count - 1)
        var weight = when (config.style) {
            TrailStyle.FULL -> 1.0
            TrailStyle.FADE, TrailStyle.SHOOTING_STAR -> config.minWeight + (1 - config.minWeight) * t
            TrailStyle.JAVELIN -> config.minWeight + (1 - config.minWeight) * sin(PI * t)
        }
        if (config.style == TrailStyle.SHOOTING_STAR && indexInOrder == count - 1) weight *= config.shootingStarBoost
        val scale = if (config.warpZoom) 1.0 + t * (config.warpMaxScale - 1.0) else 1.0
        return weight to scale
    }

    /**
     * Порядок обработки индексов [0, count) - CHRONOLOGICAL как есть,
     * REVERSE - задом наперёд. Вызывающая сторона сортирует исходные кадры по
     * времени съёмки заранее (см. `PickedFrame` в `:app`) - здесь только
     * разворот, если выбран обратный порядок.
     */
    fun orderIndices(count: Int, order: StackingOrder): List<Int> {
        val chronological = (0 until count).toList()
        return if (order == StackingOrder.CHRONOLOGICAL) chronological else chronological.asReversed()
    }
}

/**
 * Накопитель треков: кадры комбинируются по одному, без хранения всей серии в
 * памяти - на телефоне трек может состоять из десятков-сотен кадров.
 */
class StarTrailAccumulator(val width: Int, val height: Int) {

    private val r = FloatArray(width * height)
    private val g = FloatArray(width * height)
    private val b = FloatArray(width * height)

    var framesAdded = 0
        private set

    /**
     * Добавляет кадр в накопитель: поканальный максимум с уже накопленным,
     * умножив значения кадра на [weight]. [scale] > 1 - "приближает" кадр к
     * центру перед этим (см. [StarTrailConfig.warpZoom]); участки, съехавшие
     * за край кадра при приближении, просто не участвуют в максимуме.
     */
    fun add(image: FloatImage, weight: Double, scale: Double = 1.0) {
        require(image.width == width && image.height == height) {
            "размер кадра не совпадает: ${image.width}x${image.height} != ${width}x${height}"
        }
        val w = weight.toFloat()
        if (scale == 1.0) {
            // Быстрый путь без передискретизации - основной случай (без warp).
            for (i in r.indices) {
                r[i] = max(r[i], image.r[i] * w)
                g[i] = max(g[i], image.g[i] * w)
                b[i] = max(b[i], image.b[i] * w)
            }
        } else {
            val cx = (width - 1) / 2.0
            val cy = (height - 1) / 2.0
            for (y in 0 until height) {
                val sy = cy + (y - cy) / scale
                for (x in 0 until width) {
                    val sx = cx + (x - cx) / scale
                    val sample = image.sampleBilinear(sx, sy) ?: continue
                    val i = y * width + x
                    r[i] = max(r[i], sample[0] * w)
                    g[i] = max(g[i], sample[1] * w)
                    b[i] = max(b[i], sample[2] * w)
                }
            }
        }
        framesAdded++
    }

    fun result(): FloatImage = FloatImage(width, height, r, g, b)
}
