package com.astrostacker.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

data class RegistrationResult(
    val transform: Transform2D,
    val modelUsed: String, // "similarity" или "affine" - для логов/UI
    val inlierCount: Int,
    val totalCandidates: Int,
    val rmsResidualPx: Double,
    val fittedRotationDeg: Double,
    val expectedRotationDeg: Double?,
    val rotationMismatchWarning: Boolean
)

data class FrameRegistratorConfig(
    val triangleConfig: TriangleMatcherConfig = TriangleMatcherConfig(),
    val ransacConfig: RansacConfig = RansacConfig(),
    val affineEscalationRmsThresholdPx: Double = 1.5,
    val affineEscalationMinInliers: Int = 10,
    val rotationMismatchFactorThreshold: Double = 5.0
)

/**
 * Регистрация одного кадра относительно опорного по спискам уже найденных
 * звёзд (см. [StarDetector]). Оркестрирует [TriangleMatcher] →
 * [RansacTransformFitter] → (опционально) [AffineFit] → апостериорную
 * проверку по [EarthRotationModel]. См. docs/ARCHITECTURE.md §2.1, §3.
 */
object FrameRegistrator {

    fun register(
        referenceStars: List<Star>,
        targetStars: List<Star>,
        deltaSeconds: Double? = null,
        config: FrameRegistratorConfig = FrameRegistratorConfig()
    ): RegistrationResult? {
        val refPoints = referenceStars.map { Vec2(it.x, it.y) }
        val targetPoints = targetStars.map { Vec2(it.x, it.y) }

        val candidatePairs = TriangleMatcher.match(refPoints, targetPoints, config.triangleConfig)
        if (candidatePairs.isEmpty()) return null

        // from=точка в ТЕКУЩЕМ кадре, to=точка в ОПОРНОМ — итоговый transform.apply(p_кадра)=p_опорный.
        val candidateMatches = candidatePairs.map { (refIdx, targetIdx) ->
            PointMatch(from = targetPoints[targetIdx], to = refPoints[refIdx])
        }

        val ransac = RansacTransformFitter.fit(candidateMatches, config.ransacConfig) ?: return null

        var transform: Transform2D = ransac.transform
        var modelUsed = "similarity"
        var rms = ransac.rmsResidual

        if (rms > config.affineEscalationRmsThresholdPx && ransac.inlierIndices.size >= config.affineEscalationMinInliers) {
            val inlierMatches = ransac.inlierIndices.map { candidateMatches[it] }
            val affine = AffineFit.fitLeastSquares(inlierMatches)
            if (affine != null) {
                val affineRms = rmsResidualAffine(affine, inlierMatches)
                if (affineRms < rms) {
                    transform = affine
                    modelUsed = "affine"
                    rms = affineRms
                }
            }
        }

        val fittedRotationDeg = when (val t = transform) {
            is SimilarityTransform -> Math.toDegrees(t.rotationRad)
            is AffineTransform -> Math.toDegrees(atan2(t.d, t.a))
        }

        val expectedRotationDeg = deltaSeconds?.let { EarthRotationModel.expectedRotationDegrees(it) }
        // Допуск = относительная доля от ожидаемого угла (учитывает эффекты
        // широкого угла/гомографии, растущие вместе с самим поворотом) ПЛЮС
        // небольшая абсолютная константа (учитывает обычное дрожание камеры,
        // когда ожидаемый угол сам по себе крошечный). Именно вторая часть
        // защищает от ложных срабатываний, а не отсечение по величине
        // ожидаемого угла - иначе (как показал тест на реальных данных)
        // пропускаются САМЫЕ явные нестыковки, когда ожидаемый угол мал,
        // а найденный - велик.
        val mismatch = expectedRotationDeg != null &&
            abs(abs(fittedRotationDeg) - expectedRotationDeg) > expectedRotationDeg * config.rotationMismatchFactorThreshold + 0.05

        return RegistrationResult(
            transform = transform,
            modelUsed = modelUsed,
            inlierCount = ransac.inlierIndices.size,
            totalCandidates = candidateMatches.size,
            rmsResidualPx = rms,
            fittedRotationDeg = fittedRotationDeg,
            expectedRotationDeg = expectedRotationDeg,
            rotationMismatchWarning = mismatch
        )
    }

    private fun rmsResidualAffine(transform: AffineTransform, matches: List<PointMatch>): Double {
        if (matches.isEmpty()) return 0.0
        var sumSq = 0.0
        for (m in matches) {
            val p = transform.apply(m.from)
            val dx = p.x - m.to.x; val dy = p.y - m.to.y
            sumSq += dx * dx + dy * dy
        }
        return sqrt(sumSq / matches.size)
    }
}
