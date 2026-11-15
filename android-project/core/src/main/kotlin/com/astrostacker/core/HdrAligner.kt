package com.astrostacker.core

import com.astrostacker.core.pano.PanoFeatures
import com.astrostacker.core.pano.PanoImage
import kotlin.math.sqrt

/** [reason] - для экрана результата ("ok"/почему кадр не вошёл в слияние). */
data class HdrFrameOutcome(
    val index: Int,
    val accepted: Boolean,
    val reason: String,
    val inlierCount: Int = 0,
    val rmsResidualPx: Double = 0.0
)

data class HdrAlignResult(
    val referenceIndex: Int,
    /** Только успешно совмещённые кадры - уже готовы для [FrameWarp]/[ExposureFusion]. */
    val frames: List<StackFrame>,
    val outcomes: List<HdrFrameOutcome>
)

/**
 * Совмещение серии кадров с разной выдержкой одной и той же (почти)
 * неподвижной сцены - штатив или рука, без осознанного поворота камеры
 * между кадрами (в отличие от панорамы) и без вращения звёздного неба (в
 * отличие от "Астро"), только небольшой сдвиг/поворот от дрожания руки или
 * лёгкого ветра на штативе. Использует те же особые точки Харриса +
 * дескрипторы MOPS, что и склейка панорамы (см. [PanoFeatures]) - они
 * специально устойчивы к разнице в экспозиции между кадрами (Brown,
 * Szeliski, Winder, 2005) - но модель преобразования проще (подобие, как
 * при совмещении звёзд, см. [FrameRegistrator]), а не гомография: кадры
 * одной HDR-серии снимаются с одной и той же точки, без намеренного поворота.
 */
object HdrAligner {

    data class Config(
        val features: PanoFeatures.Config = PanoFeatures.Config(),
        val ransac: RansacConfig = RansacConfig(inlierThresholdPx = 3.0, minInliers = 8),
        val affineEscalationRmsThresholdPx: Double = 2.0,
        val affineEscalationMinInliers: Int = 12
    )

    /**
     * Опорный кадр - с МЕДИАННОЙ средней яркостью, а не первый по порядку:
     * у самого тёмного и самого светлого кадра серии меньше чётких особых
     * точек (пересвет/недосвет размывает контраст), совмещать остальные
     * кадры к такому опорному сложнее.
     */
    fun selectReferenceFrame(images: List<FloatImage>): Int {
        val means = images.map { meanLuminance(it) }
        val order = means.indices.sortedBy { means[it] }
        return order[order.size / 2]
    }

    fun align(images: List<FloatImage>, config: Config = Config(), onProgress: (Int, Int) -> Unit = { _, _ -> }): HdrAlignResult {
        require(images.size >= 2) { "Нужно минимум 2 кадра" }
        val total = images.size
        val refIdx = selectReferenceFrame(images)

        val features = images.mapIndexed { i, image ->
            PanoFeatures.detect(PanoImage.fromFloatImage(image), config.features).also { onProgress(i + 1, total) }
        }
        val referenceFeatures = features[refIdx]

        val outcomes = ArrayList<HdrFrameOutcome>()
        val stackFrames = ArrayList<StackFrame>()

        for (i in images.indices) {
            if (i == refIdx) {
                stackFrames.add(StackFrame(images[i], SimilarityTransform.IDENTITY))
                outcomes.add(HdrFrameOutcome(i, true, "опорный кадр"))
                continue
            }

            val candidatePairs = PanoFeatures.match(features[i], referenceFeatures)
            val matches = candidatePairs.map { (targetIdx, refFeatureIdx) ->
                val target = features[i][targetIdx]
                val ref = referenceFeatures[refFeatureIdx]
                PointMatch(from = Vec2(target.x, target.y), to = Vec2(ref.x, ref.y))
            }

            val ransac = RansacTransformFitter.fit(matches, config.ransac)
            if (ransac == null) {
                outcomes.add(HdrFrameOutcome(i, false, "не удалось найти достаточно совпадающих точек"))
                continue
            }

            var transform: Transform2D = ransac.transform
            var rms = ransac.rmsResidual
            if (rms > config.affineEscalationRmsThresholdPx && ransac.inlierIndices.size >= config.affineEscalationMinInliers) {
                val inlierMatches = ransac.inlierIndices.map { matches[it] }
                val affine = AffineFit.fitLeastSquares(inlierMatches)
                if (affine != null) {
                    val affineRms = rmsResidual(affine, inlierMatches)
                    if (affineRms < rms) { transform = affine; rms = affineRms }
                }
            }
            stackFrames.add(StackFrame(images[i], transform))
            outcomes.add(HdrFrameOutcome(i, true, "ok", ransac.inlierIndices.size, rms))
        }

        return HdrAlignResult(refIdx, stackFrames, outcomes)
    }

    private fun meanLuminance(image: FloatImage): Double {
        val lum = image.luminance()
        var sum = 0.0
        for (v in lum.data) sum += v
        return sum / lum.data.size
    }

    private fun rmsResidual(transform: Transform2D, matches: List<PointMatch>): Double {
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
