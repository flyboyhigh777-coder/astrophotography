package com.astrostacker.core

import kotlin.math.max
import kotlin.math.min

/**
 * Автоматическое разделение кадра на "небо" и "землю" (горы, деревья, дома -
 * всё, что НЕ вращается вместе со звёздами).
 *
 * Идея: небо движется вместе со звёздами, земля стоит на месте. Поэтому для
 * каждого блока пикселей сравниваем опорный кадр с двумя стеками:
 *  - [alignedStack] - кадры, совмещённые по звёздам: в небе совпадает с
 *    опорным кадром, а земля в нём "размазана" поворотом;
 *  - [staticStack] - те же кадры БЕЗ совмещения: земля совпадает с опорным
 *    кадром, а звёзды размазаны.
 * Где опорный кадр лучше объясняется статичным стеком - это земля, где
 * совмещённым - небо. Однородные тёмные участки (ни звёзд, ни деталей) не
 * дают информации ни туда, ни сюда - их решает модель "земля снизу, небо
 * сверху": для каждого столбца блоков ищется одна граница-горизонт, которая
 * лучше всего разделяет найденные признаки, затем горизонт сглаживается
 * медианным фильтром по соседним столбцам.
 */
object GroundMask {

    data class Config(
        /** Размер блока в пикселях; 0 = автоматически от ширины кадра. */
        val blockSize: Int = 0,
        /** Во сколько сигм шума должна отличаться разность, чтобы блок считался признаком. */
        val significanceSigma: Double = 3.0,
        /** Насколько блоков поднять горизонт вверх - запас, чтобы "шлейф" размазанной земли в небе точно ушёл под маску. */
        val marginBlocks: Int = 1
    )

    /**
     * Возвращает вес "земли" для каждого пикселя (0 = небо, берётся из стека;
     * 1 = земля, берётся из опорного кадра) с плавным переходом на границе.
     */
    fun compute(
        reference: GrayImage,
        alignedStack: GrayImage,
        staticStack: GrayImage,
        config: Config = Config()
    ): GrayImage {
        val w = reference.width
        val h = reference.height
        val b = if (config.blockSize > 0) config.blockSize else max(8, w / 160)
        val nbx = (w + b - 1) / b
        val nby = (h + b - 1) / b

        // Для каждого блока - средняя РАЗНОСТЬ (со знаком) опорного кадра и
        // каждого стека. Шум при усреднении по блоку гасится, а систематический
        // сдвиг (размазанная гора, размазанная звезда) остаётся - так даже
        // малоконтрастный горизонт виден уверенно.
        val n = nbx * nby
        val sumA = DoubleArray(n); val sumS = DoubleArray(n)
        val sqA = DoubleArray(n); val sqS = DoubleArray(n)
        val counts = IntArray(n)
        for (y in 0 until h) {
            val by = y / b
            for (x in 0 until w) {
                val i = y * w + x
                val bi = by * nbx + x / b
                val r = reference.data[i]
                val da = (alignedStack.data[i] - r).toDouble()
                val ds = (staticStack.data[i] - r).toDouble()
                sumA[bi] += da; sqA[bi] += da * da
                sumS[bi] += ds; sqS[bi] += ds * ds
                counts[bi]++
            }
        }
        val meanA = DoubleArray(n) { sumA[it] / counts[it] }
        val meanS = DoubleArray(n) { sumS[it] / counts[it] }

        // Шум попиксельной разности - медиана по блокам внутриблочной дисперсии.
        val variances = DoubleArray(n) {
            val va = sqA[it] / counts[it] - meanA[it] * meanA[it]
            val vs = sqS[it] / counts[it] - meanS[it] * meanS[it]
            min(va, vs)
        }
        variances.sort()
        val noiseVar = variances[n / 2].coerceAtLeast(1e-10)
        val k = config.significanceSigma

        // +1 = признак земли, -1 = признак неба, 0 = неизвестно.
        val evidence = IntArray(n)
        for (i in 0 until n) {
            val threshold = k * k * noiseVar / counts[i]
            val a2 = meanA[i] * meanA[i]
            val s2 = meanS[i] * meanS[i]
            evidence[i] = when {
                a2 - s2 > threshold -> 1
                s2 - a2 > threshold -> -1
                else -> 0
            }
        }

        // Горизонт в каждом столбце: строка блоков r, ниже которой (включительно) - земля.
        // Признаки берутся не только из самого столбца, но и из соседних -
        // одиночный столбец часто "пустой" (нет ни звёзд, ни деталей).
        val pool = max(2, nbx / 20)
        val horizon = IntArray(nbx)
        val ground = IntArray(nby); val sky = IntArray(nby)
        for (bx in 0 until nbx) {
            ground.fill(0); sky.fill(0)
            for (c in max(0, bx - pool)..min(nbx - 1, bx + pool)) {
                for (by in 0 until nby) {
                    when (evidence[by * nbx + c]) { 1 -> ground[by]++; -1 -> sky[by]++ }
                }
            }
            var groundAbove = 0 // признаки земли выше границы - ошибка
            var skyBelow = sky.sum() // признаки неба ниже границы - ошибка
            var bestCost = skyBelow
            var bestLo = 0; var bestHi = 0
            for (r in 1..nby) {
                groundAbove += ground[r - 1]
                skyBelow -= sky[r - 1]
                val cost = groundAbove + skyBelow
                if (cost < bestCost) { bestCost = cost; bestLo = r; bestHi = r }
                else if (cost == bestCost && bestHi == r - 1) bestHi = r
            }
            // Без признаков земли вообще - земли нет; иначе середина неоднозначного
            // промежутка между последним признаком неба и первым признаком земли.
            horizon[bx] = if (ground.sum() == 0) nby else (bestLo + bestHi) / 2
        }

        val smoothed = medianFilter(horizon, radius = max(1, nbx / 40))
        for (bx in 0 until nbx) smoothed[bx] = (smoothed[bx] - config.marginBlocks).coerceIn(0, nby)

        return rasterize(w, h, b, smoothed, nby)
    }

    private fun medianFilter(values: IntArray, radius: Int): IntArray {
        val out = IntArray(values.size)
        val window = ArrayList<Int>(2 * radius + 1)
        for (i in values.indices) {
            window.clear()
            for (j in max(0, i - radius)..min(values.size - 1, i + radius)) window.add(values[j])
            window.sort()
            out[i] = window[window.size / 2]
        }
        return out
    }

    /** Горизонт по блокам -> попиксельный вес с линейной интерполяцией между столбцами и плавным переходом высотой в один блок. */
    private fun rasterize(w: Int, h: Int, b: Int, horizonBlocks: IntArray, nby: Int): GrayImage {
        val out = FloatArray(w * h)
        val nbx = horizonBlocks.size
        for (x in 0 until w) {
            // Центр столбца блоков bx - в пикселе bx*b + b/2; интерполируем между соседними центрами.
            val fx = (x - b / 2.0) / b
            val bx0 = fx.toInt().coerceIn(0, nbx - 1)
            val bx1 = (bx0 + 1).coerceAtMost(nbx - 1)
            val t = (fx - bx0).coerceIn(0.0, 1.0)
            val r0 = horizonBlocks[bx0]
            val r1 = horizonBlocks[bx1]
            // Столбец без земли (горизонт на самом низу) не тянет соседей вниз за кадр.
            val yLine = if (r0 >= nby && r1 >= nby) Double.POSITIVE_INFINITY
            else ((if (r0 >= nby) r1 else r0) * (1 - t) + (if (r1 >= nby) r0 else r1) * t) * b
            for (y in 0 until h) {
                val wgt = when {
                    y >= yLine -> 1f
                    y <= yLine - b -> 0f
                    else -> ((y - (yLine - b)) / b).toFloat()
                }
                out[y * w + x] = wgt
            }
        }
        return GrayImage(w, h, out)
    }
}
