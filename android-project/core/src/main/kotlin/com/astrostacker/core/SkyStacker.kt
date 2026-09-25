package com.astrostacker.core

/**
 * Стекинг совмещённых кадров за один проход сразу в двух вариантах:
 *  - [Result.all] - обычное среднее всех кадров (земля в нём размазана);
 *  - [Result.skyOnly] - среднее только тех отсчётов, которые в СВОЁМ кадре
 *    попали на небо. Камера на штативе неподвижна, поэтому маска земли
 *    одна для всех кадров (в координатах камеры). Без этого гора из
 *    соседних кадров "размазывается" в небо тёмным шлейфом над горизонтом.
 * Где на небо не попал ни один отсчёт, берётся пиксель опорного кадра.
 */
object SkyStacker {

    class Result(val all: FloatImage, val skyOnly: FloatImage?)

    fun stack(
        frames: List<StackFrame>,
        reference: FloatImage,
        groundMask: GrayImage?,
        config: StackCombinerConfig = StackCombinerConfig()
    ): Result {
        val w = reference.width
        val h = reference.height
        val n = w * h
        val allR = FloatArray(n); val allG = FloatArray(n); val allB = FloatArray(n)
        val skyR = if (groundMask != null) FloatArray(n) else null
        val skyG = if (groundMask != null) FloatArray(n) else null
        val skyB = if (groundMask != null) FloatArray(n) else null

        // Обратные преобразования в виде коэффициентов аффинной матрицы -
        // без создания объектов Vec2 на каждый пиксель.
        val coeffs = frames.map { f ->
            val inv = f.toReference.inverse()
            val o = inv.apply(Vec2(0.0, 0.0)); val ex = inv.apply(Vec2(1.0, 0.0)); val ey = inv.apply(Vec2(0.0, 1.0))
            doubleArrayOf(ex.x - o.x, ey.x - o.x, o.x, ex.y - o.y, ey.y - o.y, o.y)
        }
        val m = frames.size
        val bufR = FloatArray(m); val bufG = FloatArray(m); val bufB = FloatArray(m)
        val skyBufR = FloatArray(m); val skyBufG = FloatArray(m); val skyBufB = FloatArray(m)

        for (y in 0 until h) {
            for (x in 0 until w) {
                var count = 0
                var skyCount = 0
                for (fi in 0 until m) {
                    val c = coeffs[fi]
                    val sx = c[0] * x + c[1] * y + c[2]
                    val sy = c[3] * x + c[4] * y + c[5]
                    if (sx < 0.0 || sy < 0.0 || sx > w - 1.0 || sy > h - 1.0) continue
                    val img = frames[fi].image
                    val x0 = sx.toInt().coerceAtMost(w - 2).coerceAtLeast(0)
                    val y0 = sy.toInt().coerceAtMost(h - 2).coerceAtLeast(0)
                    val fx = (sx - x0).toFloat(); val fy = (sy - y0).toFloat()
                    val i00 = y0 * w + x0
                    val i10 = if (w > 1) i00 + 1 else i00
                    val i01 = if (h > 1) i00 + w else i00
                    val i11 = if (w > 1) i01 + 1 else i01
                    val r = bilerp(img.r, i00, i10, i01, i11, fx, fy)
                    val g = bilerp(img.g, i00, i10, i01, i11, fx, fy)
                    val b = bilerp(img.b, i00, i10, i01, i11, fx, fy)
                    bufR[count] = r; bufG[count] = g; bufB[count] = b; count++
                    if (groundMask != null) {
                        val nearest = (sy + 0.5).toInt().coerceAtMost(h - 1) * w + (sx + 0.5).toInt().coerceAtMost(w - 1)
                        if (groundMask.data[nearest] < 0.5f) {
                            skyBufR[skyCount] = r; skyBufG[skyCount] = g; skyBufB[skyCount] = b; skyCount++
                        }
                    }
                }
                val i = y * w + x
                if (count == 0) {
                    allR[i] = reference.r[i]; allG[i] = reference.g[i]; allB[i] = reference.b[i]
                } else {
                    allR[i] = StackCombiner.combinePrefix(bufR, count, config)
                    allG[i] = StackCombiner.combinePrefix(bufG, count, config)
                    allB[i] = StackCombiner.combinePrefix(bufB, count, config)
                }
                if (skyR != null) {
                    if (skyCount == 0) {
                        skyR[i] = reference.r[i]; skyG!![i] = reference.g[i]; skyB!![i] = reference.b[i]
                    } else {
                        skyR[i] = StackCombiner.combinePrefix(skyBufR, skyCount, config)
                        skyG!![i] = StackCombiner.combinePrefix(skyBufG, skyCount, config)
                        skyB!![i] = StackCombiner.combinePrefix(skyBufB, skyCount, config)
                    }
                }
            }
        }
        val all = FloatImage(w, h, allR, allG, allB)
        val sky = if (skyR != null) FloatImage(w, h, skyR, skyG!!, skyB!!) else null
        return Result(all, sky)
    }

    private fun bilerp(ch: FloatArray, i00: Int, i10: Int, i01: Int, i11: Int, fx: Float, fy: Float): Float {
        val top = ch[i00] + (ch[i10] - ch[i00]) * fx
        val bottom = ch[i01] + (ch[i11] - ch[i01]) * fx
        return top + (bottom - top) * fy
    }

    /** Совмещённое среднее по яркости (без отбраковки) - дёшево, нужно только для поиска земли. */
    fun alignedLuminanceMean(frames: List<StackFrame>, w: Int, h: Int): GrayImage {
        val sum = FloatArray(w * h)
        val cnt = IntArray(w * h)
        for (f in frames) {
            val inv = f.toReference.inverse()
            val o = inv.apply(Vec2(0.0, 0.0)); val ex = inv.apply(Vec2(1.0, 0.0)); val ey = inv.apply(Vec2(0.0, 1.0))
            val a = ex.x - o.x; val bb = ey.x - o.x; val c = o.x; val d = ex.y - o.y; val e = ey.y - o.y; val ff = o.y
            val img = f.image
            for (y in 0 until h) for (x in 0 until w) {
                val sx = a * x + bb * y + c
                val sy = d * x + e * y + ff
                if (sx < 0.0 || sy < 0.0 || sx > w - 1.0 || sy > h - 1.0) continue
                val xi = (sx + 0.5).toInt().coerceAtMost(w - 1)
                val yi = (sy + 0.5).toInt().coerceAtMost(h - 1)
                val j = yi * w + xi
                val i = y * w + x
                sum[i] += 0.2126f * img.r[j] + 0.7152f * img.g[j] + 0.0722f * img.b[j]
                cnt[i]++
            }
        }
        return GrayImage(w, h, FloatArray(w * h) { if (cnt[it] > 0) sum[it] / cnt[it] else 0f })
    }
}
