package com.astrostacker.core

import com.astrostacker.core.pano.PanoFeatures
import com.astrostacker.core.pano.PanoImage
import kotlin.math.abs
import kotlin.math.hypot
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
    /**
     * Позиция опорного кадра ВНУТРИ [frames] - НЕ совпадает с [referenceIndex],
     * если более ранние по порядку кадры были отброшены (неправдоподобное
     * совмещение). Нужна [ExposureFusion] для обнаружения "призраков"
     * ([GhostDetector]) - там опорный кадр ищется по позиции в уже
     * отфильтрованном списке, а не по исходному индексу.
     */
    val referenceFrameIndex: Int,
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
        // Строже, чем у панорамы (0.75 по умолчанию): повторяющаяся текстура
        // (листва, трава, кирпич) даёт много похожих, но не идентичных
        // патчей - при мягком тесте Лоу ложное сопоставление запросто
        // проходит, т.к. второй по близости кандидат почти не хуже первого.
        val matchRatio: Double = 0.65,
        val ransac: RansacConfig = RansacConfig(inlierThresholdPx = 3.0, minInliers = 10),
        val affineEscalationRmsThresholdPx: Double = 2.0,
        val affineEscalationMinInliers: Int = 12,
        /**
         * Кадры одной HDR-серии снимаются без намеренного зума - если
         * найденное преобразование подразумевает масштаб заметно не 1.0, оно
         * почти наверняка ложное (типичный симптом повторяющейся текстуры,
         * сбившей сопоставление точек), а не отражает реальное движение
         * камеры. Такой кадр лучше исключить, чем получить из него полосы
         * "размазанного" края на развороте (см. FrameWarp).
         */
        val maxScaleDeviation: Double = 0.08,
        /** Сдвиг (доля диагонали кадра) выше этого считается неправдоподобным для одной серии. */
        val maxTranslationFraction: Double = 0.25
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
        var referenceFrameIndex = -1

        for (i in images.indices) {
            if (i == refIdx) {
                referenceFrameIndex = stackFrames.size
                stackFrames.add(StackFrame(images[i], SimilarityTransform.IDENTITY))
                outcomes.add(HdrFrameOutcome(i, true, "опорный кадр"))
                continue
            }

            val candidatePairs = PanoFeatures.match(features[i], referenceFeatures, config.matchRatio)
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

            if (!isPlausible(transform, images[i].width, images[i].height, config)) {
                outcomes.add(HdrFrameOutcome(i, false, "совмещение получилось неправдоподобным (похоже, повторяющаяся текстура сбила сопоставление точек)", ransac.inlierIndices.size, rms))
                continue
            }
            stackFrames.add(StackFrame(images[i], transform))
            outcomes.add(HdrFrameOutcome(i, true, "ok", ransac.inlierIndices.size, rms))
        }

        return HdrAlignResult(refIdx, referenceFrameIndex, stackFrames, outcomes)
    }

    /**
     * Проверка здравого смысла поверх геометрической подгонки: RANSAC+МНК
     * математически корректны и для ложного, но внутренне согласованного
     * набора соответствий (именно так ведёт себя периодическая текстура -
     * листва, трава, кладка - согласующиеся, но неверные совпадения). Кадры
     * одной HDR-серии снимаются с одной точки без намеренного зума/поворота,
     * поэтому неправдоподобный масштаб или огромный сдвиг - надёжный сигнал,
     * что геометрия найдена неверно, а не то, что камера и правда так
     * сдвинулась.
     */
    private fun isPlausible(transform: Transform2D, width: Int, height: Int, config: Config): Boolean {
        val diag = hypot(width.toDouble(), height.toDouble())
        return when (transform) {
            is SimilarityTransform ->
                abs(transform.scale - 1.0) <= config.maxScaleDeviation &&
                    hypot(transform.tx, transform.ty) <= config.maxTranslationFraction * diag
            is AffineTransform -> {
                // Приближённый масштаб по столбцам линейной части (a,d) и (b,e).
                val scaleX = hypot(transform.a, transform.d)
                val scaleY = hypot(transform.b, transform.e)
                abs(scaleX - 1.0) <= config.maxScaleDeviation &&
                    abs(scaleY - 1.0) <= config.maxScaleDeviation &&
                    hypot(transform.c, transform.f) <= config.maxTranslationFraction * diag
            }
        }
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
