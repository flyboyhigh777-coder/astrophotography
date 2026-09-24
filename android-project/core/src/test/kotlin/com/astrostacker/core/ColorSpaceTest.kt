package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ColorSpaceTest {

    @Test
    fun srgbToLinear_fixedPoints() {
        assertEquals(0.0f, ColorSpace.srgbToLinear(0f), 1e-6f)
        assertEquals(1.0f, ColorSpace.srgbToLinear(1f), 1e-6f)
    }

    @Test
    fun linearToSrgb_fixedPoints() {
        assertEquals(0.0f, ColorSpace.linearToSrgb(0f), 1e-6f)
        assertEquals(1.0f, ColorSpace.linearToSrgb(1f), 1e-6f)
    }

    @Test
    fun srgbToLinear_knownReferenceValue() {
        // Общеизвестное контрольное значение sRGB-кривой (IEC 61966-2-1):
        // 0.5 гамма-кодированного -> ~0.214 линейного. Проверяем по этой точке,
        // чтобы отловить опечатку в показателе степени/константах формулы.
        assertEquals(0.21404f, ColorSpace.srgbToLinear(0.5f), 1e-3f)
    }

    @Test
    fun roundTrip_srgbToLinearToSrgb_isIdentity() {
        var x = 0.0f
        while (x <= 1.0f) {
            val roundTripped = ColorSpace.linearToSrgb(ColorSpace.srgbToLinear(x))
            assertEquals("round-trip не сходится в x=$x", x, roundTripped, 1e-4f)
            x += 0.01f
        }
    }

    @Test
    fun bothDirections_areMonotonicIncreasing() {
        var prevLinear = -1.0f
        var prevSrgb = -1.0f
        var x = 0.0f
        while (x <= 1.0f) {
            val linear = ColorSpace.srgbToLinear(x)
            val srgb = ColorSpace.linearToSrgb(x)
            assertTrue("srgbToLinear не монотонна в x=$x", linear >= prevLinear - 1e-9f)
            assertTrue("linearToSrgb не монотонна в x=$x", srgb >= prevSrgb - 1e-9f)
            prevLinear = linear
            prevSrgb = srgb
            x += 0.01f
        }
    }

    @Test
    fun srgbByteToLinear_matchesExactFormulaAtLutNodes() {
        // LUT построена ровно в узлах i/255 - в этих точках она обязана
        // совпадать с точной формулой без всякой погрешности интерполяции.
        for (i in 0..255) {
            val exact = ColorSpace.srgbToLinear(i / 255f)
            val looked = ColorSpace.srgbByteToLinear(i)
            assertEquals("расхождение LUT в i=$i", exact, looked, 1e-6f)
        }
    }

    @Test
    fun srgbByteToLinear_clampsOutOfRangeInput() {
        assertEquals(ColorSpace.srgbByteToLinear(0), ColorSpace.srgbByteToLinear(-5), 1e-9f)
        assertEquals(ColorSpace.srgbByteToLinear(255), ColorSpace.srgbByteToLinear(999), 1e-9f)
    }
}
