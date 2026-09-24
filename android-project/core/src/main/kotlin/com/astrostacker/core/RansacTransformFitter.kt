package com.astrostacker.core

import kotlin.math.hypot

data class RansacConfig(
    val inlierThresholdPx: Double = 2.0,
    val maxIterations: Int = 1000,
    val randomSeed: Long = 42L,
    val minInliers: Int = 6
)

data class RansacResult(
    val transform: SimilarityTransform,
    val inlierIndices: List<Int>,
    val rmsResidual: Double
)

/**
 * RANSAC (Fischler & Bolles, 1981) поверх замкнутого 2-точечного решения для
 * преобразования подобия — отбрасывает ложные сопоставления звёзд перед
 * финальной МНК-подгонкой ([SimilarityFit]). См. docs/LITERATURE.md §2.2.
 * Использует java.util.Random (а не kotlin.random) — детерминированный
 * результат при фиксированном randomSeed, без риска расхождений между
 * версиями стандартной библиотеки Kotlin.
 */
object RansacTransformFitter {

    fun fit(matches: List<PointMatch>, config: RansacConfig = RansacConfig()): RansacResult? {
        if (matches.size < 2) return null
        val random = java.util.Random(config.randomSeed)
        val n = matches.size

        var bestInliers: List<Int> = emptyList()
        var bestTransform: SimilarityTransform? = null

        repeat(config.maxIterations) {
            val i1 = random.nextInt(n)
            var i2 = random.nextInt(n)
            while (i2 == i1) { i2 = random.nextInt(n) }

            val candidate = SimilarityTransform.fromTwoPoints(matches[i1], matches[i2]) ?: return@repeat
            // Отбрасываем гипотезы с абсурдным масштабом — как правило, следствие
            // двух почти коллинеарных с центром или почти совпадающих точек.
            if (candidate.scale < 0.5 || candidate.scale > 2.0) return@repeat

            val inliers = ArrayList<Int>()
            for (idx in matches.indices) {
                val predicted = candidate.apply(matches[idx].from)
                val dx = predicted.x - matches[idx].to.x
                val dy = predicted.y - matches[idx].to.y
                if (hypot(dx, dy) <= config.inlierThresholdPx) inliers.add(idx)
            }

            if (inliers.size > bestInliers.size) {
                bestInliers = inliers
                bestTransform = candidate
            }
        }

        val finalTransform = bestTransform ?: return null
        if (bestInliers.size < config.minInliers) return null

        val inlierMatches = bestInliers.map { matches[it] }
        val refined = SimilarityFit.fitLeastSquares(inlierMatches) ?: finalTransform
        val rms = SimilarityFit.rmsResidual(refined, inlierMatches)

        return RansacResult(refined, bestInliers, rms)
    }
}
