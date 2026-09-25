package com.astrostacker.core.pano

import kotlin.math.atan2
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sqrt

/** Совпавшие точки двух кадров (пиксели) после отбраковки RANSAC. */
class PairMatch(val i: Int, val j: Int, val pointsI: List<DoubleArray>, val pointsJ: List<DoubleArray>, val candidates: Int) {
    val inliers get() = pointsI.size
}

/**
 * Результат совмещения. [rotations] - поворот камера->мир для каждого кадра
 * (null - кадр не удалось привязать к панораме), [focalPx] - общее фокусное
 * расстояние в пикселях кадра.
 */
class PanoAlignment(
    val rotations: List<Mat3?>,
    val focalPx: Double,
    val pairs: List<PairMatch>,
    val rmsErrorPx: Double
) {
    val alignedCount get() = rotations.count { it != null }
}

/**
 * Модель "камера вращается вокруг одной точки" (как в AutoStitch / OpenCV
 * stitching): кадры связаны только поворотом и общим фокусным расстоянием.
 */
object PanoAlign {

    data class Config(
        val ransacIterations: Int = 400,
        /** Порог отбраковки, пикселей. */
        val ransacThresholdPx: Double = 3.0,
        val minInliers: Int = 12,
        val bundleIterations: Int = 40,
        val maxMatchesPerPairInBundle: Int = 60
    )

    private fun ray(p: DoubleArray, cx: Double, cy: Double, f: Double): DoubleArray =
        LinAlg.normalize(doubleArrayOf((p[0] - cx) / f, (p[1] - cy) / f, 1.0))

    /**
     * Поворот между двумя кадрами по совпавшим точкам (RANSAC по 2 парам +
     * уточнение по всем согласным). null - кадры не перекрываются.
     * Проверка Брауна-Лоу: согласных точек должно быть > 8 + 0.3·кандидатов.
     */
    fun matchPair(
        i: Int, j: Int, fi: List<Feature>, fj: List<Feature>, matches: List<Pair<Int, Int>>,
        sizeI: IntArray, sizeJ: IntArray, focal: Double, config: Config = Config(), seed: Long = 1
    ): PairMatch? {
        if (matches.size < config.minInliers) return null
        val a = matches.map { ray(doubleArrayOf(fi[it.first].x, fi[it.first].y), sizeI[0] / 2.0, sizeI[1] / 2.0, focal) }
        val b = matches.map { ray(doubleArrayOf(fj[it.second].x, fj[it.second].y), sizeJ[0] / 2.0, sizeJ[1] / 2.0, focal) }
        val thr = config.ransacThresholdPx / focal
        val rnd = java.util.Random(seed)
        var best: List<Int> = emptyList()
        val tmp = DoubleArray(3)
        fun inliersOf(r: Mat3): List<Int> {
            val out = ArrayList<Int>()
            for (k in a.indices) {
                r.apply(a[k][0], a[k][1], a[k][2], tmp)
                val dx = tmp[0] - b[k][0]; val dy = tmp[1] - b[k][1]; val dz = tmp[2] - b[k][2]
                if (dx * dx + dy * dy + dz * dz < thr * thr) out.add(k)
            }
            return out
        }
        repeat(config.ransacIterations) {
            val k1 = rnd.nextInt(a.size); var k2 = rnd.nextInt(a.size)
            if (k1 == k2) k2 = (k2 + 1) % a.size
            // Две точки должны быть разнесены, иначе поворот вокруг их оси не определён.
            if (LinAlg.dot(a[k1], a[k2]) > 0.99999) return@repeat
            val r = LinAlg.bestRotation(listOf(a[k1], a[k2]), listOf(b[k1], b[k2]))
            val inl = inliersOf(r)
            if (inl.size > best.size) best = inl
        }
        if (best.size < 3) return null
        // Уточнение по всем согласным точкам и повторный отбор.
        val refined = LinAlg.bestRotation(best.map { a[it] }, best.map { b[it] })
        best = inliersOf(refined)
        if (best.size < max(config.minInliers.toDouble(), 8 + 0.3 * matches.size)) return null
        return PairMatch(
            i, j,
            best.map { doubleArrayOf(fi[matches[it].first].x, fi[matches[it].first].y) },
            best.map { doubleArrayOf(fj[matches[it].second].x, fj[matches[it].second].y) },
            matches.size
        )
    }

    /** Поворот кадра j относительно i (b = R·a) по уже отобранным точкам. */
    private fun relativeRotation(p: PairMatch, sizes: List<IntArray>, focal: Double): Mat3 {
        val si = sizes[p.i]; val sj = sizes[p.j]
        val a = p.pointsI.map { ray(it, si[0] / 2.0, si[1] / 2.0, focal) }
        val b = p.pointsJ.map { ray(it, sj[0] / 2.0, sj[1] / 2.0, focal) }
        return LinAlg.bestRotation(a, b)
    }

    /**
     * Полное совмещение: остовное дерево по числу общих точек (самые надёжные
     * пары первыми), затем общая подгонка (bundle adjustment) всех поворотов
     * и фокусного расстояния, затем выпрямление горизонта.
     */
    fun align(sizes: List<IntArray>, pairs: List<PairMatch>, focal0: Double, config: Config = Config()): PanoAlignment {
        val n = sizes.size
        val rotations = arrayOfNulls<Mat3>(n)
        if (pairs.isEmpty()) return PanoAlignment(rotations.toList(), focal0, pairs, 0.0)

        // Корень - кадр с наибольшим числом общих точек (обычно середина панорамы).
        val score = DoubleArray(n)
        for (p in pairs) { score[p.i] += p.inliers.toDouble(); score[p.j] += p.inliers.toDouble() }
        val root = score.indices.maxByOrNull { score[it] }!!
        rotations[root] = Mat3.IDENTITY
        // Алгоритм Прима: каждый раз присоединяем самую надёжную пару.
        while (true) {
            var bestPair: PairMatch? = null
            for (p in pairs) {
                val known = (rotations[p.i] != null) xor (rotations[p.j] != null)
                if (known && (bestPair == null || p.inliers > bestPair.inliers)) bestPair = p
            }
            val p = bestPair ?: break
            val rel = relativeRotation(p, sizes, focal0) // b = rel·a, rel = Rj^T·Ri
            if (rotations[p.i] != null) rotations[p.j] = rotations[p.i]!! * rel.transpose()
            else rotations[p.i] = rotations[p.j]!! * rel
        }

        val used = pairs.filter { rotations[it.i] != null && rotations[it.j] != null }
        val (focal, rms) = bundleAdjust(sizes, used, rotations, root, focal0, config)
        waveCorrect(rotations)
        return PanoAlignment(rotations.toList(), focal, used, rms)
    }

    private class Obs(val i: Int, val j: Int, val pi: DoubleArray, val pj: DoubleArray)

    /** Левенберг-Марквардт по поворотам (кроме корневого) и log(фокусного). Возвращает (фокусное, СКО в пикселях). */
    private fun bundleAdjust(
        sizes: List<IntArray>, pairs: List<PairMatch>, rotations: Array<Mat3?>, root: Int,
        focal0: Double, config: Config
    ): Pair<Double, Double> {
        val rnd = java.util.Random(7)
        val obs = ArrayList<Obs>()
        for (p in pairs) {
            val idx = (0 until p.inliers).shuffled(rnd).take(config.maxMatchesPerPairInBundle)
            for (k in idx) obs.add(Obs(p.i, p.j, p.pointsI[k], p.pointsJ[k]))
        }
        if (obs.isEmpty()) return focal0 to 0.0
        val free = rotations.indices.filter { rotations[it] != null && it != root }
        val paramOf = IntArray(rotations.size) { -1 }
        free.forEachIndexed { k, img -> paramOf[img] = k * 3 }
        val nParams = free.size * 3 + 1
        val logF0 = ln(focal0)
        var logF = logF0
        // Слабая привязка к начальному фокусному: нужна, только когда кадров мало и данные его почти не определяют.
        val priorWeight = 1.0

        val tmp = DoubleArray(3)
        fun world(img: Int, p: DoubleArray, r: Mat3, f: Double): DoubleArray {
            val s = sizes[img]
            val v = LinAlg.normalize(doubleArrayOf((p[0] - s[0] / 2.0) / f, (p[1] - s[1] / 2.0) / f, 1.0))
            r.apply(v[0], v[1], v[2], tmp)
            return doubleArrayOf(tmp[0], tmp[1], tmp[2])
        }

        fun residuals(rots: Array<Mat3?>, lf: Double): DoubleArray {
            val f = exp(lf)
            val out = DoubleArray(obs.size * 3 + 1)
            for ((k, o) in obs.withIndex()) {
                val wi = world(o.i, o.pi, rots[o.i]!!, f)
                val wj = world(o.j, o.pj, rots[o.j]!!, f)
                var rx = (wi[0] - wj[0]) * f; var ry = (wi[1] - wj[1]) * f; var rz = (wi[2] - wj[2]) * f
                // Хьюбер: большие ошибки (случайные ложные совпадения) весят меньше.
                val norm = sqrt(rx * rx + ry * ry + rz * rz)
                if (norm > 2.0) { val s = sqrt(2.0 / norm); rx *= s; ry *= s; rz *= s }
                out[k * 3] = rx; out[k * 3 + 1] = ry; out[k * 3 + 2] = rz
            }
            out[obs.size * 3] = priorWeight * (lf - logF0)
            return out
        }

        fun perturbed(base: Array<Mat3?>, delta: DoubleArray): Array<Mat3?> {
            val out = base.copyOf()
            for (img in free) {
                val o = paramOf[img]
                out[img] = Mat3.rodrigues(delta[o], delta[o + 1], delta[o + 2]) * base[img]!!
            }
            return out
        }

        fun cost(r: DoubleArray) = r.sumOf { it * it }

        var current = rotations.copyOf()
        var res = residuals(current, logF)
        var c = cost(res)
        var lambda = 1e-3
        val h = 1e-6
        repeat(config.bundleIterations) {
            // Численный якобиан: параметр влияет только на наблюдения своего кадра.
            val m = res.size
            val jac = Array(nParams) { DoubleArray(m) }
            for (img in free) for (a in 0..2) {
                val d = DoubleArray(nParams); d[paramOf[img] + a] = h
                val r2 = residuals(perturbed(current, d), logF)
                val col = jac[paramOf[img] + a]
                for (q in 0 until m) col[q] = (r2[q] - res[q]) / h
            }
            run {
                val r2 = residuals(current, logF + h)
                val col = jac[nParams - 1]
                for (q in 0 until m) col[q] = (r2[q] - res[q]) / h
            }
            val jtj = Array(nParams) { DoubleArray(nParams) }
            val jtr = DoubleArray(nParams)
            for (p in 0 until nParams) {
                val cp = jac[p]
                var s = 0.0
                for (q in 0 until m) s += cp[q] * res[q]
                jtr[p] = s
                for (p2 in p until nParams) {
                    val c2 = jac[p2]
                    var t = 0.0
                    for (q in 0 until m) t += cp[q] * c2[q]
                    jtj[p][p2] = t; jtj[p2][p] = t
                }
            }
            var improved = false
            for (attempt in 0 until 8) {
                val a = Array(nParams) { r -> DoubleArray(nParams) { cc -> jtj[r][cc] + if (r == cc) lambda * (jtj[r][r] + 1e-9) else 0.0 } }
                val step = LinAlg.solve(a, DoubleArray(nParams) { -jtr[it] }) ?: break
                val candRot = perturbed(current, step)
                val candF = logF + step[nParams - 1]
                val candRes = residuals(candRot, candF)
                val candC = cost(candRes)
                if (candC < c) {
                    val rel = (c - candC) / c
                    current = candRot; logF = candF; res = candRes; c = candC
                    lambda = max(lambda / 3, 1e-9)
                    improved = true
                    if (rel < 1e-7) return@repeat
                    break
                } else lambda *= 5
            }
            if (!improved) return@repeat
        }
        for (i in rotations.indices) rotations[i] = current[i]
        val rms = sqrt(c / max(1, obs.size))
        return exp(logF) to rms
    }

    /**
     * Выпрямление горизонта (как `waveCorrect` в OpenCV / "automatic
     * straightening" у Брауна-Лоу): оси X камер горизонтальной панорамы лежат
     * в одной плоскости - её нормаль и есть "вверх". Затем панорама
     * поворачивается так, чтобы её середина смотрела вперёд.
     */
    fun waveCorrect(rotations: Array<Mat3?>) {
        val rs = rotations.filterNotNull()
        if (rs.size < 2) return
        val moment = Array(3) { DoubleArray(3) }
        for (r in rs) {
            val x = r.column(0)
            for (a in 0..2) for (b in 0..2) moment[a][b] += x[a] * x[b]
        }
        val (values, vectors) = LinAlg.symmetricEigen(moment)
        // Если оси X почти параллельны (вертикальная панорама), плоскость не определена - не трогаем.
        if (values[1] < 1e-4 * values[0]) return
        var up = vectors[2] // наименьшее собственное значение
        val zSum = DoubleArray(3)
        for (r in rs) { val z = r.column(2); for (a in 0..2) zSum[a] += z[a] }
        var right = LinAlg.normalize(LinAlg.cross(up, zSum))
        var fwd = LinAlg.cross(right, up)
        var conf = 0.0
        for (r in rs) conf += LinAlg.dot(right, r.column(0))
        if (conf < 0) {
            right = doubleArrayOf(-right[0], -right[1], -right[2])
            up = doubleArrayOf(-up[0], -up[1], -up[2])
            fwd = LinAlg.cross(right, up)
        }
        val corr = Mat3.fromRows(right, up, fwd)
        for (i in rotations.indices) rotations[i] = rotations[i]?.let { corr * it }

        // Центрируем по горизонтали: средний взгляд - вдоль оси Z.
        var sx = 0.0; var sz = 0.0
        for (r in rotations.filterNotNull()) { val z = r.column(2); sx += z[0]; sz += z[2] }
        val yaw = atan2(sx, sz)
        val rotY = Mat3.rodrigues(0.0, -yaw, 0.0)
        for (i in rotations.indices) rotations[i] = rotations[i]?.let { rotY * it }
        // Чтобы "вверх" совпадал с -Y изображения (ось Y кадра направлена вниз).
        val downIsY = rotations.filterNotNull().sumOf { it.column(1)[1] }
        if (downIsY < 0) {
            val flip = Mat3.rodrigues(0.0, 0.0, Math.PI)
            for (i in rotations.indices) rotations[i] = rotations[i]?.let { flip * it }
        }
    }
}
