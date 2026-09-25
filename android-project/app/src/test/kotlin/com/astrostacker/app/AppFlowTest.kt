package com.astrostacker.app

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.lifecycle.ViewModelProvider
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
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

/**
 * Сквозной прогон НАСТОЯЩЕГО приложения (MainActivity + Compose + ViewModel +
 * :core) на JVM через Robolectric: выбор кадров с калибровкой -> обработка ->
 * результат -> "Повернуть и обрезать" -> сохранение. На каждом экране делается
 * скриншот в app/build/outputs/roborazzi/ (CI выкладывает их в ветку ci-screenshots).
 * Системный Photo Picker в Robolectric недоступен, поэтому кадры передаются
 * во ViewModel напрямую - ровно то, что делает колбэк пикера.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "ru-rRU-w411dp-h891dp-xxhdpi")
class AppFlowTest {

    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    private val w = 480
    private val h = 320
    private val outDir = File("build/outputs/roborazzi").apply { mkdirs() }

    private fun shot(name: String) {
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(File(outDir, "$name.png").path)
    }

    private fun horizon(x: Int) = 220.0 + 18 * sin(x / 40.0) + 7 * sin(x / 11.0)
    private fun vignette(x: Int, y: Int): Double {
        val dx = (x - w / 2.0) / (w / 2.0); val dy = (y - h / 2.0) / (h / 2.0)
        return 1 - 0.35 * (dx * dx + dy * dy)
    }
    private fun sensor(x: Int, y: Int) = 0.03 + 0.03 * x / w + if (x == 90 && y == 80) 0.6 else 0.0

    private fun writeJpeg(name: String, pixel: (Int, Int, Int) -> Double): Uri {
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            fun c(ch: Int) = (Math.pow(pixel(x, y, ch).coerceIn(0.0, 1.0), 1 / 2.2) * 255 + 0.5).toInt().coerceIn(0, 255)
            px[y * w + x] = (0xFF shl 24) or (c(0) shl 16) or (c(1) shl 8) or c(2)
        }
        val file = File(compose.activity.cacheDir, name)
        file.outputStream().use { Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 95, it) }
        // Robolectric не открывает файлы по Uri сам - отдаём ContentResolver'у
        // свежий поток на каждое открытие (приложение читает файл 3 раза:
        // размеры, пиксели, EXIF), как это делает настоящий Photo Picker.
        val uri = Uri.parse("content://com.astrostacker.test/$name")
        shadowOf(compose.activity.contentResolver).registerInputStreamSupplier(uri) { file.inputStream() }
        return uri
    }

    private fun makeFrames(): Triple<List<Uri>, List<Uri>, List<Uri>> {
        val rnd = Random(3)
        val poleX = w / 2.0; val poleY = -700.0
        val stars = List(250) { Triple(rnd.nextDouble() * w, rnd.nextDouble() * 230, 0.08 + rnd.nextDouble().pow(3) * 0.9) }
        val lights = List(15) { Pair(rnd.nextInt(w), 235 + rnd.nextInt(80)) }
        val lightsUris = (0 until 8).map { i ->
            val a = Math.toRadians(0.35 * i); val c = cos(a); val s = sin(a)
            val sky = DoubleArray(w * h)
            for ((sx, sy, flux) in stars) {
                val dx = sx - poleX; val dy = sy - poleY
                val px = poleX + dx * c - dy * s; val py = poleY + dx * s + dy * c
                for (yy in (py - 4).toInt()..(py + 4).toInt()) for (xx in (px - 4).toInt()..(px + 4).toInt()) {
                    if (xx !in 0 until w || yy !in 0 until h) continue
                    sky[yy * w + xx] += exp(-((xx - px).pow(2) + (yy - py).pow(2)) / (2 * 1.3 * 1.3)) * flux
                }
            }
            val noise = Random(100L + i)
            writeJpeg("light_$i.jpg") { x, y, ch ->
                val base = if (y >= horizon(x)) {
                    if (lights.any { Math.abs(it.first - x) <= 1 && Math.abs(it.second - y) <= 1 }) doubleArrayOf(0.9, 0.6, 0.2)[ch]
                    else doubleArrayOf(0.015, 0.02, 0.012)[ch]
                } else doubleArrayOf(0.05, 0.06, 0.09)[ch] + sky[y * w + x]
                base * vignette(x, y) + sensor(x, y) + noise.nextGaussian() * 0.02
            }
        }
        val darks = (0 until 4).map { k -> val r = Random(500L + k); writeJpeg("dark_$k.jpg") { x, y, _ -> sensor(x, y) + r.nextGaussian() * 0.005 } }
        val flats = (0 until 4).map { k -> val r = Random(600L + k); writeJpeg("flat_$k.jpg") { x, y, _ -> 0.5 * vignette(x, y) + r.nextGaussian() * 0.005 } }
        return Triple(lightsUris, darks, flats)
    }

    private val log = java.util.Collections.synchronizedList(ArrayList<String>())
    private val t0 = System.currentTimeMillis()

    /** Пишет каждую смену состояния экрана (с временем и потоком) - для разбора зависаний. */
    private fun trace(vm: ProcessingViewModel) {
        Thread {
            var last = ""
            while (true) {
                val s = vm.screenState.value
                val d = when (s) {
                    is ScreenState.Processing -> "Processing ${s.progress.stage} ${s.progress.current}/${s.progress.total}"
                    else -> s::class.simpleName.orEmpty() + ((s as? ScreenState.Picking)?.previousError?.let { " error=$it" } ?: "")
                }
                if (d != last) { log.add("+${System.currentTimeMillis() - t0}ms $d"); last = d }
                Thread.sleep(50)
            }
        }.apply { isDaemon = true }.start()
    }

    /** Ждёт экран [T]; при ошибке или таймауте - скриншот, журнал состояний и стеки рабочих потоков. */
    private inline fun <reified T : ScreenState> waitFor(vm: ProcessingViewModel, timeoutMs: Long = 120_000) {
        try {
            pumpUntil(timeoutMs) {
                val s = vm.screenState.value
                s is T || (s is ScreenState.Picking && s.previousError != null)
            }
        } catch (e: Throwable) {
            dumpDiagnostics("timeout waiting for ${T::class.simpleName}")
            throw e
        }
        val s = vm.screenState.value
        if (s is ScreenState.Picking && s.previousError != null) {
            dumpDiagnostics("error")
            throw AssertionError("Приложение вернулось к выбору кадров с ошибкой: ${s.previousError}")
        }
    }

    /**
     * В Robolectric главный поток - это поток теста. `compose.waitUntil` просто
     * спит и не выполняет очередь главного потока, поэтому корутины,
     * возвращающиеся на Dispatchers.Main после фоновой работы, никогда не
     * продолжаются. Здесь очередь явно прокручивается между проверками.
     */
    private fun pumpUntil(timeoutMs: Long, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (true) {
            shadowOf(android.os.Looper.getMainLooper()).idle()
            compose.waitForIdle()
            if (condition()) return
            if (System.currentTimeMillis() > deadline) throw AssertionError("Условие не выполнилось за $timeoutMs мс")
            Thread.sleep(20)
        }
    }

    private fun dumpDiagnostics(reason: String) {
        println("APPFLOW DIAG $reason")
        synchronized(log) { log.forEach { println("APPFLOW STATE $it") } }
        for ((thread, stack) in Thread.getAllStackTraces()) {
            if (thread.name.contains("DefaultDispatcher") || thread.name.contains("Main", ignoreCase = true)) {
                println("APPFLOW THREAD ${thread.name} ${thread.state}")
                stack.take(25).forEach { println("APPFLOW     at $it") }
            }
        }
        runCatching { shot("99_diagnostics") }
    }

    @Test
    fun fullFlow_pickCalibrateProcessEditSave() {
        val vm = ViewModelProvider(compose.activity)[ProcessingViewModel::class.java]
        val (lights, darks, flats) = makeFrames()
        trace(vm)

        shot("01_picker_empty")
        compose.runOnUiThread {
            vm.updateLightFrames(lights)
            vm.updateDarkFrames(darks)
            vm.updateFlatFrames(flats)
        }
        shot("02_picker_selected")
        compose.onNodeWithText("Кадры земли (необязательно)").performScrollTo()
        shot("03a_picker_ground")
        compose.onNodeWithText("Флэты").performScrollTo()
        shot("03_picker_calibration")

        val started = System.currentTimeMillis()
        compose.onNodeWithText("Обработать").performClick()
        waitFor<ScreenState.Result>(vm)
        val result = vm.screenState.value as ScreenState.Result
        println("APPFLOW processing ms=${System.currentTimeMillis() - started} accepted=${result.frameOutcomes.count { it.accepted }}/${result.frameOutcomes.size} calibration=${result.calibrationUsed}")
        assertEquals("все кадры должны совместиться", lights.size, result.frameOutcomes.count { it.accepted })
        assertEquals(listOf(CalibrationKind.DARK, CalibrationKind.FLAT), result.calibrationUsed)
        assertEquals("земля - стек первых 5 кадров", 5, result.groundFramesUsed)
        assertTrue(!result.groundFromSeparateFrames)
        shot("04_result")
        compose.onNodeWithText("Сохранить (TIFF 16 бит)").assertExists()
        compose.onNodeWithText("Земля: стек из 5 кадров серии, без совмещения по звёздам").performScrollTo()
        shot("05_result_controls")

        compose.onNodeWithText("Повернуть и обрезать").performScrollTo().performClick()
        waitFor<ScreenState.Editing>(vm)
        shot("06_editor")
        compose.runOnUiThread {
            vm.editorStraighten(6f)
            vm.editorSetAspect(1f)
        }
        shot("07_editor_straighten_6deg_square")
        compose.onNodeWithText("Применить").performClick()
        waitFor<ScreenState.Result>(vm)
        val edited = vm.screenState.value as ScreenState.Result
        println("APPFLOW edited preview=${edited.previewBitmap.width}x${edited.previewBitmap.height} edit=${edited.edit}")
        assertTrue("после обрезки 1:1 превью должно быть квадратным",
            Math.abs(edited.previewBitmap.width - edited.previewBitmap.height) <= 2)
        shot("08_result_after_edit")

        compose.runOnUiThread { vm.setFreezeGround(false) }
        pumpUntil(10_000) { (vm.screenState.value as? ScreenState.Result)?.freezeGround == false }
        shot("09_result_sky_only")
        compose.runOnUiThread { vm.setFreezeGround(true) }
        pumpUntil(10_000) { (vm.screenState.value as? ScreenState.Result)?.freezeGround == true }

        for (format in listOf("JPEG", "PNG", "TIFF 16 бит")) {
            compose.onNodeWithText(format).performScrollTo().performClick()
            compose.onNodeWithText("Сохранить ($format)").performClick()
            pumpUntil(60_000) { (vm.screenState.value as? ScreenState.Result)?.saveState.let { it == SaveState.Success || it == SaveState.Failed } }
            val saveState = (vm.screenState.value as ScreenState.Result).saveState
            println("APPFLOW save $format -> $saveState")
            assertEquals("сохранение $format", SaveState.Success, saveState)
        }
        compose.onNodeWithText("Формат файла").performScrollTo()
        shot("10_saved")
    }
}
