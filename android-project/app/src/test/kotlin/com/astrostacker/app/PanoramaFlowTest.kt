package com.astrostacker.app

import android.graphics.Bitmap
import android.net.Uri
import android.os.Looper
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.core.pano.PanoProjection
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.util.Random
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Вкладка "Панорама" в настоящем приложении (Robolectric): 4 синтетических
 * фото вращающейся камеры -> склейка -> смена проекции -> редактор ->
 * сохранение. Скриншоты - в app/build/outputs/roborazzi/pano_*.png.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "ru-rRU-w411dp-h891dp-xxhdpi")
class PanoramaFlowTest {

    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    private val outDir = File("build/outputs/roborazzi").apply { mkdirs() }

    private fun shot(name: String) {
        pump()
        compose.onRoot().captureRoboImage(File(outDir, "$name.png").path)
    }

    private fun pump() {
        shadowOf(Looper.getMainLooper()).idle()
        compose.waitForIdle()
    }

    private fun pumpUntil(timeoutMs: Long, what: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (!condition()) {
            if (System.currentTimeMillis() > deadline) { shot("pano_99_timeout"); throw AssertionError("Не дождались: $what") }
            pump()
            Thread.sleep(20)
        }
        pump()
    }

    /** Мир - сферическая текстура со случайными прямоугольниками и кругами. */
    private class World(seed: Long) {
        val tw = 1600; val th = 800
        val px = IntArray(tw * th)
        init {
            val rnd = Random(seed)
            for (y in 0 until th) for (x in 0 until tw) {
                val t = y * 255 / th
                px[y * tw + x] = (0xFF shl 24) or ((60 + t / 3) shl 16) or ((90 + t / 4) shl 8) or (200 - t / 2)
            }
            repeat(900) {
                val cx = rnd.nextInt(tw); val cy = 40 + rnd.nextInt(th - 80)
                val sw = 3 + rnd.nextInt(30); val sh = 3 + rnd.nextInt(30)
                val color = (0xFF shl 24) or (rnd.nextInt(256) shl 16) or (rnd.nextInt(256) shl 8) or rnd.nextInt(256)
                val circle = rnd.nextBoolean()
                for (dy in -sh..sh) for (dx in -sw..sw) {
                    if (circle && (dx * dx).toFloat() / (sw * sw) + (dy * dy).toFloat() / (sh * sh) > 1f) continue
                    px[(cy + dy).coerceIn(0, th - 1) * tw + ((cx + dx) % tw + tw) % tw] = color
                }
            }
        }
        fun sample(x: Double, y: Double, z: Double): Int {
            val n = sqrt(x * x + y * y + z * z)
            val u = ((atan2(x, z) + PI) / (2 * PI) * tw).toInt().coerceIn(0, tw - 1)
            val v = ((asin(y / n) + PI / 2) / PI * th).toInt().coerceIn(0, th - 1)
            return px[v * tw + u]
        }
    }

    private fun makePhotos(count: Int, stepDeg: Double): List<Uri> {
        val world = World(42)
        val w = 480; val h = 360
        val f = 26.0 / 43.27 * sqrt((w * w + h * h).toDouble())
        return (0 until count).map { k ->
            val yaw = Math.toRadians(-stepDeg * (count - 1) / 2 + k * stepDeg)
            val cy = cos(yaw); val sy = sin(yaw)
            val px = IntArray(w * h)
            for (y in 0 until h) for (x in 0 until w) {
                val cx = (x - w / 2.0) / f; val cyy = (y - h / 2.0) / f
                px[y * w + x] = world.sample(cy * cx + sy, cyy, -sy * cx + cy)
            }
            val file = File(compose.activity.cacheDir, "pano_$k.jpg")
            file.outputStream().use { Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 95, it) }
            val uri = Uri.parse("content://com.astrostacker.test/pano_$k.jpg")
            shadowOf(compose.activity.contentResolver).registerInputStreamSupplier(uri) { file.inputStream() }
            uri
        }
    }

    @Test
    fun panoramaTab_pickStitchProjectionEditSave() {
        shot("pano_00_astro_tab_with_nav")
        compose.onNodeWithText("Панорама").performClick()
        shot("pano_01_picker_empty")

        val vm = ViewModelProvider(compose.activity)[PanoramaViewModel::class.java]
        val photos = makePhotos(4, 40.0)
        compose.runOnUiThread { vm.updatePhotos(photos) }
        shot("pano_02_picker_selected")

        compose.onNodeWithText("Склеить панораму").performClick()
        pumpUntil(180_000, "результат панорамы") {
            val s = vm.state.value
            s is PanoScreen.Result || (s is PanoScreen.Picking && s.error != null)
        }
        val picked = vm.state.value
        if (picked is PanoScreen.Picking) { shot("pano_99_error"); throw AssertionError("Ошибка склейки: ${picked.error}") }
        val result = picked as PanoScreen.Result
        println("PANOFLOW included=${result.includedCount}/${result.totalCount} fov=${result.horizontalDeg}x${result.verticalDeg} proj=${result.projection} out=${result.outputWidth}x${result.outputHeight}")
        assertEquals(4, result.includedCount)
        assertEquals(187.0, result.horizontalDeg, 6.0) // 3 шага по 40° + поле зрения кадра ~67°
        shot("pano_03_result")

        compose.runOnUiThread { vm.setProjection(PanoProjection.SPHERICAL) }
        pumpUntil(60_000, "пересборка в сферу") { (vm.state.value as? PanoScreen.Result)?.let { !it.isRendering && it.projection == PanoProjection.SPHERICAL } == true }
        shot("pano_04_result_spherical")

        compose.runOnUiThread { vm.setAutoCrop(false) }
        pumpUntil(10_000, "без обрезки") { (vm.state.value as? PanoScreen.Result)?.autoCropEnabled == false }
        shot("pano_05_result_uncropped")
        compose.runOnUiThread { vm.setAutoCrop(true) }
        pumpUntil(10_000, "с обрезкой") { (vm.state.value as? PanoScreen.Result)?.autoCropEnabled == true }

        compose.runOnUiThread { vm.openEditor() }
        pumpUntil(10_000, "редактор") { vm.state.value is PanoScreen.Editing }
        compose.runOnUiThread { vm.editorSetAspect(16f / 9f) }
        shot("pano_06_editor_16x9")
        compose.onNodeWithText("Применить").performClick()
        pumpUntil(10_000, "результат после редактора") { vm.state.value is PanoScreen.Result }
        val edited = vm.state.value as PanoScreen.Result
        assertEquals("16:9 после редактора", 16.0 / 9.0, edited.outputWidth.toDouble() / edited.outputHeight, 0.05)
        shot("pano_07_result_16x9")

        compose.runOnUiThread { vm.setExportFormat(ExportFormat.JPEG) }
        compose.onNodeWithText("Сохранить (JPEG)").performClick()
        pumpUntil(60_000, "сохранение") { (vm.state.value as? PanoScreen.Result)?.saveState.let { it == SaveState.Success || it == SaveState.Failed } }
        val saved = (vm.state.value as PanoScreen.Result).saveState
        println("PANOFLOW save -> $saved")
        assertEquals(SaveState.Success, saved)
        // 16:9 из панорамы высотой ~300 пикс. (тестовые кадры 480×360) - ширина порядка 500.
        assertTrue("ширина ${edited.outputWidth}", edited.outputWidth > 300)
    }
}
