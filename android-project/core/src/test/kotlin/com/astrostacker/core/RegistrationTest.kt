package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Проверяет ключевое требование задачи: выравнивание кадров по звёздам с
 * компенсацией поворота звёздного поля (имитация вращения неба).
 */
class RegistrationTest {

    @Test
    fun triangleMatcher_findsCorrectCorrespondences_underRotationAndTranslation() {
        val referencePoints = randomPoints(count = 40, width = 400, height = 300, seed = 11L)
        val trueTransform = SimilarityTransform(scale = 1.0, rotationRad = Math.toRadians(3.0), tx = 15.0, ty = -8.0)
        // trueTransform отображает "текущий кадр -> опорный", поэтому точки текущего
        // кадра получаем через inverse (опорный -> текущий).
        val targetPoints = referencePoints.map { trueTransform.inverse().apply(it) }

        val pairs = TriangleMatcher.match(referencePoints, targetPoints)
        assertTrue("не найдено ни одного соответствия", pairs.isNotEmpty())

        var correct = 0
        for (pair in pairs) if (pair.first == pair.second) correct++
        // Индексы совпадают 1:1 по построению теста.
        assertTrue("верных соответствий $correct из ${pairs.size}", correct >= (pairs.size * 0.9).toInt())
    }

    @Test
    fun fullRegistration_recoversKnownRotationAndTranslation() {
        val referenceStars = randomStars(count = 60, width = 500, height = 400, seed = 21L)
        val referencePoints = referenceStars.map { Vec2(it.x, it.y) }

        val trueRotationDeg = 2.5
        val trueTransform = SimilarityTransform(scale = 1.0, rotationRad = Math.toRadians(trueRotationDeg), tx = 6.0, ty = -4.0)
        val targetPoints = referencePoints.map { trueTransform.inverse().apply(it) }
        val targetStars = targetPoints.mapIndexed { i, p ->
            Star(p.x, p.y, referenceStars[i].flux, referenceStars[i].area, referenceStars[i].peak)
        }

        val result = FrameRegistrator.register(referenceStars, targetStars, deltaSeconds = 10.0)
        assertNotNull("регистрация не удалась", result)
        val r = result!!

        assertTrue("мало инлаеров: ${r.inlierCount}", r.inlierCount >= 20)
        assertEquals(trueRotationDeg, r.fittedRotationDeg, 0.05)
        assertTrue("остаточная ошибка слишком велика: ${r.rmsResidualPx}", r.rmsResidualPx < 0.5)
        assertEquals("должна была сработать модель подобия", "similarity", r.modelUsed)

        for (i in 0 until 5) {
            val expected = referencePoints[i]
            val predicted = r.transform.apply(targetPoints[i])
            assertEquals(expected.x, predicted.x, 0.5)
            assertEquals(expected.y, predicted.y, 0.5)
        }
    }

    @Test
    fun registrationSanityCheck_flagsRotationMismatch() {
        // Специально даём "неправильную" длительность (0.001с при реальном
        // повороте 5°) - апостериорная проверка по EarthRotationModel должна
        // заметить нестыковку, но НЕ должна отклонить регистрацию как таковую.
        val referenceStars = randomStars(count = 40, width = 400, height = 300, seed = 5L)
        val referencePoints = referenceStars.map { Vec2(it.x, it.y) }
        val trueTransform = SimilarityTransform(scale = 1.0, rotationRad = Math.toRadians(5.0), tx = 2.0, ty = 2.0)
        val targetPoints = referencePoints.map { trueTransform.inverse().apply(it) }
        val targetStars = targetPoints.mapIndexed { i, p ->
            Star(p.x, p.y, referenceStars[i].flux, referenceStars[i].area, referenceStars[i].peak)
        }

        val result = FrameRegistrator.register(referenceStars, targetStars, deltaSeconds = 0.001)
        assertNotNull(result)
        assertTrue("ожидалось предупреждение о несоответствии поворота", result!!.rotationMismatchWarning)
    }

    @Test
    fun noStarsInCommon_returnsNull() {
        val referenceStars = randomStars(count = 30, width = 300, height = 300, seed = 1L)
        val unrelatedStars = randomStars(count = 30, width = 300, height = 300, seed = 999L)
        val result = FrameRegistrator.register(referenceStars, unrelatedStars, deltaSeconds = 1.0)
        // Со случайными, никак не связанными полями звёзд регистрация должна
        // либо провалиться (null), либо дать очень мало инлаеров - не должна
        // "уверенно" выдать случайное совпадение.
        if (result != null) {
            assertTrue("подозрительно много инлаеров на случайных данных: ${result.inlierCount}", result.inlierCount < 10)
        }
    }

    private fun randomPoints(count: Int, width: Int, height: Int, seed: Long): List<Vec2> {
        val random = java.util.Random(seed)
        val list = ArrayList<Vec2>(count)
        repeat(count) { list.add(Vec2(random.nextDouble() * width, random.nextDouble() * height)) }
        return list
    }

    private fun randomStars(count: Int, width: Int, height: Int, seed: Long): List<Star> {
        val random = java.util.Random(seed)
        val list = ArrayList<Star>(count)
        repeat(count) { list.add(Star(random.nextDouble() * width, random.nextDouble() * height, 100.0 + random.nextDouble() * 900.0, 5, 0.5f)) }
        return list
    }
}
