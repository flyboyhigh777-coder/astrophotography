package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StarDetectorTest {

    @Test
    fun detectsApproximatelyTheRightNumberOfStars() {
        val truth = SyntheticSky.generate(width = 400, height = 300, starCount = 40, seed = 7L)
        val detected = StarDetector.detect(truth.image.luminance())
        // Точное совпадение не требуем (возможны слияния близких звёзд), но
        // детектор должен найти подавляющее большинство и почти не давать ложных срабатываний.
        assertTrue("найдено ${detected.size} звёзд из 40", detected.size in 30..48)
    }

    @Test
    fun centroidsMatchGroundTruthWithinSubPixel() {
        val truth = SyntheticSky.generate(width = 300, height = 300, starCount = 25, seed = 3L, psfSigma = 1.6)
        val detected = StarDetector.detect(truth.image.luminance())

        var matchedCount = 0
        var maxError = 0.0
        for (gt in truth.stars) {
            val nearest = nearestStar(detected, gt) ?: continue
            val dist = kotlin.math.hypot(nearest.x - gt.x, nearest.y - gt.y)
            if (dist < 1.0) {
                matchedCount++
                if (dist > maxError) maxError = dist
            }
        }
        assertTrue("совпало $matchedCount из ${truth.stars.size}", matchedCount >= (truth.stars.size * 0.8).toInt())
        assertTrue("макс. ошибка центроида $maxError px", maxError < 1.0)
    }

    @Test
    fun emptySkyProducesNoStars() {
        val blank = FloatImage.filled(100, 100, 0.05f)
        val detected = StarDetector.detect(blank.luminance())
        assertEquals(0, detected.size)
    }

    private fun nearestStar(stars: List<Star>, target: Vec2): Star? {
        var best: Star? = null
        var bestDistSq = Double.POSITIVE_INFINITY
        for (s in stars) {
            val dx = s.x - target.x; val dy = s.y - target.y
            val d = dx * dx + dy * dy
            if (d < bestDistSq) { bestDistSq = d; best = s }
        }
        return best
    }
}
