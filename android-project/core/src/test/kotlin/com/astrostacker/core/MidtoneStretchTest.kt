package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MidtoneStretchTest {

    @Test
    fun mtf_fixedPoints() {
        val m = 0.25
        assertEquals(0.0, MidtoneStretch.mtf(m, 0.0), 1e-9)
        assertEquals(1.0, MidtoneStretch.mtf(m, 1.0), 1e-9)
        assertEquals(0.5, MidtoneStretch.mtf(m, m), 1e-9)
    }

    @Test
    fun mtf_halfIsIdentity() {
        var x = 0.0
        while (x <= 1.0) {
            assertEquals(x, MidtoneStretch.mtf(0.5, x), 1e-9)
            x += 0.05
        }
    }

    @Test
    fun mtf_isMonotonicIncreasing() {
        val m = 0.3
        var previous = -1.0
        var x = 0.0
        while (x <= 1.0) {
            val value = MidtoneStretch.mtf(m, x)
            assertTrue("MTF не монотонна в x=$x (value=$value, previous=$previous)", value >= previous - 1e-9)
            previous = value
            x += 0.01
        }
    }

    @Test
    fun autoMidtone_achievesTargetLevel() {
        val bg = 0.08
        val target = 0.25
        val m = MidtoneStretch.autoMidtoneForBackground(bg, target)
        assertEquals(target, MidtoneStretch.mtf(m, bg), 1e-6)
    }

    @Test
    fun autoMidtone_isIdentityWhenTargetEqualsBackground() {
        // MTF(0.5,x)=x для любого x - при target==background правильный ответ m=0.5 (тождество),
        // а не m==bg (это верно лишь для bg=0.5).
        val m = MidtoneStretch.autoMidtoneForBackground(0.2, 0.2)
        assertEquals(0.5, m, 1e-6)
    }
}
