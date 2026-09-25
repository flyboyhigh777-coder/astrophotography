package com.astrostacker.core

import kotlin.math.abs
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
        /** На сколько пикселей поднять найденную линию горизонта - запас на неточность края. */
        val marginPx: Int = 2,
        /** Ширина плавного перехода небо/земля, пикс. */
        val featherPx: Int = 3
    )

    /**
     * Возвращает вес "земли" для каждого пикселя (0 = небо, берётся из стека;
     * 1 = земля, берётся из опорного кадра) с плавным переходом на границе.
     */
    fun compute(
        reference: GrayImage,
        alignedStack: GrayImage,
        staticStack: GrayImage,
        config: Config = Config(),
        /** Наибольшее смещение звёзд между кадрами, пикс. - настолько далеко от горизонта может тянуться "шлейф" земли. */
        maxShiftPx: Double = 0.0
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

        // Уточнение до пикселя: грубый горизонт (по блокам) ищет лишь
        // окрестность, а точную линию даёт самый резкий перепад яркости по
        // вертикали в НЕСОВМЕЩЁННОМ стеке - в нём земля неподвижна и резкая,
        // а шум усреднён.
        val coarse = coarseHorizonPerPixel(w, b, smoothed, nby)
        val search = (maxShiftPx + 3 * b).toInt()
        val fine = IntArray(w) { Int.MAX_VALUE }
        for (x in 0 until w) {
            val yc = coarse[x]
            if (yc == Int.MAX_VALUE) continue
            fine[x] = strongestEdge(staticStack, x, (yc - search).coerceAtLeast(3), (yc + search).coerceAtMost(h - 4)) ?: yc
        }
        val line = medianFilterNullable(fine, radius = max(6, w / 60))
        return rasterizeLine(w, h, line, config.featherPx, config.marginPx)
    }

    /** Грубый горизонт в пикселях для каждого столбца (Int.MAX_VALUE - земли нет). */
    private fun coarseHorizonPerPixel(w: Int, b: Int, horizonBlocks: IntArray, nby: Int): IntArray {
        val nbx = horizonBlocks.size
        return IntArray(w) { x ->
            val fx = (x - b / 2.0) / b
            val bx0 = fx.toInt().coerceIn(0, nbx - 1)
            val bx1 = (bx0 + 1).coerceAtMost(nbx - 1)
            val t = (fx - bx0).coerceIn(0.0, 1.0)
            val r0 = horizonBlocks[bx0]; val r1 = horizonBlocks[bx1]
            when {
                r0 >= nby && r1 >= nby -> Int.MAX_VALUE
                r0 >= nby -> r1 * b
                r1 >= nby -> r0 * b
                else -> ((r0 * (1 - t) + r1 * t) * b).toInt()
            }
        }
    }

    /**
     * Лучшая граница "сверху одно, снизу другое" в столбце [x] между [y0] и
     * [y1]: профиль яркости (среднее по 5 столбцам) делится на две части так,
     * чтобы каждая была как можно однороднее (минимум суммы квадратов
     * отклонений от своих средних). В отличие от поиска самого резкого
     * перепада, одиночные огоньки и звёзды почти не влияют на результат.
     * null - заметной ступеньки нет.
     */
    private fun strongestEdge(img: GrayImage, x: Int, y0: Int, y1: Int): Int? {
        val len = y1 - y0 + 1
        if (len < 8) return null
        val w = img.width
        val xa = (x - 2).coerceAtLeast(0); val xb = (x + 2).coerceAtMost(w - 1)
        val prefix = DoubleArray(len + 1)
        val prefixSq = DoubleArray(len + 1)
        for (k in 0 until len) {
            var sum = 0.0
            for (xx in xa..xb) sum += img.data[(y0 + k) * w + xx]
            val v = sum / (xb - xa + 1)
            prefix[k + 1] = prefix[k] + v
            prefixSq[k + 1] = prefixSq[k] + v * v
        }
        fun sse(a: Int, b: Int): Double { // [a, b)
            val n = b - a
            val s1 = prefix[b] - prefix[a]
            return (prefixSq[b] - prefixSq[a]) - s1 * s1 / n
        }
        val total = sse(0, len)
        var bestCost = Double.POSITIVE_INFINITY; var bestK = -1
        for (k in 3..len - 3) {
            val cost = sse(0, k) + sse(k, len)
            if (cost < bestCost) { bestCost = cost; bestK = k }
        }
        if (bestK < 0) return null
        val step = abs((prefix[len] - prefix[bestK]) / (len - bestK) - prefix[bestK] / bestK)
        // Ступенька должна объяснять заметную часть разброса и не быть шумом.
        return if (bestCost < 0.6 * total && step > 2e-3) y0 + bestK else null
    }

    private fun medianFilterNullable(values: IntArray, radius: Int): IntArray {
        val out = IntArray(values.size)
        val window = ArrayList<Int>(2 * radius + 1)
        for (i in values.indices) {
            if (values[i] == Int.MAX_VALUE) { out[i] = Int.MAX_VALUE; continue }
            window.clear()
            for (j in max(0, i - radius)..min(values.size - 1, i + radius)) if (values[j] != Int.MAX_VALUE) window.add(values[j])
            window.sort()
            out[i] = window[window.size / 2]
        }
        return out
    }

    /** Попиксельный вес земли: 1 ниже линии, плавный переход [featherPx] над ней, линия поднята на [marginPx]. */
    private fun rasterizeLine(w: Int, h: Int, line: IntArray, featherPx: Int, marginPx: Int): GrayImage {
        val out = FloatArray(w * h)
        for (x in 0 until w) {
            if (line[x] == Int.MAX_VALUE) continue
            val top = line[x] - marginPx
            for (y in 0 until h) {
                out[y * w + x] = when {
                    y >= top -> 1f
                    y <= top - featherPx -> 0f
                    else -> (y - (top - featherPx)).toFloat() / featherPx
                }
            }
        }
        return GrayImage(w, h, out)
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
}
