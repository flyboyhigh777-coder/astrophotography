package com.astrostacker.core.pano

import com.astrostacker.core.ColorSpace
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * "Мир" - сферическая текстура со случайными фигурами; виртуальная камера
 * снимает её с известными поворотами. Проверяем, что склейка восстанавливает
 * повороты, фокусное, горизонт, экспозицию и совпадает с эталоном.
 */
class PanoramaStitcherTest {

    /** Эквидистантная текстура мира (линейные значения RGB). */
    class World(seed: Long, val tw: Int = 2048, val th: Int = 1024) {
        val r = FloatArray(tw * th); val g = FloatArray(tw * th); val b = FloatArray(tw * th)

        init {
            val rnd = Random(seed)
            for (y in 0 until th) for (x in 0 until tw) {
                val i = y * tw + x
                val t = y.toFloat() / th
                r[i] = 0.15f + 0.3f * t; g[i] = 0.2f + 0.2f * t; b[i] = 0.45f - 0.25f * t
            }
            repeat(1400) {
                val cx = rnd.nextInt(tw); val cy = 60 + rnd.nextInt(th - 120)
                val sw = 4 + rnd.nextInt(40); val sh = 4 + rnd.nextInt(40)
                val cr = rnd.nextFloat(); val cg = rnd.nextFloat(); val cb = rnd.nextFloat()
                val circle = rnd.nextBoolean()
                for (dy in -sh..sh) for (dx in -sw..sw) {
                    if (circle && (dx * dx).toFloat() / (sw * sw) + (dy * dy).toFloat() / (sh * sh) > 1f) continue
                    val x = ((cx + dx) % tw + tw) % tw; val y = (cy + dy).coerceIn(0, th - 1)
                    val i = y * tw + x
                    r[i] = cr; g[i] = cg; b[i] = cb
                }
            }
        }

        /** Цвет мира в направлении (x, y, z); y - вниз. */
        fun sample(x: Double, y: Double, z: Double, out: FloatArray) {
            val n = sqrt(x * x + y * y + z * z)
            val lon = atan2(x, z); val lat = asin((y / n).coerceIn(-1.0, 1.0))
            val fx = ((lon + PI) / (2 * PI) * tw - 0.5).let { ((it % tw) + tw) % tw }
            val fy = ((lat + PI / 2) / PI * th - 0.5).coerceIn(0.0, th - 1.001)
            val x0 = fx.toInt(); val y0 = fy.toInt(); val x1 = (x0 + 1) % tw
            val ax = (fx - x0).toFloat(); val ay = (fy - y0).toFloat()
            for ((k, ch) in listOf(r, g, b).withIndex()) {
                val top = ch[y0 * tw + x0] + (ch[y0 * tw + x1] - ch[y0 * tw + x0]) * ax
                val bot = ch[(y0 + 1) * tw + x0] + (ch[(y0 + 1) * tw + x1] - ch[(y0 + 1) * tw + x0]) * ax
                out[k] = top + (bot - top) * ay
            }
        }
    }

    class Shot(val image: PanoImage, val rotation: Mat3, val gain: Double)

    /** Поворот камеры: рыскание (вправо), тангаж (вверх - отрицательный y), крен. */
    fun cameraRotation(yawDeg: Double, pitchDeg: Double, rollDeg: Double): Mat3 {
        val yaw = Mat3.rodrigues(0.0, Math.toRadians(yawDeg), 0.0)
        val pitch = Mat3.rodrigues(Math.toRadians(pitchDeg), 0.0, 0.0)
        val roll = Mat3.rodrigues(0.0, 0.0, Math.toRadians(rollDeg))
        return yaw * pitch * roll
    }

    fun shoot(world: World, rot: Mat3, w: Int, h: Int, f: Double, gain: Double, seed: Long, focal35: Double?): PanoImage {
        val rnd = Random(seed)
        val px = IntArray(w * h)
        val d = DoubleArray(3); val c = FloatArray(3)
        for (y in 0 until h) for (x in 0 until w) {
            rot.apply((x - w / 2.0) / f, (y - h / 2.0) / f, 1.0, d)
            world.sample(d[0], d[1], d[2], c)
            fun ch(v: Float) = (ColorSpace.linearToSrgb((v * gain + rnd.nextGaussian() * 0.004).toFloat().coerceIn(0f, 1f)) * 255 + 0.5f).toInt().coerceIn(0, 255)
            px[y * w + x] = (0xFF shl 24) or (ch(c[0]) shl 16) or (ch(c[1]) shl 8) or ch(c[2])
        }
        return PanoImage(w, h, px, focal35)
    }

    private fun angleDeg(a: Mat3, b: Mat3): Double {
        val m = a.transpose() * b
        val tr = m[0, 0] + m[1, 1] + m[2, 2]
        return Math.toDegrees(acos(((tr - 1) / 2).coerceIn(-1.0, 1.0)))
    }

    private val w = 640
    private val h = 480
    private val trueF35 = 26.0
    private val trueF get() = trueF35 / 43.27 * hypot(w.toDouble(), h.toDouble())

    fun singleRow(count: Int = 5, stepDeg: Double = 45.0, withExif: Boolean = true): List<Shot> {
        val world = World(11)
        val rnd = Random(5)
        return (0 until count).map { k ->
            // Дрожание: тангаж ±1.5°, крен ±0.5° (крен сильнее всего влияет на определение горизонта).
            val rot = cameraRotation(-stepDeg * (count - 1) / 2 + k * stepDeg, rnd.nextGaussian() * 1.5, rnd.nextGaussian() * 0.5)
            val gain = 0.85 + 0.3 * rnd.nextDouble()
            Shot(shoot(world, rot, w, h, trueF, gain, 100L + k, if (withExif) trueF35 else null), rot, gain)
        }
    }

    private fun checkRelativeRotations(shots: List<Shot>, rots: List<Mat3?>, tolDeg: Double) {
        for (i in shots.indices) for (j in i + 1 until shots.size) {
            val est = rots[i]!!.transpose() * rots[j]!!
            val gt = shots[i].rotation.transpose() * shots[j].rotation
            val err = angleDeg(est, gt)
            assertTrue("ошибка поворота $i-$j = $err°", err < tolDeg)
        }
    }

    @Test
    fun rotationFromTwoRayPairsIsExact() {
        val r = Mat3.rodrigues(0.1, -0.4, 0.2)
        val a = listOf(doubleArrayOf(0.0, 0.0, 1.0), LinAlg.normalize(doubleArrayOf(0.3, -0.2, 1.0)))
        val b = a.map { v -> DoubleArray(3).also { r.apply(v[0], v[1], v[2], it) } }
        assertTrue(angleDeg(LinAlg.bestRotation(a, b), r) < 1e-6)
    }

    @Test
    fun singleRowPanoramaIsRecovered() {
        val shots = singleRow()
        val result = PanoramaStitcher.stitch(shots.map { it.image })
        assertTrue("не все кадры вошли: ${result.included}", result.included.all { it })
        assertEquals("фокусное", trueF, result.focalPx, trueF * 0.02)
        assertTrue("ошибка совмещения ${result.rmsErrorPx} px", result.rmsErrorPx < 1.5)
        assertEquals(PanoProjection.CYLINDRICAL, result.projection)
        // Охват: 4 шага по 45° + поле зрения кадра (2·atan(320/481) ≈ 67°).
        assertEquals(247.3, result.horizontalDeg, 4.0)
        assertTrue("пустые края не обрезаны", result.autoCrop.bottom - result.autoCrop.top < 0.99)
    }

    @Test
    fun anglesFocalHorizonAndExposureAreRecovered() {
        val shots = singleRow(withExif = false)
        val images = shots.map { it.image }
        // Без EXIF: берём заведомо неверное начальное фокусное (30 мм вместо 26).
        val align = PanoramaStitcher.align(images, PanoConfig(defaultFocal35mm = 30.0))
        assertEquals("фокусное без EXIF", trueF, align.focalPx, trueF * 0.03)
        checkRelativeRotations(shots, align.rotations, 0.3)
        // Горизонт: вертикальная составляющая направления взгляда = истинный тангаж.
        for ((k, s) in shots.withIndex()) {
            val estPitch = Math.toDegrees(asin(align.rotations[k]!!.column(2)[1]))
            val gtPitch = Math.toDegrees(asin(s.rotation.column(2)[1]))
            assertEquals("горизонт кадра $k", gtPitch, estPitch, 0.5)
        }
        // Экспозиция: после выравнивания gain·(истинный множитель) одинаков для всех кадров.
        val render = PanoRender.render(images, align, PanoProjection.CYLINDRICAL, 2_000_000)
        val products = shots.indices.map { render.gains[it]!![1] * shots[it].gain }
        val mean = products.average()
        for (p in products) assertEquals("выравнивание экспозиции", 1.0, p / mean, 0.04)
    }

    @Test
    fun twoRowSphericalPanorama() {
        val world = World(23)
        val shots = ArrayList<Shot>()
        var k = 0
        for (pitch in listOf(-22.0, 22.0)) for (yaw in listOf(-60.0, -20.0, 20.0, 60.0)) {
            val rot = cameraRotation(yaw, pitch, 0.0)
            shots.add(Shot(shoot(world, rot, w, h, trueF, 1.0, 300L + k++, trueF35), rot, 1.0))
        }
        val result = PanoramaStitcher.stitch(shots.map { it.image })
        assertTrue("не все кадры вошли: ${result.included}", result.included.all { it })
        assertTrue("ошибка совмещения ${result.rmsErrorPx} px", result.rmsErrorPx < 1.5)
        assertTrue("охват по вертикали ${result.verticalDeg}", result.verticalDeg > 80)
    }

    @Test
    fun unrelatedPhotoIsLeftOut() {
        val shots = singleRow(count = 3)
        val stranger = shoot(World(999), cameraRotation(0.0, 0.0, 0.0), w, h, trueF, 1.0, 77, trueF35)
        val result = PanoramaStitcher.stitch(shots.map { it.image } + stranger)
        assertEquals(listOf(true, true, true, false), result.included)
        assertTrue("охват ${result.horizontalDeg}", abs(result.horizontalDeg - (90 + 67.3)) < 4)
    }
}
