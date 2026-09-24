package com.astrostacker.core

import kotlin.math.abs

/**
 * Удаление плавного градиента фона (засветка/виньетирование) — по мотивам
 * PixInsight DynamicBackgroundExtraction/AutomaticBackgroundExtraction (общая
 * методология, конкретные формулы PixInsight не публикует; см.
 * docs/LITERATURE.md §4): сетка проб → σ-клиппированная робастная (медианная)
 * оценка фона в каждой ячейке (с игнором ячеек, попавших на звёзды) → полином
 * 2-й степени по МНК → вычитание только низкочастотной компоненты.
 */
object BackgroundExtractor {

    data class Config(
        val gridCellSize: Int = 64,
        /** true = пиксель занят звездой/деталью, ячейку с такими пикселями исключать из выборки. */
        val starMask: ((x: Int, y: Int) -> Boolean)? = null,
        /**
         * Ячейки, чья робастная яркость намного темнее, чем предсказывает
         * ПОДОГНАННАЯ поверхность в этой же точке (не глобальная медиана —
         * см. ниже, почему это важно), итеративно исключаются из подгонки как
         * ПЕРЕДНИЙ ПЛАН (силуэт гор/деревьев на фоне неба), а не звёзды (для
         * тех уже есть [starMask]). Силуэт - большая, РЕЗКО ограниченная
         * область, на порядок темнее подавляющего большинства кадра, а не
         * часть плавного виньетирования/градиента засветки; его попадание в
         * выборку тянет гладкую поверхность вниз именно там, где на самом
         * деле граница земля/небо, а не постепенное изменение фона. Найдено
         * на первом же прогоне на настоящих ночных фото с гористым горизонтом
         * в кадре (см. docs/TESTING_PLAN.md) - синтетический
         * `BackgroundExtractorTest` этого не ловил, потому что там фон - чистый
         * линейный градиент без резких тёмных областей. Порог сравнивается с
         * ОСТАТКОМ (значение минус предсказание модели), а не с глобальной
         * медианой самих значений: у настоящего виньетирования фон и так
         * заметно темнее в одних местах кадра, чем в других (это и есть тот
         * самый градиент, который мы моделируем), и порог по глобальной
         * медиане либо задевает такие легитимно тёмные углы, либо (если
         * ослаблен, чтобы их не задевать) перестаёт вообще что-либо отсеивать,
         * если силуэт занимает заметную долю кадра - ровно это и произошло в
         * первой версии этой защиты, пока её не заменили на текущую. `null`
         * отключает проверку (например, для кадров без переднего плана).
         * Порог намеренно не слишком строгий (κ=2, не 4-6, как обычно бывает
         * при отбраковке выбросов) и применяется в НЕСКОЛЬКО итераций (см.
         * [darkOutlierIterations]) - в отличие от рассеянных точечных
         * выбросов, силуэт переднего плана - это большой СВЯЗНЫЙ блок ячеек,
         * который квадратичная поверхность (всего 6 степеней свободы) частично
         * "перекашивается" в его сторону уже за одну подгонку, из-за чего его
         * остатки не так уж сильно отличаются от остатков неба в ОДНОМ проходе
         * - разделение улучшается по мере того, как силуэт постепенно
         * вытесняется из выборки за несколько итераций (проверено эмпирически
         * на модели с силуэтом в 10-15% кадра - деталях см. в комментарии к
         * [excludeDarkForeground]; при явно бо́льшем силуэте, скажем ≥20%
         * высоты кадра, этот эвристический подход уже не полностью убирает
         * контаминацию - минимизировать долю переднего плана в кадре или
         * реализовать честную сегментацию неба/земли остаётся на будущее,
         * см. `docs/LITERATURE.md` §8 про Starry Landscape Stacker).
         */
        val darkOutlierSigmaMultiplier: Double? = 2.0,
        /** Число итераций подгонка→отбраковка для [darkOutlierSigmaMultiplier]. */
        val darkOutlierIterations: Int = 3
    )

    /** Полином 2-й степени по нормированным координатам: f(nx,ny)=c0+c1*nx+c2*ny+c3*nx²+c4*nx*ny+c5*ny². */
    data class BackgroundModel(val coeffs: DoubleArray, val width: Double, val height: Double) {
        fun evaluate(x: Int, y: Int): Double = evaluateNormalized(x / width, y / height)

        fun evaluateNormalized(nx: Double, ny: Double): Double {
            val c = coeffs
            return c[0] + c[1] * nx + c[2] * ny + c[3] * nx * nx + c[4] * nx * ny + c[5] * ny * ny
        }
    }

    fun extractAndSubtract(image: GrayImage, config: Config = Config()): Pair<GrayImage, BackgroundModel> {
        val model = fitBackgroundModel(image, config)
        val out = FloatArray(image.width * image.height)
        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                val idx = y * image.width + x
                out[idx] = (image.data[idx] - model.evaluate(x, y)).toFloat()
            }
        }
        return Pair(GrayImage(image.width, image.height, out), model)
    }

    fun fitBackgroundModel(image: GrayImage, config: Config = Config()): BackgroundModel {
        val rawSamples = ArrayList<Triple<Double, Double, Double>>() // (nx, ny, значение) - до отсева переднего плана

        var cy = 0
        while (cy < image.height) {
            val y1 = (cy + config.gridCellSize).coerceAtMost(image.height)
            var cx = 0
            while (cx < image.width) {
                val x1 = (cx + config.gridCellSize).coerceAtMost(image.width)
                val cellValues = ArrayList<Double>()
                for (yy in cy until y1) {
                    for (xx in cx until x1) {
                        if (config.starMask?.invoke(xx, yy) == true) continue
                        cellValues.add(image[xx, yy].toDouble())
                    }
                }
                if (cellValues.size >= 4) {
                    val robust = Stats.sigmaClipped(cellValues).median
                    val centerX = (cx + x1) / 2.0
                    val centerY = (cy + y1) / 2.0
                    rawSamples.add(Triple(centerX / image.width, centerY / image.height, robust))
                }
                cx += config.gridCellSize
            }
            cy += config.gridCellSize
        }

        val samples = excludeDarkForeground(rawSamples, config.darkOutlierSigmaMultiplier, config.darkOutlierIterations)
        return BackgroundModel(fitQuadraticSurface(samples), image.width.toDouble(), image.height.toDouble())
    }

    /**
     * См. [Config.darkOutlierSigmaMultiplier]/[Config.darkOutlierIterations].
     * Несколько раундов "подгонка → отбросить то, что намного темнее
     * подогнанной поверхности в своей же точке → подогнать заново на
     * оставшемся" - тот же принцип итеративного σ-клиппинга остатков, что и
     * везде в проекте (см. [Stats.sigmaClipped], κ-σ отбраковка в
     * [StackCombiner]), только здесь клиппинг идёт по ОСТАТКАМ относительно
     * текущей модели, а не по самим значениям, и по НЕСКОЛЬКИМ итерациям
     * (одной недостаточно - см. [Config.darkOutlierSigmaMultiplier]).
     */
    private fun excludeDarkForeground(
        samples: List<Triple<Double, Double, Double>>,
        sigmaMultiplier: Double?,
        iterations: Int
    ): List<Triple<Double, Double, Double>> {
        if (sigmaMultiplier == null || samples.size < 8) return samples

        var current = samples
        for (iter in 0 until iterations) {
            val trialCoeffs = fitQuadraticSurface(current)
            val trialModel = BackgroundModel(trialCoeffs, width = 1.0, height = 1.0) // evaluateNormalized не использует width/height
            val residuals = current.map { it.third - trialModel.evaluateNormalized(it.first, it.second) }

            val sortedResiduals = residuals.sorted()
            val medianResidual = sortedResiduals[sortedResiduals.size / 2]
            val mad = sortedResiduals.map { abs(it - medianResidual) }.sorted()[sortedResiduals.size / 2]
            val sigma = 1.4826 * mad
            if (sigma < 1e-9) break // фон уже гладкий, отсеивать нечего

            // Только ОДНОСТОРОННЕЕ отсечение (намного темнее предсказанного) -
            // силуэт переднего плана темнее фона, а не ярче; симметричный
            // клиппинг рисковал бы задеть легитимно яркую деталь фона
            // (например, широкую область засветки от города).
            val threshold = medianResidual - sigmaMultiplier * sigma
            val filtered = current.filterIndexed { i, _ -> residuals[i] >= threshold }

            // Если бы фильтр исключил почти всю выборку или ничего не изменил
            // за этот раунд - останавливаемся, дальнейшие итерации бессмысленны.
            if (filtered.size < 6 || filtered.size == current.size) break
            current = filtered
        }
        return current
    }

    /**
     * МНК-подгонка поверхности f(nx,ny)=c0+c1*nx+c2*ny+c3*nx²+c4*nx*ny+c5*ny² по
     * набору точек (nx,ny,value) — линейная регрессия с 6 базисными функциями,
     * нормальные уравнения решаются методом Гаусса-Жордана.
     */
    private fun fitQuadraticSurface(samples: List<Triple<Double, Double, Double>>): DoubleArray {
        val k = 6
        if (samples.size < k) {
            val mean = if (samples.isEmpty()) 0.0 else samples.map { it.third }.average()
            return doubleArrayOf(mean, 0.0, 0.0, 0.0, 0.0, 0.0)
        }

        val ata = Array(k) { DoubleArray(k) }
        val atb = DoubleArray(k)

        for (s in samples) {
            val nx = s.first; val ny = s.second; val value = s.third
            val basis = doubleArrayOf(1.0, nx, ny, nx * nx, nx * ny, ny * ny)
            for (i in 0 until k) {
                atb[i] += basis[i] * value
                for (j in 0 until k) ata[i][j] += basis[i] * basis[j]
            }
        }

        return solveLinearSystem(ata, atb)
            ?: doubleArrayOf(samples.map { it.third }.average(), 0.0, 0.0, 0.0, 0.0, 0.0)
    }

    /** Решение A*x=b методом Гаусса-Жордана с частичным выбором ведущего элемента. */
    private fun solveLinearSystem(a: Array<DoubleArray>, b: DoubleArray): DoubleArray? {
        val n = b.size
        val m = Array(n) { i -> DoubleArray(n + 1) { j -> if (j < n) a[i][j] else b[i] } }

        for (col in 0 until n) {
            var pivotRow = col
            var maxVal = abs(m[col][col])
            for (row in (col + 1) until n) {
                if (abs(m[row][col]) > maxVal) { maxVal = abs(m[row][col]); pivotRow = row }
            }
            if (maxVal < 1e-12) return null
            val tmp = m[col]; m[col] = m[pivotRow]; m[pivotRow] = tmp

            val pivot = m[col][col]
            for (j in col..n) m[col][j] = m[col][j] / pivot

            for (row in 0 until n) {
                if (row == col) continue
                val factor = m[row][col]
                if (factor == 0.0) continue
                for (j in col..n) m[row][j] -= factor * m[col][j]
            }
        }

        return DoubleArray(n) { i -> m[i][n] }
    }
}
