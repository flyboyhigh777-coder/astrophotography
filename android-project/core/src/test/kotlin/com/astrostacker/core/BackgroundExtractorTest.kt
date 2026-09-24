package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test

class BackgroundExtractorTest {

    @Test
    fun removesLinearGradientButPreservesPointSource() {
        val width = 200; val height = 150
        val data = FloatArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                data[y * width + x] = 0.1f + 0.3f * (x.toFloat() / width) // линейный градиент по X
            }
        }
        val starX = width / 2; val starY = height / 2
        data[starY * width + starX] += 0.5f

        val image = GrayImage(width, height, data)
        val starMask = { x: Int, y: Int -> kotlin.math.hypot((x - starX).toDouble(), (y - starY).toDouble()) < 8.0 }
        val (result, _) = BackgroundExtractor.extractAndSubtract(image, BackgroundExtractor.Config(gridCellSize = 20, starMask = starMask))

        var sumAbs = 0.0; var count = 0
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (starMask(x, y)) continue
                sumAbs += kotlin.math.abs(result[x, y])
                count++
            }
        }
        val meanAbs = sumAbs / count
        assertTrue("градиент не убран, средняя невязка фона $meanAbs", meanAbs < 0.02)
        assertTrue("звезда потеряна после удаления градиента", result[starX, starY] > 0.3f)
    }

    /**
     * Регрессионный тест на находку с реальных ночных фото (см.
     * docs/TESTING_PLAN.md): силуэт гор на фоне неба, занимающий нижнюю
     * восьмую часть кадра (12.5% - похоже на долю реального кадра с
     * горизонтом в присланных фото) - большая, резко ограниченная, почти
     * чёрная область, а не часть плавного градиента засветки. Без защиты
     * (см. [BackgroundExtractor.Config.darkOutlierSigmaMultiplier]) она тянет
     * глобальную квадратичную поверхность вниз и портит восстановление фона
     * даже ВДАЛИ от самого силуэта - именно это и проявилось на реальных
     * фото как тёмный "купол" на итоговом небе. При заметно большей доле
     * переднего плана в кадре (эмпирически - от ~20% высоты и выше) эта
     * эвристика уже не полностью справляется - см. комментарий у
     * [BackgroundExtractor.Config.darkOutlierSigmaMultiplier].
     */
    @Test
    fun darkForegroundSilhouetteDoesNotContaminateBackgroundFitAwayFromIt() {
        val width = 200; val height = 160
        val data = FloatArray(width * height)
        val foregroundStartY = height - height / 8 // нижние 12.5% строк - силуэт горы
        for (y in 0 until height) {
            for (x in 0 until width) {
                val skyValue = 0.1f + 0.3f * (x.toFloat() / width) // тот же линейный градиент, что и в первом тесте
                data[y * width + x] = if (y >= foregroundStartY) 0.01f else skyValue
            }
        }
        val image = GrayImage(width, height, data)

        val contaminated = BackgroundExtractor.fitBackgroundModel(
            image, BackgroundExtractor.Config(gridCellSize = 20, darkOutlierSigmaMultiplier = null)
        )
        val protectedModel = BackgroundExtractor.fitBackgroundModel(
            image, BackgroundExtractor.Config(gridCellSize = 20) // darkOutlierSigmaMultiplier/darkOutlierIterations по умолчанию
        )

        // Проверяем восстановление ИСТИННОГО значения неба вдали от силуэта (верхняя четверть кадра).
        val checkY = height / 8
        var maxContaminatedError = 0.0
        var maxProtectedError = 0.0
        for (checkX in intArrayOf(0, width / 4, width / 2, 3 * width / 4, width - 1)) {
            val trueSky = 0.1 + 0.3 * (checkX.toDouble() / width)
            maxContaminatedError = maxOf(maxContaminatedError, kotlin.math.abs(contaminated.evaluate(checkX, checkY) - trueSky))
            maxProtectedError = maxOf(maxProtectedError, kotlin.math.abs(protectedModel.evaluate(checkX, checkY) - trueSky))
        }

        assertTrue(
            "силуэт горы должен заметно портить фон БЕЗ защиты (иначе тест ничего не проверяет): ошибка=$maxContaminatedError",
            maxContaminatedError > 0.02
        )
        assertTrue(
            "защита от переднего плана должна заметно уменьшить ошибку (было=$maxContaminatedError, стало=$maxProtectedError)",
            maxProtectedError < maxContaminatedError * 0.2
        )
        assertTrue("остаточная ошибка после защиты должна быть маленькой: $maxProtectedError", maxProtectedError < 0.005)
    }
}
