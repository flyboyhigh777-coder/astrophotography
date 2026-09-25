package com.astrostacker.core.pano

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Матрица 3×3 по строкам (m[r*3+c]) - для поворотов камер. */
class Mat3(val m: DoubleArray = doubleArrayOf(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)) {

    operator fun get(r: Int, c: Int) = m[r * 3 + c]

    operator fun times(o: Mat3): Mat3 {
        val out = DoubleArray(9)
        for (r in 0..2) for (c in 0..2) {
            out[r * 3 + c] = m[r * 3] * o.m[c] + m[r * 3 + 1] * o.m[3 + c] + m[r * 3 + 2] * o.m[6 + c]
        }
        return Mat3(out)
    }

    fun transpose(): Mat3 = Mat3(doubleArrayOf(m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]))

    /** this · v */
    fun apply(x: Double, y: Double, z: Double, out: DoubleArray) {
        out[0] = m[0] * x + m[1] * y + m[2] * z
        out[1] = m[3] * x + m[4] * y + m[5] * z
        out[2] = m[6] * x + m[7] * y + m[8] * z
    }

    fun column(c: Int) = doubleArrayOf(m[c], m[3 + c], m[6 + c])

    companion object {
        val IDENTITY get() = Mat3()

        /** Поворот вокруг оси [rv] на угол |rv| (формула Родрига). */
        fun rodrigues(rx: Double, ry: Double, rz: Double): Mat3 {
            val theta = sqrt(rx * rx + ry * ry + rz * rz)
            if (theta < 1e-12) return Mat3()
            val kx = rx / theta; val ky = ry / theta; val kz = rz / theta
            val c = cos(theta); val s = sin(theta); val t = 1 - c
            return Mat3(doubleArrayOf(
                t * kx * kx + c, t * kx * ky - s * kz, t * kx * kz + s * ky,
                t * kx * ky + s * kz, t * ky * ky + c, t * ky * kz - s * kx,
                t * kx * kz - s * ky, t * ky * kz + s * kx, t * kz * kz + c
            ))
        }

        fun fromRows(r0: DoubleArray, r1: DoubleArray, r2: DoubleArray) =
            Mat3(doubleArrayOf(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]))

        /** Кватернион (w, x, y, z) -> матрица поворота. */
        fun fromQuaternion(w: Double, x: Double, y: Double, z: Double): Mat3 {
            val n = sqrt(w * w + x * x + y * y + z * z)
            val a = w / n; val b = x / n; val c = y / n; val d = z / n
            return Mat3(doubleArrayOf(
                a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c),
                2 * (b * c + a * d), a * a - b * b + c * c - d * d, 2 * (c * d - a * b),
                2 * (b * d - a * c), 2 * (c * d + a * b), a * a - b * b - c * c + d * d
            ))
        }
    }
}

internal object LinAlg {

    fun cross(a: DoubleArray, b: DoubleArray) = doubleArrayOf(
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    )

    fun dot(a: DoubleArray, b: DoubleArray) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    fun normalize(a: DoubleArray): DoubleArray {
        val n = sqrt(dot(a, a))
        return if (n < 1e-15) a else doubleArrayOf(a[0] / n, a[1] / n, a[2] / n)
    }

    /**
     * Собственные значения и векторы симметричной матрицы n×n методом Якоби.
     * Возвращает значения по убыванию и векторы-столбцы в том же порядке.
     */
    fun symmetricEigen(input: Array<DoubleArray>): Pair<DoubleArray, Array<DoubleArray>> {
        val n = input.size
        val a = Array(n) { input[it].copyOf() }
        val v = Array(n) { r -> DoubleArray(n) { c -> if (r == c) 1.0 else 0.0 } }
        repeat(100) {
            var off = 0.0
            for (p in 0 until n) for (q in p + 1 until n) off += a[p][q] * a[p][q]
            if (off < 1e-22) return@repeat
            for (p in 0 until n) for (q in p + 1 until n) {
                if (abs(a[p][q]) < 1e-300) continue
                val theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
                val t = (if (theta >= 0) 1.0 else -1.0) / (abs(theta) + sqrt(theta * theta + 1))
                val c = 1 / sqrt(t * t + 1); val s = t * c
                for (k in 0 until n) {
                    val akp = a[k][p]; val akq = a[k][q]
                    a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq
                }
                for (k in 0 until n) {
                    val apk = a[p][k]; val aqk = a[q][k]
                    a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk
                }
                for (k in 0 until n) {
                    val vkp = v[k][p]; val vkq = v[k][q]
                    v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq
                }
            }
        }
        val order = (0 until n).sortedByDescending { a[it][it] }
        val values = DoubleArray(n) { a[order[it]][order[it]] }
        val vectors = Array(n) { i -> DoubleArray(n) { r -> v[r][order[i]] } }
        return values to vectors
    }

    /**
     * Поворот R, наилучшим образом переводящий единичные векторы [from] в [to]
     * (метод Хорна через кватернионы). Работает и для двух пар векторов.
     */
    fun bestRotation(from: List<DoubleArray>, to: List<DoubleArray>): Mat3 {
        var sxx = 0.0; var sxy = 0.0; var sxz = 0.0
        var syx = 0.0; var syy = 0.0; var syz = 0.0
        var szx = 0.0; var szy = 0.0; var szz = 0.0
        for (k in from.indices) {
            val a = from[k]; val b = to[k]
            sxx += a[0] * b[0]; sxy += a[0] * b[1]; sxz += a[0] * b[2]
            syx += a[1] * b[0]; syy += a[1] * b[1]; syz += a[1] * b[2]
            szx += a[2] * b[0]; szy += a[2] * b[1]; szz += a[2] * b[2]
        }
        val nMat = arrayOf(
            doubleArrayOf(sxx + syy + szz, syz - szy, szx - sxz, sxy - syx),
            doubleArrayOf(syz - szy, sxx - syy - szz, sxy + syx, szx + sxz),
            doubleArrayOf(szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy),
            doubleArrayOf(sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz)
        )
        val (_, vecs) = symmetricEigen(nMat)
        val q = vecs[0]
        return Mat3.fromQuaternion(q[0], q[1], q[2], q[3])
    }

    /** Решение A·x = b методом Гаусса с выбором главного элемента; null - вырожденная система. */
    fun solve(aIn: Array<DoubleArray>, bIn: DoubleArray): DoubleArray? {
        val n = bIn.size
        val a = Array(n) { aIn[it].copyOf() }
        val b = bIn.copyOf()
        for (col in 0 until n) {
            var piv = col
            for (r in col + 1 until n) if (abs(a[r][col]) > abs(a[piv][col])) piv = r
            if (abs(a[piv][col]) < 1e-14) return null
            if (piv != col) { val t = a[piv]; a[piv] = a[col]; a[col] = t; val tb = b[piv]; b[piv] = b[col]; b[col] = tb }
            for (r in col + 1 until n) {
                val f = a[r][col] / a[col][col]
                if (f == 0.0) continue
                for (c in col until n) a[r][c] -= f * a[col][c]
                b[r] -= f * b[col]
            }
        }
        val x = DoubleArray(n)
        for (r in n - 1 downTo 0) {
            var s = b[r]
            for (c in r + 1 until n) s -= a[r][c] * x[c]
            x[r] = s / a[r][r]
        }
        return x
    }
}
