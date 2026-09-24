package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Test

class EarthRotationModelTest {

    @Test
    fun rateMatchesKnownPhysicalConstant() {
        // ~15.041 угл.сек/с - см. вывод в docs/LITERATURE.md §2.1
        assertEquals(15.041, EarthRotationModel.SIDEREAL_RATE_ARCSEC_PER_SEC, 0.001)
    }

    @Test
    fun oneSiderealDayGivesFullRotation() {
        val deg = EarthRotationModel.expectedRotationDegrees(EarthRotationModel.SIDEREAL_DAY_SECONDS)
        assertEquals(360.0, deg, 1e-6)
    }

    @Test
    fun sixtySecondsGivesExpectedAngle() {
        val deg = EarthRotationModel.expectedRotationDegrees(60.0)
        val expectedArcsec = EarthRotationModel.SIDEREAL_RATE_ARCSEC_PER_SEC * 60.0
        assertEquals(expectedArcsec / 3600.0, deg, 1e-9)
    }

    @Test
    fun negativeDeltaGivesSameMagnitudeAsPositive() {
        val a = EarthRotationModel.expectedRotationDegrees(45.0)
        val b = EarthRotationModel.expectedRotationDegrees(-45.0)
        assertEquals(a, b, 1e-12)
    }
}
