package com.astrostacker.core

import org.junit.Assert.assertTrue
import org.junit.Test

class DarkFrameCalibratorTest {

    @Test
    fun detectsAndRemovesHotPixel() {
        val width = 50; val height = 50
        val darkFrames = (0 until 5).map {
            val data = FloatArray(width * height) { 0.02f }
            data[25 * width + 25] = 0.9f // горячий пиксель, стабильно яркий на всех тёмных кадрах
            GrayImage(width, height, data)
        }
        val mask = DarkFrameCalibrator.buildHotPixelMask(darkFrames)
        assertTrue("горячий пиксель не найден", mask[25][25])
        assertTrue("ложное срабатывание рядом", !mask[10][10])

        val lightR = FloatArray(width * height) { 0.1f }
        lightR[25 * width + 25] = 0.95f
        val lightImage = FloatImage(width, height, lightR, lightR.copyOf(), lightR.copyOf())
        val calibrated = DarkFrameCalibrator.applyCalibration(lightImage, mask)

        assertTrue("горячий пиксель не был исправлен", calibrated.r[25 * width + 25] < 0.2f)
    }
}
