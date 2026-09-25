package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.abs
import kotlin.math.sin

/**
 * Небо вращается вокруг полюса над кадром, внизу — неподвижные "горы" с
 * огоньками. Проверяем, что пайплайн сам находит землю, берёт её из первого
 * кадра (резкой, без шлейфов от вращения), а небо — из стека.
 */
class GroundMaskTest {

    private val width = 320
    private val height = 240
    private val pole = Vec2(160.0, -600.0)

    private fun horizonY(x: Int): Double = 150.0 + 15.0 * sin(x / 30.0)

    /** Неподвижная текстура земли — одинаковая во всех кадрах. */
    private val groundTexture: FloatArray = run {
        val rnd = Random(7L)
        val tex = FloatArray(width * height) { 0.02f }
        repeat(60) {
            val cx = rnd.nextInt(width); val cy = 160 + rnd.nextInt(height - 165)
            for (dy in -1..1) for (dx in -1..1) {
                val x = (cx + dx).coerceIn(0, width - 1); val y = (cy + dy).coerceIn(0, height - 1)
                tex[y * width + x] = 0.6f
            }
        }
        tex
    }

    private fun renderFrame(stars: List<Vec2>, seed: Long): FloatImage {
        val sky = SyntheticSky.render(width, height, stars, seed = seed, noiseSigma = 0.03f, flux = 0.4)
        val noise = Random(seed + 99)
        val r = sky.r.copyOf()
        for (y in 0 until height) for (x in 0 until width) {
            if (y >= horizonY(x)) {
                val i = y * width + x
                r[i] = (groundTexture[i] + (noise.nextGaussian() * 0.01).toFloat()).coerceIn(0f, 1f)
            }
        }
        return FloatImage(width, height, r, r.copyOf(), r.copyOf())
    }

    private fun buildFrames(): List<FrameInput> {
        val rnd = Random(123L)
        val baseStars = List(60) { Vec2(10.0 + rnd.nextDouble() * (width - 20), 10.0 + rnd.nextDouble() * 120.0) }
        return (0 until 10).map { i ->
            val angle = Math.toRadians(0.25 * i)
            val c = kotlin.math.cos(angle); val s = kotlin.math.sin(angle)
            val stars = baseStars.map {
                val dx = it.x - pole.x; val dy = it.y - pole.y
                Vec2(pole.x + dx * c - dy * s, pole.y + dx * s + dy * c)
            }
            FrameInput(renderFrame(stars, 1000L + i), captureEpochSeconds = 100.0 + i * 60.0)
        }
    }

    @Test
    fun groundComesFromFirstFrameAndSkyFromStack() {
        val frames = buildFrames()
        val result = Pipeline.run(frames)
        val mask = result.groundMask!!
        assertTrue("опорным должен быть первый кадр", result.referenceFrameIndex == 0)

        var groundPixels = 0; var groundHits = 0; var groundErr = 0.0; var singleErr = 0.0
        var skyPixels = 0; var skyHits = 0
        for (y in 0 until height) for (x in 0 until width) {
            val i = y * width + x
            if (y > horizonY(x) + 12) {
                groundPixels++
                if (mask.data[i] > 0.9f) groundHits++
                groundErr += abs(result.finalImage.r[i] - groundTexture[i])
                singleErr += abs(frames[0].image.r[i] - groundTexture[i])
            } else if (y < 60) {
                skyPixels++
                if (mask.data[i] < 0.1f) skyHits++
            }
        }
        assertTrue("земля распознана только в $groundHits из $groundPixels пикселей", groundHits >= groundPixels * 0.95)
        assertTrue("небо ошибочно отмечено землёй: ${skyPixels - skyHits} из $skyPixels", skyHits >= skyPixels * 0.95)
        // Земля - стек первых 5 кадров без совмещения: резкая (совпадает с
        // неподвижной текстурой) и менее шумная, чем один кадр.
        assertTrue("земля из 5 кадров вошла не вся: ${result.groundFramesUsed}", result.groundFramesUsed == 5)
        assertTrue("земля не стала чище одного кадра: ${groundErr / groundPixels} vs ${singleErr / groundPixels}",
            groundErr < singleErr * 0.7)

        // Небо стало менее шумным, чем в одном кадре.
        val skyFinal = ArrayList<Double>(); val skySingle = ArrayList<Double>()
        for (y in 0 until 60) for (x in 0 until width step 3) {
            skyFinal.add(result.finalImage.r[y * width + x].toDouble())
            skySingle.add(frames[0].image.r[y * width + x].toDouble())
        }
        val finalSd = Stats.sigmaClipped(skyFinal).stdDev
        val singleSd = Stats.sigmaClipped(skySingle).stdDev
        assertTrue("шум неба не уменьшился: $finalSd vs $singleSd", finalSd < singleSd * 0.6)
    }

    @Test
    fun separateGroundFramesAreUsedForGround() {
        val frames = buildFrames()
        // "Длинная выдержка": та же земля, но ярче на 0.1 и почти без шума.
        val groundShots = (0 until 4).map { k ->
            val rnd = Random(900L + k)
            val d = FloatArray(width * height) { (groundTexture[it] + 0.1f + (rnd.nextGaussian() * 0.002).toFloat()).coerceIn(0f, 1f) }
            FloatImage(width, height, d, d.copyOf(), d.copyOf())
        }
        val result = Pipeline.run(frames, groundFrames = groundShots)
        assertTrue(result.groundFramesUsed == 4 && result.groundFromSeparateFrames)
        var sum = 0.0; var n = 0
        for (y in 0 until height) for (x in 0 until width) {
            if (y > horizonY(x) + 12) { sum += result.finalImage.r[y * width + x] - groundTexture[y * width + x]; n++ }
        }
        assertTrue("земля взята не из отдельных кадров: сдвиг ${sum / n}", abs(sum / n - 0.1) < 0.01)
    }

    @Test
    fun pureSkyHasNoGround() {
        val rnd = Random(5L)
        val baseStars = List(50) { Vec2(10.0 + rnd.nextDouble() * (width - 20), 10.0 + rnd.nextDouble() * (height - 20)) }
        val frames = (0 until 6).map { i ->
            val t = SimilarityTransform(1.0, Math.toRadians(0.2 * i), 0.0, 0.0)
            FrameInput(SyntheticSky.render(width, height, baseStars.map { t.apply(it) }, seed = 50L + i, noiseSigma = 0.03f), null)
        }
        val mask = Pipeline.run(frames).groundMask!!
        val groundFraction = mask.data.count { it > 0.5f }.toDouble() / mask.data.size
        assertTrue("на чистом небе найдено ${groundFraction * 100}% земли", groundFraction < 0.05)
    }
}
