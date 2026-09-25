package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class FrameCalibrationTest {

    private val width = 64
    private val height = 48

    private fun gray(f: (x: Int, y: Int) -> Float): FloatImage {
        val d = FloatArray(width * height) { f(it % width, it / width) }
        return FloatImage(width, height, d, d.copyOf(), d.copyOf())
    }

    /** Виньетирование: к краям кадр темнее (1.0 в центре, 0.6 в углах). */
    private fun vignette(x: Int, y: Int): Float {
        val dx = (x - width / 2.0) / (width / 2.0)
        val dy = (y - height / 2.0) / (height / 2.0)
        return (1.0 - 0.2 * (dx * dx + dy * dy)).toFloat()
    }

    @Test
    fun fullCalibrationRecoversFlatScene() {
        val bias = 0.02f
        val thermal = { x: Int, y: Int -> if (x == 10 && y == 10) 0.5f else 0.03f + 0.02f * x / width } // горячий пиксель + засветка слева направо
        val scene = 0.2f
        val rnd = Random(1)

        val lights = (0 until 3).map { gray { x, y -> scene * vignette(x, y) + bias + thermal(x, y) + (rnd.nextGaussian() * 0.002).toFloat() } }
        val darks = MasterAccumulator().also { acc -> repeat(8) { acc.add(gray { x, y -> bias + thermal(x, y) + (rnd.nextGaussian() * 0.002).toFloat() }) } }
        val biases = MasterAccumulator().also { acc -> repeat(8) { acc.add(gray { _, _ -> bias + (rnd.nextGaussian() * 0.002).toFloat() }) } }
        val flats = MasterAccumulator().also { acc -> repeat(8) { acc.add(gray { x, y -> 0.5f * vignette(x, y) + bias + (rnd.nextGaussian() * 0.002).toFloat() }) } }

        val masters = FrameCalibration.buildMasters(darks.mean(), biases.mean(), flats.mean())
        val calibrated = FrameCalibration.calibrate(lights[0], masters)

        // После калибровки сцена должна стать ровной: центр и угол почти одинаковы.
        val center = calibrated.r[(height / 2) * width + width / 2]
        val corner = calibrated.r[2 * width + 2]
        assertEquals("виньетирование не исправлено: центр $center, угол $corner", center.toDouble(), corner.toDouble(), 0.02)
        // Засветка и горячий пиксель вычтены.
        val left = calibrated.r[(height / 2) * width + 3]
        val right = calibrated.r[(height / 2) * width + width - 4]
        assertEquals("засветка не вычтена", left.toDouble(), right.toDouble(), 0.03)
        assertTrue("горячий пиксель остался: ${calibrated.r[10 * width + 10]}", calibrated.r[10 * width + 10] < 0.4f)
    }

    @Test
    fun biasOnlyIsSubtractedWhenNoDarks() {
        val light = gray { _, _ -> 0.3f }
        val bias = MasterAccumulator().also { it.add(gray { _, _ -> 0.05f }) }
        val masters = FrameCalibration.buildMasters(null, bias.mean(), null)
        assertEquals(0.25, FrameCalibration.calibrate(light, masters).r[100].toDouble(), 1e-5)
    }

    @Test
    fun mismatchedSizeMastersAreIgnored() {
        val light = gray { _, _ -> 0.3f }
        val small = FloatImage.filled(10, 10, 0.1f)
        val acc = MasterAccumulator().also { it.add(small) }
        val masters = FrameCalibration.buildMasters(acc.mean(), null, null)
        assertEquals(0.3, FrameCalibration.calibrate(light, masters).r[5].toDouble(), 1e-6)
    }

    private fun MasterAccumulator() = FrameCalibration.MasterAccumulator()
}
