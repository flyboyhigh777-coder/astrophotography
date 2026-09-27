package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

class StarTrailTest {

    // ---------- weightAndScale ----------

    @Test
    fun fullStyleIsAlwaysFullBrightness() {
        val config = StarTrailConfig(style = TrailStyle.FULL)
        for (i in 0 until 10) {
            val (weight, scale) = StarTrail.weightAndScale(i, 10, config)
            assertEquals(1.0, weight, 1e-9)
            assertEquals(1.0, scale, 1e-9) // warpZoom выключен по умолчанию
        }
    }

    @Test
    fun fadeStyleRampsUpMonotonically() {
        val config = StarTrailConfig(style = TrailStyle.FADE, minWeight = 0.3)
        val weights = (0 until 8).map { StarTrail.weightAndScale(it, 8, config).first }
        assertEquals(0.3, weights.first(), 1e-9)
        assertEquals(1.0, weights.last(), 1e-9)
        for (i in 1 until weights.size) assertTrue("не монотонно: $weights", weights[i] >= weights[i - 1])
    }

    @Test
    fun shootingStarBoostsOnlyTheLastFrame() {
        val config = StarTrailConfig(style = TrailStyle.SHOOTING_STAR, minWeight = 0.3, shootingStarBoost = 1.6)
        val n = 8
        val weights = (0 until n).map { StarTrail.weightAndScale(it, n, config).first }
        // Все, кроме последнего, совпадают с обычным FADE.
        val fadeWeights = (0 until n).map { StarTrail.weightAndScale(it, n, config.copy(style = TrailStyle.FADE)).first }
        for (i in 0 until n - 1) assertEquals(fadeWeights[i], weights[i], 1e-9)
        assertEquals(fadeWeights.last() * 1.6, weights.last(), 1e-9)
        assertTrue("голова кометы должна быть ярче предыдущего кадра", weights.last() > weights[n - 2])
    }

    @Test
    fun javelinFadesBothEndsAndPeaksInTheMiddle() {
        val config = StarTrailConfig(style = TrailStyle.JAVELIN, minWeight = 0.2)
        val n = 9
        val weights = (0 until n).map { StarTrail.weightAndScale(it, n, config).first }
        assertEquals(0.2, weights.first(), 1e-9)
        assertEquals(0.2, weights.last(), 0.05) // sin(pi) ~ 0 с плавающей точкой, не ровно 0.2
        val mid = weights[n / 2]
        assertTrue("середина должна быть самой яркой: $weights", weights.all { it <= mid + 1e-9 })
        assertEquals(1.0, mid, 1e-6)
    }

    @Test
    fun warpZoomScalesFromOneToMaxAcrossTheSeries() {
        val config = StarTrailConfig(warpZoom = true, warpMaxScale = 1.5)
        assertEquals(1.0, StarTrail.weightAndScale(0, 5, config).second, 1e-9)
        assertEquals(1.5, StarTrail.weightAndScale(4, 5, config).second, 1e-9)
        assertEquals(1.0, StarTrail.weightAndScale(0, 5, config.copy(warpZoom = false)).second, 1e-9)
    }

    @Test
    fun orderIndicesReversesWhenConfigured() {
        assertEquals((0 until 5).toList(), StarTrail.orderIndices(5, StackingOrder.CHRONOLOGICAL))
        assertEquals((0 until 5).toList().reversed(), StarTrail.orderIndices(5, StackingOrder.REVERSE))
    }

    // ---------- StarTrailAccumulator ----------

    private val w = 120
    private val h = 90

    private fun blank(v: Float = 0f) = FloatImage.filled(w, h, v)

    private fun withStar(base: FloatImage, x: Int, y: Int, brightness: Float): FloatImage {
        val r = base.r.copyOf(); val g = base.g.copyOf(); val b = base.b.copyOf()
        if (x in 0 until w && y in 0 until h) {
            val i = y * w + x
            r[i] = brightness; g[i] = brightness; b[i] = brightness
        }
        return FloatImage(w, h, r, g, b)
    }

    @Test
    fun lightenCombineTracesAnArcAcrossUnalignedFrames() {
        // Камера неподвижна, звезда движется по кругу вокруг центра кадра -
        // ни один кадр не совмещается со следующим (в отличие от Pipeline).
        val cx = w / 2.0; val cy = h / 2.0; val radius = 30.0
        val acc = StarTrailAccumulator(w, h)
        val visited = HashSet<Pair<Int, Int>>()
        for (i in 0 until 24) {
            val angle = i * (Math.PI / 12)
            val sx = (cx + radius * cos(angle)).toInt()
            val sy = (cy + radius * sin(angle)).toInt()
            visited.add(sx to sy)
            val (weight, scale) = StarTrail.weightAndScale(i, 24, StarTrailConfig())
            acc.add(withStar(blank(), sx, sy, 0.9f), weight, scale)
        }
        val result = acc.result()
        assertEquals(24, acc.framesAdded)
        // Каждая позиция звезды должна остаться яркой в итоговом кадре (максимум сохранил все).
        for ((x, y) in visited) assertTrue("дуга прервана в ($x,$y)", result.r[y * w + x] > 0.5f)
        // Точка вне пути звезды - фон, должна остаться тёмной.
        assertTrue(result.r[2 * w + 2] < 0.05f)
    }

    @Test
    fun higherWeightFrameWinsThePixel() {
        val acc = StarTrailAccumulator(w, h)
        acc.add(withStar(blank(), 10, 10, 0.9f), weight = 0.3)
        acc.add(withStar(blank(), 10, 10, 0.9f), weight = 0.8)
        // 0.9*0.3=0.27 < 0.9*0.8=0.72 - должен остаться более яркий вклад.
        assertEquals(0.72f, acc.result().r[10 * w + 10], 1e-4f)
    }

    @Test
    fun staticForegroundStaysUnchangedAcrossFrames() {
        val acc = StarTrailAccumulator(w, h)
        val ground = withStar(blank(0.4f), 50, 50, 0.9f) // "звезда" тут условно - неподвижный ориентир
        repeat(5) { i ->
            val (weight, _) = StarTrail.weightAndScale(i, 5, StarTrailConfig(style = TrailStyle.FADE))
            acc.add(ground, weight)
        }
        // Последний (самый яркий, weight=1.0) кадр должен победить на статичном фоне.
        assertEquals(0.4f, acc.result().r[0], 1e-4f)
    }

    @Test
    fun warpScaleMovesPointsAwayFromCenterByTheExpectedAmount() {
        val acc = StarTrailAccumulator(w, h)
        val cx = (w - 1) / 2.0
        // Точка ближе к центру - после увеличения на scale=1.4 остаётся в кадре.
        val offset = 20
        val srcX = (cx + offset).toInt()
        val frame = withStar(blank(), srcX, h / 2, 0.9f)
        acc.add(frame, weight = 1.0, scale = 1.4)
        val result = acc.result()
        // Прямое отображение: output = center + (input - center) * scale.
        val expectedX = (cx + offset * 1.4).toInt()
        var brightest = -1
        var brightestVal = 0f
        for (x in 0 until w) {
            val v = result.r[(h / 2) * w + x]
            if (v > brightestVal) { brightestVal = v; brightest = x }
        }
        assertTrue("яркая точка не найдена", brightestVal > 0.5f)
        assertTrue("точка сместилась не туда: $brightest, ожидали ~$expectedX", abs(brightest - expectedX) <= 1)
        assertTrue("увеличение должно сдвинуть точку дальше от центра", brightest > srcX)
    }

    @Test
    fun mismatchedFrameSizeThrows() {
        val acc = StarTrailAccumulator(w, h)
        val bad = FloatImage.filled(w + 1, h, 0f)
        var threw = false
        try {
            acc.add(bad, 1.0)
        } catch (e: IllegalArgumentException) {
            threw = true
        }
        assertTrue(threw)
    }
}
