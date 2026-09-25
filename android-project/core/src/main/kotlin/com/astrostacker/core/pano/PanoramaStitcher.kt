package com.astrostacker.core.pano

import com.astrostacker.core.CropRect
import com.astrostacker.core.Rgb16Image
import kotlin.math.hypot

/** Этапы склейки панорамы - для прогресса в интерфейсе. */
enum class PanoStage { LOAD, FEATURES, MATCH, ALIGN, RENDER, DONE }

data class PanoProgress(val stage: PanoStage, val current: Int, val total: Int)

data class PanoConfig(
    /** null - выбрать автоматически по охвату панорамы. */
    val projection: PanoProjection? = null,
    val maxOutputPixels: Long = 30_000_000L,
    /** Эквивалентное фокусное (мм, 35-мм эквивалент), если в EXIF его нет. 26 мм - основная камера большинства телефонов. */
    val defaultFocal35mm: Double = 26.0,
    val features: PanoFeatures.Config = PanoFeatures.Config(),
    val align: PanoAlign.Config = PanoAlign.Config()
)

class PanoResult(
    val image: Rgb16Image,
    /** Прямоугольник без пустых краёв (доли 0..1). */
    val autoCrop: CropRect,
    /** Для каждого входного кадра: вошёл ли в панораму. */
    val included: List<Boolean>,
    val projection: PanoProjection,
    val horizontalDeg: Double,
    val verticalDeg: Double,
    val focalPx: Double,
    val rmsErrorPx: Double
)

/**
 * Склейка панорамы по схеме Brown & Lowe (AutoStitch) / OpenCV stitching:
 * особые точки -> сопоставление всех пар -> повороты камер (RANSAC) ->
 * общая подгонка (bundle adjustment) -> выпрямление горизонта -> проекция,
 * выравнивание экспозиции и мягкие швы. Порядок кадров не важен, можно
 * несколько рядов.
 */
object PanoramaStitcher {

    fun stitch(images: List<PanoImage>, config: PanoConfig = PanoConfig(), onProgress: (PanoProgress) -> Unit = {}): PanoResult {
        val align = align(images, config, onProgress)
        val (hDeg, vDeg) = PanoRender.angularExtent(images, align)
        val projection = config.projection ?: PanoRender.autoProjection(hDeg, vDeg)
        onProgress(PanoProgress(PanoStage.RENDER, 0, 100))
        val rendered = PanoRender.render(images, align, projection, config.maxOutputPixels) {
            onProgress(PanoProgress(PanoStage.RENDER, (it * 100).toInt(), 100))
        }
        onProgress(PanoProgress(PanoStage.DONE, 1, 1))
        return PanoResult(
            rendered.image, rendered.autoCrop, align.rotations.map { it != null }, projection,
            hDeg, vDeg, align.focalPx, align.rmsErrorPx
        )
    }

    /** Особые точки, сопоставление и совмещение - без отрисовки. */
    fun align(images: List<PanoImage>, config: PanoConfig = PanoConfig(), onProgress: (PanoProgress) -> Unit = {}): PanoAlignment {
        require(images.size >= 2) { "Нужно минимум 2 фото" }
        val n = images.size

        onProgress(PanoProgress(PanoStage.FEATURES, 0, n))
        val features = images.mapIndexed { i, img ->
            PanoFeatures.detect(img, config.features).also { onProgress(PanoProgress(PanoStage.FEATURES, i + 1, n)) }
        }

        // Начальное фокусное: из EXIF (35-мм эквивалент по диагонали 43.27 мм) или типичное для телефона.
        val ref = images[0]
        val diag = hypot(ref.width.toDouble(), ref.height.toDouble())
        val f35 = images.firstNotNullOfOrNull { it.focal35mm?.takeIf { v -> v > 5 } } ?: config.defaultFocal35mm
        val focal0 = f35 / 43.27 * diag

        val sizes = images.map { intArrayOf(it.width, it.height) }
        val totalPairs = n * (n - 1) / 2
        var done = 0
        onProgress(PanoProgress(PanoStage.MATCH, 0, totalPairs))
        val candidates = HashMap<Long, List<Pair<Int, Int>>>()
        for (i in 0 until n) for (j in i + 1 until n) {
            candidates[i * 100_000L + j] = PanoFeatures.match(features[i], features[j])
            onProgress(PanoProgress(PanoStage.MATCH, ++done, totalPairs))
        }
        fun verifiedPairs(focal: Double): List<PairMatch> {
            val out = ArrayList<PairMatch>()
            for (i in 0 until n) for (j in i + 1 until n) {
                PanoAlign.matchPair(i, j, features[i], features[j], candidates[i * 100_000L + j]!!, sizes[i], sizes[j], focal, config.align, seed = (i * 131 + j).toLong())
                    ?.let { out.add(it) }
            }
            return out
        }
        var pairs = verifiedPairs(focal0)
        require(pairs.isNotEmpty()) { "Не найдено перекрытий между фото - нужно 20-30% общего с соседним кадром" }

        onProgress(PanoProgress(PanoStage.ALIGN, 0, 2))
        var align = PanoAlign.align(sizes, pairs, focal0, config.align)
        // Если фокусное заметно уточнилось, отбраковка точек с неверным
        // фокусным могла выкинуть часть верных совпадений - повторяем с новым.
        if (kotlin.math.abs(align.focalPx / focal0 - 1) > 0.005) {
            val again = verifiedPairs(align.focalPx)
            if (again.isNotEmpty()) {
                val second = PanoAlign.align(sizes, again, align.focalPx, config.align)
                if (second.alignedCount >= align.alignedCount) { align = second; pairs = again }
            }
        }
        onProgress(PanoProgress(PanoStage.ALIGN, 2, 2))
        require(align.alignedCount >= 2) { "Не удалось связать фото между собой" }
        return align
    }
}
