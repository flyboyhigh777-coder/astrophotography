package com.astrostacker.core

import kotlin.math.abs

/**
 * МНК-подгонка аффинного преобразования (6 степеней свободы) — запасной
 * вариант, когда преобразования подобия недостаточно (см.
 * docs/ARCHITECTURE.md §3). x'=a*x+b*y+c ; y'=d*x+e*y+f — две независимые
 * линейные регрессии по (x,y,1), каждая решается по МНК методом Крамера.
 */
object AffineFit {

    fun fitLeastSquares(matches: List<PointMatch>): AffineTransform? {
        if (matches.size < 3) return null
        val (a, b, c) = solveLinearRegression(matches) { it.to.x } ?: return null
        val (d, e, f) = solveLinearRegression(matches) { it.to.y } ?: return null
        return AffineTransform(a, b, c, d, e, f)
    }

    /**
     * Решает target(x,y) = p*x + q*y + r по МНК. Нормальные уравнения:
     * M*[p,q,r]^T = rhs, M=[[Σx²,Σxy,Σx],[Σxy,Σy²,Σy],[Σx,Σy,n]], rhs=[Σx·t,Σy·t,Σt].
     */
    private fun solveLinearRegression(matches: List<PointMatch>, target: (PointMatch) -> Double): Triple<Double, Double, Double>? {
        var sxx = 0.0; var sxy = 0.0; var sx = 0.0
        var syy = 0.0; var sy = 0.0
        var n = 0.0
        var sxt = 0.0; var syt = 0.0; var st = 0.0

        for (m in matches) {
            val t = target(m)
            val x = m.from.x; val y = m.from.y
            sxx += x * x; sxy += x * y; sx += x
            syy += y * y; sy += y
            n += 1.0
            sxt += x * t; syt += y * t; st += t
        }

        return solve3x3(
            doubleArrayOf(sxx, sxy, sx),
            doubleArrayOf(sxy, syy, sy),
            doubleArrayOf(sx, sy, n),
            doubleArrayOf(sxt, syt, st)
        )
    }

    /** Метод Крамера: решает M*x=rhs, где строки M — [row0,row1,row2]. */
    private fun solve3x3(row0: DoubleArray, row1: DoubleArray, row2: DoubleArray, rhs: DoubleArray): Triple<Double, Double, Double>? {
        val det = determinant3x3(row0, row1, row2)
        if (abs(det) < 1e-9) return null

        // det с ПЕРВЫМ столбцом, заменённым на rhs
        val detP = determinant3x3(
            doubleArrayOf(rhs[0], row0[1], row0[2]),
            doubleArrayOf(rhs[1], row1[1], row1[2]),
            doubleArrayOf(rhs[2], row2[1], row2[2])
        )
        // det со ВТОРЫМ столбцом, заменённым на rhs
        val detQ = determinant3x3(
            doubleArrayOf(row0[0], rhs[0], row0[2]),
            doubleArrayOf(row1[0], rhs[1], row1[2]),
            doubleArrayOf(row2[0], rhs[2], row2[2])
        )
        // det с ТРЕТЬИМ столбцом, заменённым на rhs
        val detR = determinant3x3(
            doubleArrayOf(row0[0], row0[1], rhs[0]),
            doubleArrayOf(row1[0], row1[1], rhs[1]),
            doubleArrayOf(row2[0], row2[1], rhs[2])
        )
        return Triple(detP / det, detQ / det, detR / det)
    }

    private fun determinant3x3(r0: DoubleArray, r1: DoubleArray, r2: DoubleArray): Double =
        r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
            r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
            r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
}
