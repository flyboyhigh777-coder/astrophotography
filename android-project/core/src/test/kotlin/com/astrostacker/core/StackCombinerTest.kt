package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StackCombinerTest {

    @Test
    fun kappaSigmaMean_rejectsSingleOutlier() {
        // 9 значений около 0.5 + один "спутник/самолёт" на 5.0
        val values = floatArrayOf(0.50f, 0.51f, 0.49f, 0.50f, 0.52f, 0.48f, 0.50f, 0.49f, 0.51f, 5.0f)
        val combined = StackCombiner.combine(values, StackCombinerConfig(method = CombineMethod.MEAN))
        assertTrue("выброс не был отброшен: $combined", combined < 0.6f)
    }

    @Test
    fun median_isRobustToOutlier() {
        val values = floatArrayOf(0.5f, 0.5f, 0.5f, 100f)
        val combined = StackCombiner.combine(values, StackCombinerConfig(method = CombineMethod.MEDIAN))
        assertEquals(0.5f, combined, 1e-4f)
    }

    @Test
    fun stackingReducesNoiseApproximatelyBySqrtN() {
        val random = java.util.Random(99L)
        val n = 64
        val trueValue = 0.3f
        val noiseSigma = 0.05f
        val values = FloatArray(n) { trueValue + random.nextGaussian().toFloat() * noiseSigma }
        val combined = StackCombiner.combine(values, StackCombinerConfig(method = CombineMethod.MEAN))
        val expectedStdErr = noiseSigma / kotlin.math.sqrt(n.toDouble())
        assertEquals(trueValue.toDouble(), combined.toDouble(), expectedStdErr * 4.0)
    }

    @Test
    fun tiledStacking_matchesNonTiledStacking() {
        val truth = SyntheticSky.generate(width = 64, height = 48, starCount = 10, seed = 42L)
        val frame2 = SyntheticSky.render(64, 48, truth.stars, seed = 43L)
        val frames = listOf(
            StackFrame(truth.image, SimilarityTransform.IDENTITY),
            StackFrame(frame2, SimilarityTransform.IDENTITY)
        )
        val whole = TiledStacker.stack(64, 48, frames, tileHeight = 48)
        val tiled = TiledStacker.stack(64, 48, frames, tileHeight = 7) // не делится нацело - нарочно

        for (i in whole.r.indices) {
            assertEquals(whole.r[i], tiled.r[i], 1e-6f)
            assertEquals(whole.g[i], tiled.g[i], 1e-6f)
            assertEquals(whole.b[i], tiled.b[i], 1e-6f)
        }
    }

    @Test
    fun trimmedMean_rejectsOutlier() {
        val values = floatArrayOf(0.5f, 0.51f, 0.49f, 0.50f, 0.52f, 0.48f, 0.50f, 9.0f)
        val combined = StackCombiner.combine(values, StackCombinerConfig(method = CombineMethod.TRIMMED_MEAN))
        assertTrue("выброс не был отброшен усечённым средним: $combined", combined < 0.6f)
    }
}
