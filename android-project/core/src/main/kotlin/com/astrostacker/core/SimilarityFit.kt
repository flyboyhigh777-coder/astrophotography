package com.astrostacker.core

import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * МНК-подгонка преобразования подобия по набору соответствий точек. Замкнутая
 * форма через комплексные числа: минимизирует Σ|v_i - a*u_i|² после
 * центрирования (u=from-mean(from), v=to-mean(to)), что для 2D подобия
 * (поворот+масштаб+сдвиг, без отражения) даёт то же решение, что и
 * ортогональный Прокруст/Umeyama (1991). См. docs/LITERATURE.md §2.2.
 */
object SimilarityFit {

    fun fitLeastSquares(matches: List<PointMatch>): SimilarityTransform? {
        val n = matches.size
        if (n < 2) return null

        var meanFromX = 0.0; var meanFromY = 0.0
        var meanToX = 0.0; var meanToY = 0.0
        for (m in matches) {
            meanFromX += m.from.x; meanFromY += m.from.y
            meanToX += m.to.x; meanToY += m.to.y
        }
        meanFromX /= n; meanFromY /= n; meanToX /= n; meanToY /= n

        // a = Σ conj(u_i)*v_i / Σ|u_i|² ,  conj(u)*v = (ux*vx+uy*vy) + i(ux*vy-uy*vx)
        var numRe = 0.0; var numIm = 0.0; var den = 0.0
        for (m in matches) {
            val ux = m.from.x - meanFromX; val uy = m.from.y - meanFromY
            val vx = m.to.x - meanToX; val vy = m.to.y - meanToY
            numRe += ux * vx + uy * vy
            numIm += ux * vy - uy * vx
            den += ux * ux + uy * uy
        }
        if (den < 1e-9) return null
        val aRe = numRe / den
        val aIm = numIm / den
        val scale = hypot(aRe, aIm)
        if (scale < 1e-9) return null
        val rotation = atan2(aIm, aRe)

        // b = meanTo - a*meanFrom
        val bRe = meanToX - (aRe * meanFromX - aIm * meanFromY)
        val bIm = meanToY - (aRe * meanFromY + aIm * meanFromX)

        return SimilarityTransform(scale, rotation, bRe, bIm)
    }

    /** RMS-ошибка преобразования на заданных соответствиях (в пикселях). */
    fun rmsResidual(transform: SimilarityTransform, matches: List<PointMatch>): Double {
        if (matches.isEmpty()) return 0.0
        var sumSq = 0.0
        for (m in matches) {
            val predicted = transform.apply(m.from)
            val dx = predicted.x - m.to.x
            val dy = predicted.y - m.to.y
            sumSq += dx * dx + dy * dy
        }
        return sqrt(sumSq / matches.size)
    }
}
