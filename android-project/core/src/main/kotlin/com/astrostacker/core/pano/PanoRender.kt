package com.astrostacker.core.pano

import com.astrostacker.core.ColorSpace
import com.astrostacker.core.CropRect
import com.astrostacker.core.Rgb16Image
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** Проекция панорамы. */
enum class PanoProjection {
    /** Плоская (прямолинейная): прямые линии остаются прямыми, годится до ~90-100° по ширине. */
    PLANAR,
    /** Цилиндрическая: горизонтальные панорамы любой ширины, вплоть до 360°. */
    CYLINDRICAL,
    /** Сферическая (эквидистантная): несколько рядов, большой охват по вертикали, 360×180. */
    SPHERICAL
}

object PanoRender {

    private val LUT = FloatArray(256) { ColorSpace.srgbByteToLinear(it) }

    fun forward(p: PanoProjection, x: Double, y: Double, z: Double, out: DoubleArray): Boolean {
        when (p) {
            PanoProjection.SPHERICAL -> {
                val n = sqrt(x * x + y * y + z * z)
                out[0] = atan2(x, z); out[1] = asin((y / n).coerceIn(-1.0, 1.0))
            }
            PanoProjection.CYLINDRICAL -> {
                val r = sqrt(x * x + z * z)
                if (r < 1e-12) return false
                out[0] = atan2(x, z); out[1] = y / r
            }
            PanoProjection.PLANAR -> {
                if (z <= 1e-6) return false
                out[0] = x / z; out[1] = y / z
            }
        }
        return true
    }

    fun inverse(p: PanoProjection, u: Double, v: Double, out: DoubleArray) {
        when (p) {
            PanoProjection.SPHERICAL -> { val cv = cos(v); out[0] = sin(u) * cv; out[1] = sin(v); out[2] = cos(u) * cv }
            PanoProjection.CYLINDRICAL -> { out[0] = sin(u); out[1] = v; out[2] = cos(u) }
            PanoProjection.PLANAR -> { out[0] = u; out[1] = v; out[2] = 1.0 }
        }
    }

    /** Угловой охват панорамы (градусы по горизонтали и вертикали) - для выбора проекции и подписи. */
    fun angularExtent(images: List<PanoImage>, align: PanoAlignment): Pair<Double, Double> {
        val bb = bounds(images, align, PanoProjection.SPHERICAL, align.focalPx) ?: return 0.0 to 0.0
        return Math.toDegrees(bb[2] - bb[0]) to Math.toDegrees(bb[3] - bb[1])
    }

    fun autoProjection(hDeg: Double, vDeg: Double): PanoProjection = when {
        hDeg <= 90 && vDeg <= 70 -> PanoProjection.PLANAR
        vDeg <= 75 -> PanoProjection.CYLINDRICAL
        else -> PanoProjection.SPHERICAL
    }

    /**
     * Пользователь мог выбрать проекцию ДО склейки, когда реальный охват ещё
     * не известен (см. экран выбора фото). Плоская/цилиндр математически
     * ломаются за пределами своего охвата (тангенс уходит в бесконечность у
     * края для плоской, аналогично у полюсов для цилиндра) - если выбор
     * оказался слабее того, что реально нужно, подстраховываемся минимально
     * необходимой проекцией вместо размазанного результата. `PanoProjection`
     * объявлена в порядке возрастания "силы" (PLANAR < CYLINDRICAL <
     * SPHERICAL), поэтому сравнение по ordinal и есть сравнение возможностей.
     */
    fun clampProjection(preferred: PanoProjection, hDeg: Double, vDeg: Double): PanoProjection {
        val minimum = autoProjection(hDeg, vDeg)
        return if (preferred.ordinal >= minimum.ordinal) preferred else minimum
    }

    /** Границы каждого кадра в координатах проекции: [uMin, vMin, uMax, vMax] для всей панорамы. */
    private fun imageBounds(img: PanoImage, r: Mat3, f: Double, p: PanoProjection): DoubleArray? {
        val w = img.width; val h = img.height
        val tmp = DoubleArray(3); val uv = DoubleArray(2)
        var uMin = Double.MAX_VALUE; var uMax = -Double.MAX_VALUE
        var vMin = Double.MAX_VALUE; var vMax = -Double.MAX_VALUE
        var uCenter = Double.NaN
        run {
            r.apply(0.0, 0.0, 1.0, tmp)
            if (forward(p, tmp[0], tmp[1], tmp[2], uv)) uCenter = uv[0]
        }
        val steps = 24
        var any = false
        for (sy in 0..steps) for (sx in 0..steps) {
            // Только край и внутренняя сетка - полюса сферы могут оказаться внутри кадра.
            val px = sx * (w - 1.0) / steps; val py = sy * (h - 1.0) / steps
            r.apply((px - w / 2.0) / f, (py - h / 2.0) / f, 1.0, tmp)
            if (!forward(p, tmp[0], tmp[1], tmp[2], uv)) continue
            var u = uv[0]
            if (p != PanoProjection.PLANAR && !uCenter.isNaN()) {
                // Разворачиваем угол относительно центра кадра, чтобы кадр на стыке ±180° не "разорвался".
                while (u - uCenter > PI) u -= 2 * PI
                while (u - uCenter < -PI) u += 2 * PI
            }
            uMin = min(uMin, u); uMax = max(uMax, u); vMin = min(vMin, uv[1]); vMax = max(vMax, uv[1])
            any = true
        }
        return if (any) doubleArrayOf(uMin, vMin, uMax, vMax) else null
    }

    private fun bounds(images: List<PanoImage>, align: PanoAlignment, p: PanoProjection, f: Double): DoubleArray? {
        var out: DoubleArray? = null
        for (i in images.indices) {
            val r = align.rotations[i] ?: continue
            val b = imageBounds(images[i], r, f, p) ?: continue
            out = if (out == null) b else doubleArrayOf(min(out[0], b[0]), min(out[1], b[1]), max(out[2], b[2]), max(out[3], b[3]))
        }
        return out
    }

    class Result(val image: Rgb16Image, val autoCrop: CropRect, val gains: List<DoubleArray?>, val projection: PanoProjection)

    /**
     * Рисует панораму. [maxPixels] ограничивает размер результата (память
     * телефона): по умолчанию масштаб 1:1 с исходными кадрами в центре.
     */
    fun render(
        images: List<PanoImage>,
        align: PanoAlignment,
        projection: PanoProjection,
        maxPixels: Long = 30_000_000L,
        onProgress: (Float) -> Unit = {}
    ): Result {
        val f = align.focalPx
        val used = images.indices.filter { align.rotations[it] != null }
        val bb = bounds(images, align, projection, f) ?: error("нет совмещённых кадров")
        // Для плоской проекции u,v - тангенсы, для остальных - радианы; масштаб f даёт 1:1 в центре.
        var scale = f
        val spanU = bb[2] - bb[0]; val spanV = bb[3] - bb[1]
        val pixels = spanU * spanV * scale * scale
        if (pixels > maxPixels) scale *= sqrt(maxPixels / pixels)
        val outW = max(1, ceil(spanU * scale).toInt())
        val outH = max(1, ceil(spanV * scale).toInt())

        val boxes = images.indices.map { i -> align.rotations[i]?.let { imageBounds(images[i], it, f, projection) } }
        val rt = images.indices.map { align.rotations[it]?.transpose() }
        val gains = gainCompensation(images, align, projection, bb, rt, boxes)

        val out = ShortArray(outW * outH * 3)
        val cell = 8
        val cellsX = (outW + cell - 1) / cell; val cellsY = (outH + cell - 1) / cell
        val uncovered = IntArray(cellsX * cellsY)
        val w = DoubleArray(3); val c = DoubleArray(3); val rgb = FloatArray(3)
        for (y in 0 until outH) {
            val v = bb[1] + (y + 0.5) / scale
            val rowCandidates = used.filter { i -> boxes[i]?.let { v >= it[1] - 1e-9 && v <= it[3] + 1e-9 } == true }
            for (x in 0 until outW) {
                val u = bb[0] + (x + 0.5) / scale
                inverse(projection, u, v, w)
                var sr = 0.0; var sg = 0.0; var sb = 0.0; var sw = 0.0
                for (i in rowCandidates) {
                    val b = boxes[i]!!
                    if (!inRangeU(u, b, projection)) continue
                    rt[i]!!.apply(w[0], w[1], w[2], c)
                    if (c[2] <= 1e-9) continue
                    val img = images[i]
                    val px = f * c[0] / c[2] + img.width / 2.0
                    val py = f * c[1] / c[2] + img.height / 2.0
                    if (px < 0 || py < 0 || px > img.width - 1.0 || py > img.height - 1.0) continue
                    sampleLinear(img, px, py, rgb)
                    val edge = min(min(px, img.width - 1.0 - px), min(py, img.height - 1.0 - py)) / (0.5 * min(img.width, img.height))
                    val e = max(edge, 1e-4)
                    val wt = e * e * e * e // "острые" веса: переход только у линии равноудалённости, меньше двоения
                    val g = gains[i]!!
                    sr += wt * rgb[0] * g[0]; sg += wt * rgb[1] * g[1]; sb += wt * rgb[2] * g[2]; sw += wt
                }
                val o = (y * outW + x) * 3
                if (sw > 0) {
                    out[o] = to16(sr / sw); out[o + 1] = to16(sg / sw); out[o + 2] = to16(sb / sw)
                } else {
                    uncovered[(y / cell) * cellsX + x / cell]++
                }
            }
            if (y % 64 == 0) onProgress(y.toFloat() / outH)
        }
        onProgress(1f)
        return Result(Rgb16Image(outW, outH, out), largestCoveredRect(uncovered, cellsX, cellsY, cell, outW, outH), gains, projection)
    }

    private fun inRangeU(u: Double, b: DoubleArray, p: PanoProjection): Boolean {
        if (u >= b[0] - 1e-9 && u <= b[2] + 1e-9) return true
        if (p == PanoProjection.PLANAR) return false
        return (u + 2 * PI >= b[0] && u + 2 * PI <= b[2]) || (u - 2 * PI >= b[0] && u - 2 * PI <= b[2])
    }

    private fun to16(linear: Double): Short =
        (ColorSpace.linearToSrgb(linear.toFloat().coerceIn(0f, 1f)) * 65535f + 0.5f).toInt().coerceIn(0, 65535).toShort()

    /** Билинейная выборка из 8-битного sRGB в линейные значения. */
    private fun sampleLinear(img: PanoImage, x: Double, y: Double, out: FloatArray) {
        val x0 = x.toInt().coerceAtMost(img.width - 2).coerceAtLeast(0)
        val y0 = y.toInt().coerceAtMost(img.height - 2).coerceAtLeast(0)
        val fx = (x - x0).toFloat(); val fy = (y - y0).toFloat()
        val i = y0 * img.width + x0
        val p00 = img.argb[i]; val p10 = img.argb[min(i + 1, img.argb.size - 1)]
        val p01 = img.argb[min(i + img.width, img.argb.size - 1)]; val p11 = img.argb[min(i + img.width + 1, img.argb.size - 1)]
        for (ch in 0..2) {
            val sh = 16 - ch * 8
            val a = LUT[(p00 shr sh) and 0xFF]; val b = LUT[(p10 shr sh) and 0xFF]
            val cc = LUT[(p01 shr sh) and 0xFF]; val d = LUT[(p11 shr sh) and 0xFF]
            val top = a + (b - a) * fx; val bot = cc + (d - cc) * fx
            out[ch] = top + (bot - top) * fy
        }
    }

    /**
     * Выравнивание экспозиции (Brown & Lowe, "gain compensation"): по одному
     * множителю на кадр и канал, чтобы средняя яркость в зонах перекрытия
     * совпадала, со слабой привязкой множителей к 1 (иначе всё решение
     * могло бы "уплыть" в темноту).
     */
    private fun gainCompensation(
        images: List<PanoImage>, align: PanoAlignment, projection: PanoProjection,
        bb: DoubleArray, rt: List<Mat3?>, boxes: List<DoubleArray?>
    ): List<DoubleArray?> {
        val n = images.size
        val f = align.focalPx
        val gridU = 400; val gridV = 200
        val count = Array(n) { DoubleArray(n) }
        val sum = Array(3) { Array(n) { DoubleArray(n) } } // sum[c][i][j] = сумма значений кадра i там, где он перекрывается с j
        val w = DoubleArray(3); val c = DoubleArray(3); val rgb = FloatArray(3)
        val vals = Array(n) { FloatArray(3) }
        val present = BooleanArray(n)
        for (gy in 0 until gridV) for (gx in 0 until gridU) {
            val u = bb[0] + (gx + 0.5) / gridU * (bb[2] - bb[0])
            val v = bb[1] + (gy + 0.5) / gridV * (bb[3] - bb[1])
            inverse(projection, u, v, w)
            present.fill(false)
            for (i in 0 until n) {
                val r = rt[i] ?: continue
                val b = boxes[i] ?: continue
                if (!inRangeU(u, b, projection) || v < b[1] || v > b[3]) continue
                r.apply(w[0], w[1], w[2], c)
                if (c[2] <= 1e-9) continue
                val img = images[i]
                val px = f * c[0] / c[2] + img.width / 2.0
                val py = f * c[1] / c[2] + img.height / 2.0
                if (px < 0 || py < 0 || px > img.width - 1.0 || py > img.height - 1.0) continue
                sampleLinear(img, px, py, rgb)
                vals[i][0] = rgb[0]; vals[i][1] = rgb[1]; vals[i][2] = rgb[2]
                present[i] = true
            }
            for (i in 0 until n) if (present[i]) for (j in 0 until n) if (j != i && present[j]) {
                count[i][j] += 1.0
                for (ch in 0..2) sum[ch][i][j] += vals[i][ch]
            }
        }
        val sigmaN = 10.0 / 255.0; val sigmaG = 0.1
        val idx = (0 until n).filter { rt[it] != null }
        val pos = IntArray(n) { -1 }; idx.forEachIndexed { k, i -> pos[i] = k }
        val gains = arrayOfNulls<DoubleArray>(n)
        for (i in idx) gains[i] = doubleArrayOf(1.0, 1.0, 1.0)
        for (ch in 0..2) {
            val m = idx.size
            val a = Array(m) { DoubleArray(m) }
            val rhs = DoubleArray(m)
            for (i in idx) {
                val pi = pos[i]
                a[pi][pi] += 1e-6 // кадр без перекрытий остаётся с множителем 1
                rhs[pi] += 1e-6
                for (j in idx) {
                    if (i == j || count[i][j] == 0.0) continue
                    val nij = count[i][j]
                    val iij = sum[ch][i][j] / nij
                    val iji = sum[ch][j][i] / nij
                    a[pi][pi] += nij * (2 * iij * iij / (sigmaN * sigmaN) + 1 / (sigmaG * sigmaG))
                    a[pi][pos[j]] -= nij * 2 * iij * iji / (sigmaN * sigmaN)
                    rhs[pi] += nij / (sigmaG * sigmaG)
                }
            }
            val g = LinAlg.solve(a, rhs) ?: continue
            for (i in idx) gains[i]!![ch] = g[pos[i]].coerceIn(0.25, 4.0)
        }
        return gains.toList()
    }

    /** Наибольший прямоугольник целиком из покрытых клеток (алгоритм "гистограмма в стеке"). */
    private fun largestCoveredRect(uncovered: IntArray, cx: Int, cy: Int, cell: Int, outW: Int, outH: Int): CropRect {
        val heights = IntArray(cx)
        var best = 0L; var bx0 = 0; var bx1 = cx; var by0 = 0; var by1 = cy
        for (y in 0 until cy) {
            for (x in 0 until cx) heights[x] = if (uncovered[y * cx + x] == 0) heights[x] + 1 else 0
            val stack = ArrayDeque<Int>()
            for (x in 0..cx) {
                val hgt = if (x == cx) 0 else heights[x]
                while (stack.isNotEmpty() && heights[stack.last()] >= hgt) {
                    val top = stack.removeLast()
                    val hTop = heights[top]
                    val left = if (stack.isEmpty()) 0 else stack.last() + 1
                    val area = hTop.toLong() * (x - left)
                    if (area > best) { best = area; bx0 = left; bx1 = x; by0 = y - hTop + 1; by1 = y + 1 }
                }
                stack.addLast(x)
            }
        }
        if (best == 0L) return CropRect.FULL
        // Края клеток могут быть частично пустыми - отступаем на клетку внутрь, где можно.
        val x0 = min((bx0 + if (bx0 > 0) 1 else 0) * cell, outW - 1)
        val y0 = min((by0 + if (by0 > 0) 1 else 0) * cell, outH - 1)
        val x1 = max(x0 + 1, min((bx1 - if (bx1 < cx) 1 else 0) * cell, outW))
        val y1 = max(y0 + 1, min((by1 - if (by1 < cy) 1 else 0) * cell, outH))
        return CropRect(x0.toFloat() / outW, y0.toFloat() / outH, x1.toFloat() / outW, y1.toFloat() / outH)
    }
}
