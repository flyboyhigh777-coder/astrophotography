package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Сквозной прогон всего пайплайна на синтетическом небе с известным вращением
 * (физически согласованным с EarthRotationModel) - проверяет именно то, что
 * просил пользователь: "склейка со считыванием вращения планеты и калибровкой
 * по звёздам", целиком, от сырых кадров до финальной картинки.
 */
class PipelineIntegrationTest {

    @Test
    fun fullPipeline_stacksRotatedNoisyFramesAndImprovesSnr() {
        val width = 240; val height = 180
        val random = java.util.Random(123L)
        val baseStars = ArrayList<Vec2>()
        repeat(35) { baseStars.add(Vec2(20.0 + random.nextDouble() * (width - 40), 20.0 + random.nextDouble() * (height - 40))) }

        val frameCount = 12
        val secondsBetweenFrames = 60.0
        // Реальная физическая скорость вращения неба - тест демонстрирует, что
        // EarthRotationModel и фактически найденный поворот согласуются.
        val rotationStepDeg = EarthRotationModel.expectedRotationDegrees(secondsBetweenFrames)

        val frames = ArrayList<FrameInput>()
        for (i in 0 until frameCount) {
            val transform = SimilarityTransform(1.0, Math.toRadians(rotationStepDeg * i), 0.0, 0.0)
            val framePoints = baseStars.map { transform.inverse().apply(it) }
            val image = SyntheticSky.render(width, height, framePoints, seed = 1000L + i, noiseSigma = 0.04f, flux = 0.4)
            frames.add(FrameInput(image, captureEpochSeconds = i * secondsBetweenFrames))
        }

        val result = Pipeline.run(frames, PipelineConfig(referenceFrameIndex = 0))

        val accepted = result.frameOutcomes.count { it.accepted }
        assertTrue("принято мало кадров: $accepted из $frameCount", accepted >= frameCount - 2)

        val mismatchCount = result.frameOutcomes.count { it.registration?.rotationMismatchWarning == true }
        assertTrue("слишком много ложных предупреждений о повороте: $mismatchCount", mismatchCount <= 1)

        // Стек должен быть заметно менее шумным по фону, чем один сырой кадр.
        val stackBackground = Stats.sigmaClipped(sampleEveryFifth(result.stackedLinear))
        val singleFrameBackground = Stats.sigmaClipped(sampleEveryFifth(frames[0].image))
        assertTrue(
            "шум фона стека (${stackBackground.stdDev}) не меньше 0.7x шума одного кадра (${singleFrameBackground.stdDev})",
            stackBackground.stdDev < singleFrameBackground.stdDev * 0.7
        )

        // Звёзды опорного кадра должны быть узнаваемы в финальном изображении на своих местах.
        val detectedInFinal = StarDetector.detect(result.finalImage.luminance())
        var matched = 0
        for (gt in baseStars) {
            for (d in detectedInFinal) {
                if (kotlin.math.hypot(d.x - gt.x, d.y - gt.y) < 2.0) { matched++; break }
            }
        }
        assertTrue("совпало $matched звёзд из ${baseStars.size}", matched >= (baseStars.size * 0.7).toInt())
    }

    private fun sampleEveryFifth(image: FloatImage): List<Double> {
        val values = ArrayList<Double>()
        var i = 0
        while (i < image.r.size) { values.add(image.r[i].toDouble()); i += 5 }
        return values
    }
}
