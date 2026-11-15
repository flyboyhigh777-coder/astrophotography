package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.abs

class HdrAlignerTest {

    /** Текстурная сцена: градиент фона + случайные контрастные пятна (нужны для особых точек Харриса). */
    private fun texturedImage(width: Int, height: Int, seed: Long): FloatImage {
        val n = width * height
        val r = FloatArray(n) { 0.3f }; val g = FloatArray(n) { 0.3f }; val b = FloatArray(n) { 0.3f }
        val rnd = Random(seed)
        repeat(250) {
            val cx = rnd.nextInt(width); val cy = rnd.nextInt(height)
            val size = 3 + rnd.nextInt(8)
            val v = rnd.nextFloat()
            for (dy in -size..size) for (dx in -size..size) {
                if (dx * dx + dy * dy > size * size) continue
                val x = cx + dx; val y = cy + dy
                if (x !in 0 until width || y !in 0 until height) continue
                val i = y * width + x
                r[i] = v; g[i] = v; b[i] = v
            }
        }
        return FloatImage(width, height, r, g, b)
    }

    private fun scaleExposure(img: FloatImage, factor: Float): FloatImage {
        fun scale(ch: FloatArray) = FloatArray(ch.size) { (ch[it] * factor).coerceIn(0f, 1f) }
        return FloatImage(img.width, img.height, scale(img.r), scale(img.g), scale(img.b))
    }

    /** Сдвиг содержимого на (dx, dy) пикселей; у края - повтор крайнего пикселя (без дыр), как и в FrameWarp. */
    private fun shiftImage(img: FloatImage, dx: Int, dy: Int): FloatImage {
        val w = img.width; val h = img.height
        fun shift(ch: FloatArray): FloatArray {
            val out = FloatArray(w * h)
            for (y in 0 until h) for (x in 0 until w) {
                val sx = (x - dx).coerceIn(0, w - 1)
                val sy = (y - dy).coerceIn(0, h - 1)
                out[y * w + x] = ch[sy * w + sx]
            }
            return out
        }
        return FloatImage(w, h, shift(img.r), shift(img.g), shift(img.b))
    }

    private fun avgAbsDiff(a: FloatImage, b: FloatImage, margin: Int): Double {
        var sum = 0.0; var count = 0
        for (y in margin until a.height - margin step 3) for (x in margin until a.width - margin step 3) {
            val i = y * a.width + x
            sum += abs(a.r[i] - b.r[i]); count++
        }
        return sum / count
    }

    @Test
    fun align_thenWarp_recoversConsistentGeometryAcrossExposures() {
        val width = 300; val height = 220
        val base = texturedImage(width, height, seed = 7)
        // Та же геометрия, другая экспозиция.
        val dark = scaleExposure(base, 0.4f)
        // Та же экспозиция, другая геометрия (сдвиг руки/штатива).
        val brightShifted = shiftImage(base, 6, -4)

        val result = HdrAligner.align(listOf(dark, base, brightShifted))
        assertEquals("все три кадра должны совместиться", 3, result.frames.size)
        assertTrue(result.outcomes.all { it.accepted })

        val warped = FrameWarp.warpAll(width, height, result.frames)
        // dark и base - одна и та же геометрия без сдвига, после независимого совмещения
        // к общему опорному кадру они должны остаться согласованы друг с другом.
        val darkCorrected = scaleExposure(warped[0], 1f / 0.4f)
        assertTrue("dark (с компенсацией экспозиции) разошёлся с base после выравнивания: ${avgAbsDiff(darkCorrected, warped[1], 20)}",
            avgAbsDiff(darkCorrected, warped[1], 20) < 0.08)
        // brightShifted - та же экспозиция, что у base, сдвиг должен быть скомпенсирован.
        assertTrue("сдвиг не скомпенсирован: ${avgAbsDiff(warped[2], warped[1], 20)}",
            avgAbsDiff(warped[2], warped[1], 20) < 0.08)
    }

    @Test
    fun align_unrelatedFrame_isRejectedButOthersSucceed() {
        val width = 300; val height = 220
        val base = texturedImage(width, height, seed = 7)
        val similar = scaleExposure(base, 0.6f)
        // Сильно притемнён - заведомо темнее similar/base независимо от случайного
        // содержимого, чтобы опорным кадром (медиана по яркости) гарантированно
        // не оказался сам "чужой" кадр - иначе проверка превращается в "никто не
        // похож на чужой кадр", а не в задуманное "чужой кадр не похож на остальные".
        val stranger = scaleExposure(texturedImage(width, height, seed = 999), 0.05f)

        val result = HdrAligner.align(listOf(base, similar, stranger))
        assertEquals(listOf(true, true, false), result.outcomes.map { it.accepted })
        assertEquals(2, result.frames.size)
    }
}
