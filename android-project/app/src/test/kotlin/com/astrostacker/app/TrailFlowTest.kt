package com.astrostacker.app

import android.graphics.Bitmap
import android.net.Uri
import android.os.Looper
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.ViewModelProvider
import com.astrostacker.core.StackingOrder
import com.astrostacker.core.TrailStyle
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
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/**
 * Вкладка "Звёздные треки" в настоящем приложении (Robolectric): выбор
 * кадров -> настройки трека (стиль/порядок) -> сборка -> инфо о снимке ->
 * добавление кадра камерой -> пересборка -> сохранение. Скриншоты - в
 * app/build/outputs/roborazzi/trail_*.png.
 *
 * Кадры - НЕ совмещённые снимки (в отличие от AppFlowTest/PanoramaFlowTest):
 * неподвижный "горизонт" внизу и одна яркая точка, вращающаяся по дуге -
 * ровно то, что нужно для проверки [com.astrostacker.core.StarTrailAccumulator]
 * на настоящем приложении, а не только в тестах :core.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "ru-rRU-w411dp-h891dp-xxhdpi")
class TrailFlowTest {

    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    private val outDir = File("build/outputs/roborazzi").apply { mkdirs() }
    private val w = 200
    private val h = 150

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
            if (System.currentTimeMillis() > deadline) { shot("trail_99_timeout"); throw AssertionError("Не дождались: $what") }
            pump()
            Thread.sleep(20)
        }
        pump()
    }

    /** Кадр: тёмное небо сверху с движущейся по дуге яркой точкой, светлая неподвижная земля снизу. */
    private fun renderFrame(starX: Double, starY: Double): IntArray {
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val ground = y > 110
            val dx = x - starX; val dy = y - starY
            val star = exp(-(dx * dx + dy * dy) / (2 * 2.2 * 2.2))
            fun channel(base: Double): Int {
                val v = (base + star).coerceIn(0.0, 1.0)
                return (Math.pow(v, 1 / 2.2) * 255 + 0.5).toInt().coerceIn(0, 255)
            }
            val base = if (ground) 0.35 else 0.04
            px[y * w + x] = (0xFF shl 24) or (channel(base) shl 16) or (channel(base) shl 8) or channel(base)
        }
        return px
    }

    /** Пишет JPEG с реальным EXIF (время съёмки, камера, ISO, выдержка, GPS на первом кадре) - для проверки сводки на экране "Инфо". */
    private fun writeFrameWithExif(name: String, starX: Double, starY: Double, epochSeconds: Long, iso: Int, withGps: Boolean): Uri {
        val bitmap = Bitmap.createBitmap(renderFrame(starX, starY), w, h, Bitmap.Config.ARGB_8888)
        val file = File(compose.activity.cacheDir, name)
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }

        val exif = ExifInterface(file.path)
        val stamp = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(java.util.Date(epochSeconds * 1000))
        exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, stamp)
        exif.setAttribute(ExifInterface.TAG_MAKE, "TestCam")
        exif.setAttribute(ExifInterface.TAG_MODEL, "Trail9000")
        exif.setAttribute(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, iso.toString())
        exif.setAttribute(ExifInterface.TAG_EXPOSURE_TIME, "20/1")
        if (withGps) exif.setLatLong(51.5, -0.1)
        exif.saveAttributes()

        val uri = Uri.parse("content://com.astrostacker.test/$name")
        shadowOf(compose.activity.contentResolver).registerInputStreamSupplier(uri) { file.inputStream() }
        return uri
    }

    /** 10 кадров, звезда движется по дуге вокруг точки ниже кадра (типичный полярный трек), ISO слегка варьируется. */
    private fun makeTrailFrames(): List<Uri> {
        val cx = w / 2.0; val cy = 260.0; val radius = 220.0
        val baseEpoch = 1_700_000_000L
        return (0 until 10).map { i ->
            val angle = Math.toRadians(-25.0 + i * 5.0)
            val sx = cx + radius * sin(angle)
            val sy = cy - radius * cos(angle)
            writeFrameWithExif("trail_$i.jpg", sx, sy, baseEpoch + i * 25L, iso = 800 + (i % 2) * 200, withGps = i == 0)
        }
    }

    @Test
    fun trailsTab_pickConfigureBuildInfoAddSave() {
        compose.onNodeWithText("Треки").performClick()
        shot("trail_00_picker_empty")

        val vm = ViewModelProvider(compose.activity)[StarTrailViewModel::class.java]
        val frames = makeTrailFrames().shuffled(java.util.Random(7)) // порядок в списке - НЕ по времени съёмки, проверяем сортировку по EXIF
        compose.runOnUiThread { vm.updatePhotos(frames) }
        pump()
        shot("trail_01_picker_selected")

        // Настройки: стиль "Комета" (SHOOTING_STAR) + обратный порядок - проверяем, что именно это применяется.
        compose.onNodeWithText("Настройки трека: Полный").performClick()
        pump()
        shot("trail_02_options")
        compose.onNodeWithText("Комета").performClick()
        compose.onNodeWithText("В обратном порядке").performClick()
        compose.onNodeWithText("Начать").performClick()
        pump()
        compose.onNodeWithText("Настройки трека: Комета").assertExists()

        compose.onNodeWithText("Собрать трек").performClick()
        pumpUntil(120_000, "результат трека") {
            val s = vm.state.value
            s is TrailScreen.Result || (s is TrailScreen.Picking && s.error != null)
        }
        val picked = vm.state.value
        if (picked is TrailScreen.Picking) { shot("trail_99_error"); throw AssertionError("Ошибка сборки трека: ${picked.error}") }
        val result = picked as TrailScreen.Result
        println("TRAILFLOW framesUsed=${result.framesUsed}/${result.framesTotal} style=${result.config.style} order=${result.config.order} exposure=${result.exif.totalExposureSeconds} iso=${result.exif.isoMin}-${result.exif.isoMax} loc=${result.exif.latitude},${result.exif.longitude}")
        assertEquals(10, result.framesUsed)
        assertEquals(TrailStyle.SHOOTING_STAR, result.config.style)
        assertEquals(StackingOrder.REVERSE, result.config.order)
        // 10 кадров x 20с выдержки каждый = 200с суммарно, независимо от порядка обработки.
        assertEquals(200.0, result.exif.totalExposureSeconds, 0.01)
        assertEquals(800, result.exif.isoMin)
        assertEquals(1000, result.exif.isoMax)
        assertTrue("координаты первого кадра должны попасть в сводку", result.exif.hasLocation)
        shot("trail_03_result")

        // Инфо: камера, ISO-диапазон, суммарная выдержка, координаты и кнопка "Открыть на карте".
        compose.onNodeWithContentDescription("Инфо").performClick()
        pump()
        compose.onNodeWithText("Камера: TestCam Trail9000").assertExists()
        compose.onNodeWithText("ISO: 800–1000").assertExists()
        compose.onNodeWithText("Суммарная выдержка: 3m 20s").assertExists()
        compose.onNodeWithText("Открыть на карте").assertExists()
        shot("trail_04_info")
        compose.onNodeWithText("Закрыть").performClick()
        pump()

        // Добавить ещё один кадр камерой - список должен вырасти и трек пересобраться.
        compose.onNodeWithContentDescription("Снять камерой").performClick()
        pump()
        val started = shadowOf(compose.activity).nextStartedActivityForResult ?: throw AssertionError("камера не запустилась")
        // Пишем реальный JPEG туда, куда системная камера записала бы снимок -
        // единственный файл, только что созданный в cacheDir/camera_frames/
        // (см. newCameraFrameUri в CameraCapture.kt).
        val dir = File(compose.activity.cacheDir, "camera_frames")
        val actualFile = dir.listFiles()?.maxByOrNull { it.lastModified() } ?: error("камера не создала файл")
        val bmp = Bitmap.createBitmap(renderFrame(w / 2.0, 40.0), w, h, Bitmap.Config.ARGB_8888)
        actualFile.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        shadowOf(compose.activity).receiveResult(started.intent, android.app.Activity.RESULT_OK, null)
        pumpUntil(120_000, "пересборка после добавления кадра") {
            val s = vm.state.value
            s is TrailScreen.Result && s.framesTotal == 11
        }
        val afterAdd = vm.state.value as TrailScreen.Result
        println("TRAILFLOW afterAdd framesUsed=${afterAdd.framesUsed}/${afterAdd.framesTotal}")
        assertEquals(11, afterAdd.framesTotal)
        assertEquals(11, afterAdd.framesUsed)
        shot("trail_05_result_after_add")

        // По умолчанию формат - JPEG; переключаемся на TIFF 16 бит перед
        // сохранением через ViewModel напрямую - чип формата стоит близко к
        // закреплённой кнопке "Сохранить", и клик по экрану может попасть не
        // туда (ровно так уже ловилась похожая ошибка в PanoramaFlowTest).
        compose.runOnUiThread { vm.setExportFormat(com.astrostacker.app.data.ExportFormat.TIFF16) }
        pump()
        compose.onNodeWithText("Сохранить (TIFF 16 бит)").performClick()
        pumpUntil(60_000, "сохранение") { (vm.state.value as? TrailScreen.Result)?.saveState.let { it == SaveState.Success || it == SaveState.Failed } }
        val saved = (vm.state.value as TrailScreen.Result).saveState
        println("TRAILFLOW save -> $saved")
        assertEquals(SaveState.Success, saved)
        shot("trail_06_saved")
    }

    @Test
    fun trailStyles_visibleInOptionsScreen() {
        compose.onNodeWithText("Треки").performClick()
        val vm = ViewModelProvider(compose.activity)[StarTrailViewModel::class.java]
        compose.runOnUiThread { vm.updatePhotos(makeTrailFrames().take(3)) }
        pump()
        compose.onNodeWithText("Настройки трека: Полный").performClick()
        pump()
        for (label in listOf("Полный", "Плавный", "Комета", "Копьё")) {
            compose.onNodeWithText(label).assertExists()
        }
        compose.onNodeWithText("По времени съёмки").assertExists()
        compose.onNodeWithText("В обратном порядке").assertExists()
        compose.onNodeWithText("Режим Warp (масштаб)").performScrollTo()
        shot("trail_07_options_full")
    }
}
