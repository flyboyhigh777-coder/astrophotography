package com.astrostacker.core

/** Этап пайплайна для колбэка прогресса — :app привязывает его к UI. */
/** [LOAD] - чтение и калибровка кадров, выполняется в :app до [Pipeline.run]. */
enum class Stage { LOAD, DETECT_STARS, REGISTER, GROUND, STACK, DONE }

data class ProgressUpdate(val stage: Stage, val current: Int, val total: Int, val message: String = "")

/** [captureEpochSeconds] — секунды эпохи Unix из EXIF DateTimeOriginal (для EarthRotationModel); может быть null. */
data class FrameInput(val image: FloatImage, val captureEpochSeconds: Double?)

data class PipelineConfig(
    val starDetector: StarDetectorConfig = StarDetectorConfig(),
    val registrator: FrameRegistratorConfig = FrameRegistratorConfig(),
    val combiner: StackCombinerConfig = StackCombinerConfig(),
    val groundMask: GroundMask.Config = GroundMask.Config(),
    /** Землю (всё, что не движется со звёздами) не совмещать по звёздам, а брать отдельным стеком. */
    val freezeGround: Boolean = true,
    /**
     * Сколько первых по времени кадров серии усреднить для земли (без
     * совмещения - земля неподвижна). Не все: за время серии меняется
     * освещение (луна, фары, облака). Игнорируется, если переданы отдельные
     * кадры земли.
     */
    val groundFrameCount: Int = 5,
    /** -1 = первый по времени съёмки кадр, см. [Pipeline.selectReferenceFrame]. */
    val referenceFrameIndex: Int = -1
)

data class FrameOutcome(val index: Int, val accepted: Boolean, val registration: RegistrationResult?, val reason: String)

data class PipelineResult(
    /** Все кадры, совмещённые по звёздам и усреднённые (земля в нём размазана). */
    val stackedLinear: FloatImage,
    /** Итог: небо из [stackedLinear], земля из [groundStack] (если [PipelineConfig.freezeGround]). */
    val finalImage: FloatImage,
    /** Вес "земли" по пикселям (0 = небо, 1 = земля); null, если freezeGround выключен. */
    val groundMask: GrayImage?,
    /** Сколько кадров вошло в стек земли (0, если freezeGround выключен). */
    val groundFramesUsed: Int,
    /** true - земля сложена из отдельных снимков земли, false - из кадров серии. */
    val groundFromSeparateFrames: Boolean,
    val frameOutcomes: List<FrameOutcome>,
    val referenceFrameIndex: Int
)

/**
 * Простой пайплайн без "художественной" постобработки:
 * 1. находим звёзды в каждом кадре;
 * 2. совмещаем все кадры с опорным (первым) по звёздам — это и есть
 *    компенсация вращения Земли;
 * 3. усредняем совмещённые кадры (κ-σ отбраковка убирает спутники/самолёты);
 * 4. землю (горы, деревья и т.п.) берём целиком из опорного кадра — она не
 *    вращается вместе с небом и в стеке была бы размазана.
 * Яркость, цвет и контраст не меняются — результат выглядит как исходный
 * снимок, только с меньшим шумом в небе.
 */
object Pipeline {

    /**
     * [groundFrames] - необязательные отдельные снимки земли с того же штатива
     * (например, с длинной выдержкой или низким ISO). Если заданы и совпадают
     * по размеру с серией, земля складывается из них; иначе - из первых
     * [PipelineConfig.groundFrameCount] кадров серии.
     */
    fun run(
        frames: List<FrameInput>,
        config: PipelineConfig = PipelineConfig(),
        groundFrames: List<FloatImage> = emptyList(),
        onProgress: (ProgressUpdate) -> Unit = {}
    ): PipelineResult {
        require(frames.size >= 2) { "Нужно минимум 2 кадра" }

        val refIdx = if (config.referenceFrameIndex in frames.indices) config.referenceFrameIndex else selectReferenceFrame(frames)

        onProgress(ProgressUpdate(Stage.DETECT_STARS, 0, frames.size))
        // Ищем с запасом: часть найденного отсеется как неподвижные источники.
        val detectConfig = config.starDetector.copy(maxStars = config.starDetector.maxStars * 2)
        val rawStars = frames.mapIndexed { i, f ->
            val stars = StarDetector.detect(f.image.luminance(), detectConfig)
            onProgress(ProgressUpdate(Stage.DETECT_STARS, i + 1, frames.size))
            stars
        }
        val starsPerFrame = removeStaticSources(rawStars).map { it.take(config.starDetector.maxStars) }

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

        val reference = frames[refIdx].image
        val width = reference.width
        val height = reference.height

        // 1. Где земля: сравниваем опорный кадр с совмещённым и несовмещённым
        //    средним (дешёвые, только яркость).
        var mask: GrayImage? = null
        if (config.freezeGround) {
            onProgress(ProgressUpdate(Stage.GROUND, 0, 1))
            val staticStack = staticLuminanceMean(stackFrames.map { it.image }, width, height)
            val alignedStack = SkyStacker.alignedLuminanceMean(stackFrames, width, height)
            mask = GroundMask.compute(
                reference.luminance(), alignedStack, staticStack, config.groundMask,
                maxShiftPx = maxShift(stackFrames, width, height)
            )
            onProgress(ProgressUpdate(Stage.GROUND, 1, 1))
        }

        // 2. Стек: обычный и "только небо" (без отсчётов, попавших на землю).
        onProgress(ProgressUpdate(Stage.STACK, 0, 1))
        val stacks = SkyStacker.stack(stackFrames, reference, mask, config.combiner)
        onProgress(ProgressUpdate(Stage.STACK, 1, 1))

        // 3. Небо из стека, земля из опорного кадра.
        // 3. Земля: отдельный стек БЕЗ совмещения (камера на штативе неподвижна).
        var groundUsed = 0
        var groundSeparate = false
        val finalImage = if (mask != null) {
            val (sources, separate) = groundSources(frames, refIdx, groundFrames, config.groundFrameCount)
            groundUsed = sources.size
            groundSeparate = separate
            val ground = if (sources.size == 1) sources[0]
            else SkyStacker.stack(sources.map { StackFrame(it, SimilarityTransform.IDENTITY) }, reference, null, config.combiner).all
            blend(stacks.skyOnly!!, ground, mask)
        } else stacks.all
        onProgress(ProgressUpdate(Stage.DONE, 1, 1))
        return PipelineResult(stacks.all, finalImage, mask, groundUsed, groundSeparate, outcomes, refIdx)
    }

    /** Кадры для стека земли: отдельные снимки земли, если подходят по размеру, иначе первые по времени кадры серии (начиная с опорного). */
    private fun groundSources(frames: List<FrameInput>, refIdx: Int, groundFrames: List<FloatImage>, count: Int): Pair<List<FloatImage>, Boolean> {
        val ref = frames[refIdx].image
        val separate = groundFrames.filter { it.width == ref.width && it.height == ref.height }
        if (separate.isNotEmpty()) return separate to true
        val byTime = frames.indices.sortedWith(compareBy<Int> { it != refIdx }.thenBy { frames[it].captureEpochSeconds ?: it.toDouble() })
        return byTime.take(count.coerceAtLeast(1)).map { frames[it].image } to false
    }

    /** Наибольшее смещение точки кадра после совмещения (по сетке 3×3 точек). */
    private fun maxShift(frames: List<StackFrame>, w: Int, h: Int): Double {
        var best = 0.0
        for (f in frames) for (gx in 0..2) for (gy in 0..2) {
            val p = Vec2(gx * (w - 1) / 2.0, gy * (h - 1) / 2.0)
            best = maxOf(best, f.toReference.apply(p).distanceTo(p))
        }
        return best
    }

    /**
     * Убирает "звёзды", которые стоят на одном месте почти во всех кадрах:
     * огни на земле, горячие пиксели, блики. Настоящие звёзды из-за вращения
     * Земли смещаются, а неподвижные точки иначе "перетягивают" совмещение на
     * себя (кадры совмещаются по земле, и звёзды размазываются). Если после
     * фильтра звёзд почти не осталось (очень короткая серия - звёзды почти не
     * сдвинулись), возвращаем исходные списки.
     */
    fun removeStaticSources(
        starsPerFrame: List<List<Star>>,
        tolerancePx: Double = 1.5,
        staticFraction: Double = 0.6,
        minRemaining: Int = 15
    ): List<List<Star>> {
        val n = starsPerFrame.size
        if (n < 3) return starsPerFrame
        val cell = tolerancePx
        val grids = starsPerFrame.map { stars ->
            val grid = HashMap<Long, MutableList<Star>>()
            for (s in stars) grid.getOrPut(cellKey(s.x, s.y, cell)) { ArrayList() }.add(s)
            grid
        }
        val filtered = starsPerFrame.mapIndexed { i, stars ->
            stars.filter { s ->
                var hits = 0
                for (j in 0 until n) {
                    if (j != i && hasNeighbor(grids[j], s, cell, tolerancePx)) hits++
                }
                hits < staticFraction * (n - 1)
            }
        }
        return if (filtered.all { it.size >= minRemaining }) filtered else starsPerFrame
    }

    private fun cellKey(x: Double, y: Double, cell: Double): Long =
        (Math.floor(x / cell).toLong() shl 32) xor (Math.floor(y / cell).toLong() and 0xFFFFFFFFL)

    private fun hasNeighbor(grid: Map<Long, List<Star>>, s: Star, cell: Double, tol: Double): Boolean {
        val cx = Math.floor(s.x / cell).toLong()
        val cy = Math.floor(s.y / cell).toLong()
        for (dy in -1L..1L) for (dx in -1L..1L) {
            val key = ((cx + dx) shl 32) xor ((cy + dy) and 0xFFFFFFFFL)
            val list = grid[key] ?: continue
            for (o in list) {
                val ddx = o.x - s.x; val ddy = o.y - s.y
                if (ddx * ddx + ddy * ddy <= tol * tol) return true
            }
        }
        return false
    }

    /** sky*(1-w) + ground*w попиксельно по всем каналам. */
    fun blend(sky: FloatImage, ground: FloatImage, groundWeight: GrayImage): FloatImage {
        val n = sky.width * sky.height
        val r = FloatArray(n); val g = FloatArray(n); val b = FloatArray(n)
        val w = groundWeight.data
        for (i in 0 until n) {
            val k = w[i]
            r[i] = sky.r[i] + (ground.r[i] - sky.r[i]) * k
            g[i] = sky.g[i] + (ground.g[i] - sky.g[i]) * k
            b[i] = sky.b[i] + (ground.b[i] - sky.b[i]) * k
        }
        return FloatImage(sky.width, sky.height, r, g, b)
    }

    /** Среднее по яркости БЕЗ совмещения — в нём неподвижная земля резкая, а звёзды размазаны. */
    private fun staticLuminanceMean(images: List<FloatImage>, width: Int, height: Int): GrayImage {
        val out = FloatArray(width * height)
        for (img in images) {
            for (i in out.indices) out[i] += 0.2126f * img.r[i] + 0.7152f * img.g[i] + 0.0722f * img.b[i]
        }
        val inv = 1f / images.size
        for (i in out.indices) out[i] *= inv
        return GrayImage(width, height, out)
    }

    /**
     * Опорный кадр — самый ранний по времени съёмки (первый кадр серии): из
     * него берётся земля, и к нему же приводятся звёзды. Без EXIF-времени —
     * первый выбранный кадр.
     */
    fun selectReferenceFrame(frames: List<FrameInput>): Int {
        var bestIdx = 0
        var bestTime = Double.POSITIVE_INFINITY
        for (i in frames.indices) {
            val t = frames[i].captureEpochSeconds ?: continue
            if (t < bestTime) { bestTime = t; bestIdx = i }
        }
        return bestIdx
    }
}
