package com.astrostacker.core

/** Этап пайплайна для колбэка прогресса — :app привязывает его к UI. */
enum class Stage { DETECT_STARS, REGISTER, STACK, BACKGROUND, STRETCH, NOISE_REDUCTION, DONE }

data class ProgressUpdate(val stage: Stage, val current: Int, val total: Int, val message: String = "")

/** [captureEpochSeconds] — секунды эпохи Unix из EXIF DateTimeOriginal (для EarthRotationModel); может быть null. */
data class FrameInput(val image: FloatImage, val captureEpochSeconds: Double?)

data class PipelineConfig(
    val starDetector: StarDetectorConfig = StarDetectorConfig(),
    val registrator: FrameRegistratorConfig = FrameRegistratorConfig(),
    val combiner: StackCombinerConfig = StackCombinerConfig(),
    val backgroundExtraction: BackgroundExtractor.Config = BackgroundExtractor.Config(),
    val stretchTargetLevel: Double = 0.25,
    val applyNoiseReduction: Boolean = true,
    /** -1 = выбрать автоматически, см. [Pipeline.selectReferenceFrame]. */
    val referenceFrameIndex: Int = -1
)

data class FrameOutcome(val index: Int, val accepted: Boolean, val registration: RegistrationResult?, val reason: String)

data class PipelineResult(
    val stackedLinear: FloatImage,
    val finalImage: FloatImage,
    val frameOutcomes: List<FrameOutcome>,
    val referenceFrameIndex: Int
)

/**
 * Верхнеуровневый оркестратор: детекция звёзд → регистрация → стекинг →
 * удаление градиента → нейтрализация цвета → растяжка → (опционально)
 * шумоподавление. Без корутин/Android-зависимостей — см.
 * docs/ARCHITECTURE.md §2.1. Предполагается, что все входные кадры одного
 * разрешения (одна камера/объектив, без изменения зума между кадрами) —
 * стандартное условие для этого сценария съёмки.
 */
object Pipeline {

    fun run(
        frames: List<FrameInput>,
        config: PipelineConfig = PipelineConfig(),
        onProgress: (ProgressUpdate) -> Unit = {}
    ): PipelineResult {
        require(frames.size >= 2) { "Нужно минимум 2 кадра" }

        val refIdx = if (config.referenceFrameIndex in frames.indices) config.referenceFrameIndex else selectReferenceFrame(frames)

        onProgress(ProgressUpdate(Stage.DETECT_STARS, 0, frames.size))
        val starsPerFrame = frames.mapIndexed { i, f ->
            val stars = StarDetector.detect(f.image.luminance(), config.starDetector)
            onProgress(ProgressUpdate(Stage.DETECT_STARS, i + 1, frames.size))
            stars
        }

        val referenceStars = starsPerFrame[refIdx]
        val outcomes = ArrayList<FrameOutcome>()
        val stackFrames = ArrayList<StackFrame>()

        onProgress(ProgressUpdate(Stage.REGISTER, 0, frames.size))
        for (i in frames.indices) {
            if (i == refIdx) {
                stackFrames.add(StackFrame(frames[i].image, SimilarityTransform.IDENTITY))
                outcomes.add(FrameOutcome(i, true, null, "опорный кадр"))
                onProgress(ProgressUpdate(Stage.REGISTER, i + 1, frames.size))
                continue
            }
            val refTime = frames[refIdx].captureEpochSeconds
            val curTime = frames[i].captureEpochSeconds
            val deltaSeconds = if (refTime != null && curTime != null) curTime - refTime else null

            val registration = FrameRegistrator.register(referenceStars, starsPerFrame[i], deltaSeconds, config.registrator)
            if (registration == null) {
                outcomes.add(FrameOutcome(i, false, null, "не удалось найти достаточно совпадающих звёзд"))
            } else {
                stackFrames.add(StackFrame(frames[i].image, registration.transform))
                outcomes.add(FrameOutcome(i, true, registration, "ok"))
            }
            onProgress(ProgressUpdate(Stage.REGISTER, i + 1, frames.size))
        }

        require(stackFrames.size >= 2) { "Слишком мало кадров успешно зарегистрировано (нужно минимум 2)" }

        onProgress(ProgressUpdate(Stage.STACK, 0, 1))
        val width = frames[refIdx].image.width
        val height = frames[refIdx].image.height
        val stacked = TiledStacker.stack(width, height, stackFrames, config.combiner)
        onProgress(ProgressUpdate(Stage.STACK, 1, 1))

        val finalImage = postProcess(stacked, config, onProgress)
        return PipelineResult(stacked, finalImage, outcomes, refIdx)
    }

    /**
     * Фон → нейтрализация цвета → растяжка → (опционально) шумоподавление,
     * применяемые к уже готовому линейному стеку [stackedLinear]. Вынесено из
     * [run] в отдельную публичную функцию, чтобы UI мог дёшево пересчитать
     * только "художественную" часть (уровень растяжки, шумоподавление вкл/выкл)
     * без повторной детекции звёзд/регистрации/стекинга кадров — это самая
     * долгая часть пайплайна и она не зависит от этих параметров. Один и тот же
     * код используется и здесь, и в [run] — см. docs/ARCHITECTURE.md §2.1.
     */
    fun postProcess(
        stackedLinear: FloatImage,
        config: PipelineConfig = PipelineConfig(),
        onProgress: (ProgressUpdate) -> Unit = {}
    ): FloatImage {
        val width = stackedLinear.width
        val height = stackedLinear.height

        onProgress(ProgressUpdate(Stage.BACKGROUND, 0, 1))
        // Звёзды детектируются заново на самом СТЕКЕ (у него лучше SNR, чем у
        // любого отдельного кадра) — маска нужна, чтобы BackgroundExtractor не
        // принял звёзды за часть градиента фона.
        val starsForMask = StarDetector.detect(stackedLinear.luminance(), config.starDetector)
        val starMaskArray = buildStarMask(width, height, starsForMask)
        val bgConfig = config.backgroundExtraction.copy(starMask = { x, y -> starMaskArray[y * width + x] })

        val (bgSubR, _) = BackgroundExtractor.extractAndSubtract(GrayImage(width, height, stackedLinear.r), bgConfig)
        val (bgSubG, _) = BackgroundExtractor.extractAndSubtract(GrayImage(width, height, stackedLinear.g), bgConfig)
        val (bgSubB, _) = BackgroundExtractor.extractAndSubtract(GrayImage(width, height, stackedLinear.b), bgConfig)
        var processed = FloatImage(width, height, bgSubR.data, bgSubG.data, bgSubB.data)
        processed = BackgroundNeutralizer.neutralize(processed)
        onProgress(ProgressUpdate(Stage.BACKGROUND, 1, 1))

        onProgress(ProgressUpdate(Stage.STRETCH, 0, 1))
        // Фон после вычитания градиента колеблется около нуля (иногда чуть
        // ниже) - это НЕ то же самое, что "реально тёмный, но положительный"
        // фон линейного стека. Если отдать в autoMidtoneForBackground значение
        // около нуля буквально, формула потребует m→0 и растянет шум фона так
        // же сильно, как звёзды (см. MidtoneStretch.kt). Поэтому используем
        // max(медиана, 2×σ шума фона) - ниже собственного шумового пола фон
        // всё равно статистически неотличим от нуля, тянуть растяжку к этому
        // уровню бессмысленно и вредно.
        val bgPixelStats = Stats.sigmaClipped(sampleEveryNth(processed.luminance().data, 4))
        val avgBg = kotlin.math.max(bgPixelStats.median, 2.0 * bgPixelStats.stdDev).coerceAtLeast(1e-4)
        val m = MidtoneStretch.autoMidtoneForBackground(avgBg, config.stretchTargetLevel)
        var finalImage = MidtoneStretch.stretchImage(processed, m)
        onProgress(ProgressUpdate(Stage.STRETCH, 1, 1))

        if (config.applyNoiseReduction) {
            onProgress(ProgressUpdate(Stage.NOISE_REDUCTION, 0, 1))
            finalImage = NoiseReducer.reduceChromaNoise(finalImage)
            onProgress(ProgressUpdate(Stage.NOISE_REDUCTION, 1, 1))
        }

        onProgress(ProgressUpdate(Stage.DONE, 1, 1))
        return finalImage
    }

    /** Опорный кадр — ближайший по времени к середине серии (как Starry Landscape Stacker). */
    fun selectReferenceFrame(frames: List<FrameInput>): Int {
        var minT = Double.POSITIVE_INFINITY
        var maxT = Double.NEGATIVE_INFINITY
        var any = false
        for (f in frames) {
            val t = f.captureEpochSeconds ?: continue
            any = true
            if (t < minT) minT = t
            if (t > maxT) maxT = t
        }
        if (!any) return frames.size / 2
        val mid = (minT + maxT) / 2.0
        var bestIdx = 0
        var bestDist = Double.POSITIVE_INFINITY
        for (i in frames.indices) {
            val t = frames[i].captureEpochSeconds ?: continue
            val dist = kotlin.math.abs(t - mid)
            if (dist < bestDist) { bestDist = dist; bestIdx = i }
        }
        return bestIdx
    }

    private fun sampleEveryNth(data: FloatArray, stride: Int): List<Double> {
        val values = ArrayList<Double>(data.size / stride + 1)
        var i = 0
        while (i < data.size) { values.add(data[i].toDouble()); i += stride }
        return values
    }

    private fun buildStarMask(width: Int, height: Int, stars: List<Star>, radius: Int = 6): BooleanArray {
        val mask = BooleanArray(width * height)
        for (s in stars) {
            val cx = s.x.toInt(); val cy = s.y.toInt()
            for (dy in -radius..radius) {
                for (dx in -radius..radius) {
                    if (dx * dx + dy * dy > radius * radius) continue
                    val xx = cx + dx; val yy = cy + dy
                    if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
                    mask[yy * width + xx] = true
                }
            }
        }
        return mask
    }
}
