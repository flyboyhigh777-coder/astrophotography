package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

class Rgb16ImageTest {

    /** Кадр 4×2, в котором значение R = номер пикселя - удобно следить, куда он переехал. */
    private fun indexed(w: Int = 4, h: Int = 2): Rgb16Image {
        val d = ShortArray(w * h * 3)
        for (i in 0 until w * h) { d[i * 3] = (i * 1000).toShort(); d[i * 3 + 1] = 7; d[i * 3 + 2] = 9 }
        return Rgb16Image(w, h, d)
    }

    @Test
    fun quarterTurnClockwiseMovesTopLeftToTopRight() {
        val img = indexed()
        val r = img.rotateQuarterTurns(1)
        assertEquals(2, r.width); assertEquals(4, r.height)
        // Верхний левый (0) -> верхний правый; нижний левый (4) -> верхний левый.
        assertEquals(0, r.value(1, 0))
        assertEquals(4000, r.value(0, 0))
        // Четыре поворота - исходное изображение.
        val back = img.rotateQuarterTurns(1).rotateQuarterTurns(1).rotateQuarterTurns(1).rotateQuarterTurns(1)
        assertTrue(back.data.contentEquals(img.data))
    }

    @Test
    fun straightenRotatesClockwiseAroundCenter() {
        val w = 41; val h = 41
        val d = ShortArray(w * h * 3)
        // Яркая точка справа от центра.
        val src = (20 * w + 35) * 3
        d[src] = 60000.toShort()
        val rotated = Rgb16Image(w, h, d).rotateDegrees(90.0)
        // По часовой на 90°: точка справа от центра уходит вниз (ось y вниз).
        val below = rotated.value(35 * w + 20, 0)
        assertTrue("точка не оказалась снизу: $below", below > 30000)
    }

    @Test
    fun cropTakesRequestedRegion() {
        val img = indexed()
        val c = img.crop(CropRect(0.5f, 0.5f, 1f, 1f))
        assertEquals(2, c.width); assertEquals(1, c.height)
        assertEquals(6000, c.value(0, 0))
    }

    @Test
    fun inscribedCropHasNoBlackCorners() {
        val w = 200; val h = 120; val deg = 8f
        val full = ShortArray(w * h * 3) { 30000 }
        val rotated = Rgb16Image(w, h, full).rotateDegrees(deg.toDouble())
        val cropped = rotated.crop(EditParams.inscribedCrop(w, h, deg))
        var black = 0
        for (i in 0 until cropped.width * cropped.height) if (cropped.value(i, 0) < 1000) black++
        assertEquals("чёрные пиксели после обрезки", 0, black)
    }

    @Test
    fun tiffHeaderAndPixelsAreValid() {
        val img = indexed()
        val bytes = ByteArrayOutputStream().also { TiffWriter.write(it, img) }.toByteArray()
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals('I'.code.toByte(), bytes[0]); assertEquals(42, buf.getShort(2).toInt())
        val ifd = buf.getInt(4)
        val count = buf.getShort(ifd).toInt()
        var stripOffset = -1; var width = -1; var lastTag = 0
        for (e in 0 until count) {
            val p = ifd + 2 + e * 12
            val tag = buf.getShort(p).toInt() and 0xFFFF
            assertTrue("теги не по возрастанию", tag > lastTag); lastTag = tag
            if (tag == 256) width = buf.getInt(p + 8)
            if (tag == 273) stripOffset = buf.getInt(p + 8)
        }
        assertEquals(4, width)
        assertEquals(bytes.size, stripOffset + 4 * 2 * 6)
        // Второй пиксель: R = 1000, G = 7, B = 9.
        assertEquals(1000, buf.getShort(stripOffset + 6).toInt())
        assertEquals(7, buf.getShort(stripOffset + 8).toInt())
    }

    @Test
    fun fromLinearKeepsFullRangeAndGamma() {
        val img = FloatImage(2, 1, floatArrayOf(0f, 1f), floatArrayOf(0.214f, 1f), floatArrayOf(0f, 1f))
        val r = Rgb16Image.fromLinear(img)
        assertEquals(0, r.value(0, 0)); assertEquals(65535, r.value(1, 0))
        // 0.214 линейного ≈ 0.5 sRGB.
        assertEquals(32768.0, r.value(0, 1).toDouble(), 400.0)
    }
}
