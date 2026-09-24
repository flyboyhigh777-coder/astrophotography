package com.astrostacker.core

import java.util.Random
import kotlin.math.ceil
import kotlin.math.exp

/**
 * Синтетическое звёздное небо для тестов: известные позиции звёзд, фон, гауссов
 * шум и гауссов PSF — позволяет проверять StarDetector/регистрацию/стекинг с
 * заранее известным "правильным ответом", а не на глаз.
 */
object SyntheticSky {

    data class GroundTruth(val stars: List<Vec2>, val image: FloatImage)

    /** Небо со случайными (детерминированными по [seed]) позициями звёзд. */
    fun generate(
        width: Int, height: Int, starCount: Int,
        seed: Long = 1L,
        background: Float = 0.05f,
        noiseSigma: Float = 0.01f,
        psfSigma: Double = 1.4,
        minFlux: Double = 0.15,
        maxFlux: Double = 0.9,
        margin: Int = 10
    ): GroundTruth {
        val random = Random(seed)
        val stars = ArrayList<Vec2>()
        val data = FloatArray(width * height) { background }

        repeat(starCount) {
            val sx = margin + random.nextDouble() * (width - 2 * margin)
            val sy = margin + random.nextDouble() * (height - 2 * margin)
            val flux = minFlux + random.nextDouble() * (maxFlux - minFlux)
            stars.add(Vec2(sx, sy))
            paintStar(data, width, height, sx, sy, flux, psfSigma)
        }

        addGaussianNoise(data, random, noiseSigma)
        val clamped = FloatArray(data.size) { data[it].coerceIn(0f, 1f) }
        return GroundTruth(stars, FloatImage(width, height, clamped, clamped.copyOf(), clamped.copyOf()))
    }

    /** Рендерит изображение по ГОТОВОМУ списку позиций звёзд (для тестов регистрации с известной трансформацией). */
    fun render(
        width: Int, height: Int, stars: List<Vec2>,
        seed: Long = 1L,
        background: Float = 0.05f,
        noiseSigma: Float = 0.01f,
        psfSigma: Double = 1.4,
        flux: Double = 0.5
    ): FloatImage {
        val random = Random(seed)
        val data = FloatArray(width * height) { background }
        for (s in stars) paintStar(data, width, height, s.x, s.y, flux, psfSigma)
        addGaussianNoise(data, random, noiseSigma)
        val clamped = FloatArray(data.size) { data[it].coerceIn(0f, 1f) }
        return FloatImage(width, height, clamped, clamped.copyOf(), clamped.copyOf())
    }

    private fun paintStar(data: FloatArray, width: Int, height: Int, cx: Double, cy: Double, flux: Double, sigma: Double) {
        val radius = ceil(sigma * 4).toInt()
        val x0 = (cx - radius).toInt().coerceAtLeast(0)
        val x1 = (cx + radius).toInt().coerceAtMost(width - 1)
        val y0 = (cy - radius).toInt().coerceAtLeast(0)
        val y1 = (cy + radius).toInt().coerceAtMost(height - 1)
        if (x1 < x0 || y1 < y0) return
        for (y in y0..y1) {
            for (x in x0..x1) {
                val dx = x - cx; val dy = y - cy
                val g = exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
                val idx = y * width + x
                data[idx] = data[idx] + flux.toFloat() * g.toFloat()
            }
        }
    }

    private fun addGaussianNoise(data: FloatArray, random: Random, sigma: Float) {
        if (sigma <= 0f) return
        for (i in data.indices) data[i] = data[i] + (random.nextGaussian() * sigma).toFloat()
    }
}
