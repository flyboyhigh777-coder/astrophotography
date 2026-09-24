import com.astrostacker.core.ColorSpace
import com.astrostacker.core.DarkFrameCalibrator
import com.astrostacker.core.FloatImage
import com.astrostacker.core.FrameInput
import com.astrostacker.core.Pipeline
import com.astrostacker.core.PipelineConfig
import com.astrostacker.core.Stage
import com.astrostacker.core.Stats
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import java.io.PrintStream
import javax.imageio.ImageIO
import kotlin.system.exitProcess

/**
 * Автономная проверка пайплайна `:core` на НАСТОЯЩИХ фотографиях - без
 * Android, без adb, без физического телефона. Работает прямо здесь, в
 * песочнице разработки, поверх уже собранного и протестированного
 * `build/core-main.jar`. См. docs/TESTING_PLAN.md ("Трек A") - это его
 * реализация, не просто план.
 *
 * Использует ТОТ ЖЕ код (`ColorSpace`, `Pipeline`, `DarkFrameCalibrator`),
 * что и настоящее Android-приложение (`app/.../ImageDecoding.kt`,
 * `ProcessingViewModel.kt`) - отличается только источник декодирования
 * (`javax.imageio.ImageIO` вместо `android.graphics.BitmapFactory`, так как
 * здесь нет Android SDK), поэтому результат репрезентативен для того, что
 * увидит пользователь на телефоне, а не отдельный, ничем не связанный тест.
 *
 * Сборка и запуск:
 *   kotlinc -cp build/core-main.jar validation/RealPhotoValidation.kt \
 *           -include-runtime -d validation/harness.jar
 *   java -Xmx6g -jar validation/harness.jar \
 *        <папка_светлых_кадров> <папка_тёмных_кадров_или_-> \
 *        <exif_манифест_или_-> <путь_к_выходному.png>
 *
 * EXIF-манифест - текстовый файл "имя_файла=секунды_эпохи" по строке на файл,
 * см. validation/extract_exif_manifest.sh (использует exiftool+ImageMagick,
 * умеет конвертировать HEIC в PNG, так как javax.imageio без манифеста не
 * читает HEIC). Манифест необязателен - без него EXIF-время просто не
 * используется (Pipeline.run корректно работает и без него, диагностика по
 * EarthRotationModel в этом случае просто не выполняется - см. Pipeline.kt).
 */
fun main(args: Array<String>) {
    // По умолчанию System.out в этой JVM использует не UTF-8 (зависит от
    // локали окружения, не от кода) - без этого русский текст в выводе
    // превращается в "?????". Переопределяем явно, а не полагаемся на
    // -Dfile.encoding/-Dstdout.encoding снаружи - так вывод корректен, каким
    // бы способом (java -cp ...) ни запустили этот .jar. Обнаружено и
    // исправлено при первом же реальном прогоне на синтетических кадрах -
    // именно то, ради чего этот прогон и делался (см. docs/TESTING_PLAN.md).
    System.setOut(PrintStream(System.out, true, "UTF-8"))
    System.setErr(PrintStream(System.err, true, "UTF-8"))

    if (args.size < 4) {
        System.err.println(
            "Использование: <папка_светлых_кадров> <папка_тёмных_кадров|-> <exif_манифест|-> <выходной.png>"
        )
        exitProcess(1)
    }
    val lightDir = File(args[0])
    val darkDir = args[1].takeIf { it != "-" }?.let { File(it) }
    val exifManifestFile = args[2].takeIf { it != "-" }?.let { File(it) }
    val outputPath = args[3]

    val exifMap = loadExifManifest(exifManifestFile)

    val lightFiles = lightDir.listFiles { f -> f.isFile && isImageFile(f.name) }
        ?.sortedBy { it.name }
        ?: emptyList()
    if (lightFiles.size < 2) {
        System.err.println("Нужно минимум 2 файла в папке светлых кадров, найдено: ${lightFiles.size}")
        exitProcess(1)
    }

    println("Декодирование ${lightFiles.size} светлых кадров из ${lightDir.path}...")
    val decodeStart = System.currentTimeMillis()
    val frameInputs = lightFiles.map { file ->
        val image = decodeToFloatImage(file)
        val epochSeconds = exifMap[file.name]
        println("  ${file.name}: ${image.width}x${image.height}px, EXIF-время=${if (epochSeconds != null) "есть" else "нет"}")
        FrameInput(image, epochSeconds)
    }
    println("Декодирование заняло ${System.currentTimeMillis() - decodeStart} мс")

    var finalFrameInputs = frameInputs
    val darkFiles = darkDir?.takeIf { it.isDirectory }
        ?.listFiles { f -> f.isFile && isImageFile(f.name) }
        ?.toList()
        .orEmpty()
    if (darkFiles.isNotEmpty()) {
        println("Калибровка по ${darkFiles.size} тёмным кадрам...")
        val darkImages = darkFiles.map { decodeToFloatImage(it).luminance() }
        val hotPixelMask = DarkFrameCalibrator.buildHotPixelMask(darkImages)
        finalFrameInputs = frameInputs.map { it.copy(image = DarkFrameCalibrator.applyCalibration(it.image, hotPixelMask)) }
    }

    println()
    println("Запуск Pipeline.run на ${finalFrameInputs.size} кадрах...")
    val pipelineStart = System.currentTimeMillis()
    var lastStage: Stage? = null
    val result = Pipeline.run(finalFrameInputs, PipelineConfig()) { progress ->
        if (progress.stage != lastStage) {
            println("  Этап: ${progress.stage}")
            lastStage = progress.stage
        }
    }
    println("Pipeline.run заняло ${System.currentTimeMillis() - pipelineStart} мс")

    println()
    println("=== ОТЧЁТ ===")
    println("Опорный кадр: #${result.referenceFrameIndex} (${lightFiles[result.referenceFrameIndex].name})")
    val acceptedCount = result.frameOutcomes.count { it.accepted }
    println("Успешно совмещено: $acceptedCount из ${result.frameOutcomes.size}")
    for (outcome in result.frameOutcomes) {
        val reg = outcome.registration
        val regInfo = if (reg != null) {
            buildString {
                append("модель=${reg.modelUsed}, инлаеров=${reg.inlierCount}/${reg.totalCandidates}, ")
                append("RMS=${fmt(reg.rmsResidualPx)}px, поворот=${fmt(reg.fittedRotationDeg)}°")
                reg.expectedRotationDeg?.let { append(", ожидался=${fmt(it)}°") }
                if (reg.rotationMismatchWarning) append(" [!! НЕСОВПАДЕНИЕ ПОВОРОТА]")
            }
        } else {
            "-"
        }
        val tag = if (outcome.accepted) "OK" else "ОТКЛОНЁН"
        println("  [$tag] ${lightFiles[outcome.index].name}: ${outcome.reason} $regInfo")
    }

    val singleFrameNoise = localBackgroundNoise(frameInputs[result.referenceFrameIndex].image)
    val stackedNoise = localBackgroundNoise(result.stackedLinear)
    val ratio = if (stackedNoise > 1e-9) singleFrameNoise / stackedNoise else Double.NaN
    println("Шум фона (σ, линейная яркость, локальная оценка): один опорный кадр=${fmt5(singleFrameNoise)}, стек=${fmt5(stackedNoise)} (снижение в ${fmt(ratio)}x, теоретический предел для ${finalFrameInputs.size} кадров - ${fmt(kotlin.math.sqrt(finalFrameInputs.size.toDouble()))}x)")

    println()
    println("Сохранение результата в $outputPath...")
    val outBitmap = floatImageToBufferedImage(result.finalImage)
    ImageIO.write(outBitmap, "png", File(outputPath))
    println("Готово.")
}

private fun fmt(v: Double): String = "%.4f".format(v)
private fun fmt5(v: Double): String = "%.5f".format(v)

/**
 * Отфильтровывает `exif_manifest.txt` и любой другой не-картиночный файл,
 * который может лежать РЯДОМ с кадрами в той же папке - `extract_exif_manifest.sh`
 * специально кладёт манифест именно туда же (см. его комментарии), так что
 * наивная проверка "любой нескрытый файл - это кадр" (первая версия этой
 * функции) принимала манифест за 21-й кадр и падала на попытке его
 * декодировать. Найдено и исправлено на первом же прогоне на настоящих
 * фотографиях - ровно по документированной в TESTING_PLAN.md процедуре
 * (сначала extract_exif_manifest.sh, потом этот инструмент на том же выходном
 * каталоге), то есть баг задел бы именно тот путь, который советуют документы.
 * Список расширений соответствует тому, что `extract_exif_manifest.sh`
 * реально может оставить в выходной папке (HEIC/HEIF там уже сконвертированы
 * в PNG - см. его код).
 */
private fun isImageFile(name: String): Boolean {
    // endsWith(..., ignoreCase = true) вместо name.lowercase() - последнее
    // требует более новую версию Kotlin stdlib, чем системный kotlinc в этой
    // песочнице (1.3-SNAPSHOT); эта функция ниже собирается ИМЕННО им,
    // отдельно от Gradle-проекта (там Kotlin 2.0.20, см. libs.versions.toml) -
    // см. docs/TESTING_PLAN.md, эта проверка собирается и запускается
    // напрямую здесь же, в консоли, а не через Gradle.
    return name.endsWith(".jpg", ignoreCase = true) || name.endsWith(".jpeg", ignoreCase = true) ||
        name.endsWith(".png", ignoreCase = true) || name.endsWith(".heic", ignoreCase = true) ||
        name.endsWith(".heif", ignoreCase = true)
}

private fun loadExifManifest(file: File?): Map<String, Double> {
    if (file == null || !file.exists()) return emptyMap()
    val map = HashMap<String, Double>()
    for (line in file.readLines()) {
        val idx = line.indexOf('=')
        if (idx < 0) continue
        val name = line.substring(0, idx)
        val value = line.substring(idx + 1).toDoubleOrNull() ?: continue
        map[name] = value
    }
    return map
}

/** Тот же потолок суммарного числа пикселей на кадр, что и `MemoryBudget.HARD_CAP_TOTAL_PIXELS` в `:app` - чтобы эта проверка была на том же эффективном разрешении, что и настоящее приложение на телефоне, а не на другом, ничего не говорящем о реальном поведении. */
private const val MAX_TOTAL_PIXELS = 4096L * 3072L

private fun decodeToFloatImage(file: File): FloatImage {
    val original = ImageIO.read(file)
        ?: error("Не удалось декодировать файл: ${file.name}. Если это HEIC/HEIF - сначала прогоните validation/extract_exif_manifest.sh (конвертирует в PNG через ImageMagick).")
    val scaled = downsampleIfNeeded(original, MAX_TOTAL_PIXELS)
    val width = scaled.width
    val height = scaled.height
    val r = FloatArray(width * height)
    val g = FloatArray(width * height)
    val b = FloatArray(width * height)
    for (y in 0 until height) {
        for (x in 0 until width) {
            val argb = scaled.getRGB(x, y)
            val idx = y * width + x
            r[idx] = ColorSpace.srgbByteToLinear((argb shr 16) and 0xFF)
            g[idx] = ColorSpace.srgbByteToLinear((argb shr 8) and 0xFF)
            b[idx] = ColorSpace.srgbByteToLinear(argb and 0xFF)
        }
    }
    return FloatImage(width, height, r, g, b)
}

/**
 * В отличие от Android `BitmapFactory.inSampleSize` (уменьшает разрешение
 * ПРЯМО во время декодирования), `javax.imageio` не даёт универсального
 * способа сделать то же самое для произвольного формата - поэтому здесь
 * сначала полностью декодируем, потом уменьшаем через `Graphics2D`. Для
 * одного файла за раз (кадры обрабатываются последовательно, не все сразу)
 * это приемлемо в песочнице с несколькими гигабайтами ОЗУ, но НЕ повторяет
 * экономию памяти реального приложения на телефоне - см. docs/TESTING_PLAN.md.
 */
private fun downsampleIfNeeded(image: BufferedImage, maxTotalPixels: Long): BufferedImage {
    val totalPixels = image.width.toLong() * image.height.toLong()
    if (totalPixels <= maxTotalPixels) return image
    val scale = kotlin.math.sqrt(maxTotalPixels.toDouble() / totalPixels.toDouble())
    val newWidth = (image.width * scale).toInt().coerceAtLeast(1)
    val newHeight = (image.height * scale).toInt().coerceAtLeast(1)
    val scaled = BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_ARGB)
    val g2d = scaled.createGraphics()
    g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
    g2d.drawImage(image, 0, 0, newWidth, newHeight, null)
    g2d.dispose()
    return scaled
}

private fun floatImageToBufferedImage(image: FloatImage): BufferedImage {
    val out = BufferedImage(image.width, image.height, BufferedImage.TYPE_INT_RGB)
    for (y in 0 until image.height) {
        for (x in 0 until image.width) {
            val idx = y * image.width + x
            val r = to8Bit(ColorSpace.linearToSrgb(image.r[idx]))
            val g = to8Bit(ColorSpace.linearToSrgb(image.g[idx]))
            val b = to8Bit(ColorSpace.linearToSrgb(image.b[idx]))
            out.setRGB(x, y, (r shl 16) or (g shl 8) or b)
        }
    }
    return out
}

private fun to8Bit(v: Float): Int = (v * 255f + 0.5f).toInt().coerceIn(0, 255)

/**
 * Оценка σ шума фона ЛОКАЛЬНО (по сетке маленьких ячеек, медиана по ячейкам) -
 * а не σ-клиппингом по всему кадру сразу. Разница принципиальна: у реального
 * (и у синтетического тестового) неба яркость фона плавно меняется по кадру
 * (виньетирование/засветка городских огней) - это ПРОСТРАНСТВЕННАЯ вариация,
 * а не ШУМОВАЯ, и она ОДИНАКОВА что в одном кадре, что в стеке (стекинг
 * усредняет один и тот же градиент - он никуда не денется). σ-клиппинг по
 * всему кадру сразу складывает оба источника разброса вместе и может почти
 * не показать ожидаемого снижения шума в 1/√N раз, даже когда сам шум снизился
 * ровно как положено - это артефакт МЕТРИКИ, а не пайплайна (обнаружено на
 * первом же реальном прогоне этого харнесса на синтетических кадрах, см.
 * docs/TESTING_PLAN.md - именно ради таких находок он и запускался). Внутри
 * одной маленькой ячейки градиент фона приблизительно постоянен, поэтому σ
 * внутри неё - в основном именно шум; медиана по ячейкам устойчива и к
 * случайному попаданию звезды в одну из них.
 */
private fun localBackgroundNoise(image: FloatImage, cellSize: Int = 48): Double {
    val luminance = image.luminance()
    val cellSigmas = ArrayList<Double>()
    var y0 = 0
    while (y0 < image.height) {
        val y1 = (y0 + cellSize).coerceAtMost(image.height)
        var x0 = 0
        while (x0 < image.width) {
            val x1 = (x0 + cellSize).coerceAtMost(image.width)
            val values = ArrayList<Double>((x1 - x0) * (y1 - y0))
            for (y in y0 until y1) {
                for (x in x0 until x1) {
                    values.add(luminance[x, y].toDouble())
                }
            }
            if (values.size >= 8) {
                cellSigmas.add(Stats.sigmaClipped(values).stdDev)
            }
            x0 += cellSize
        }
        y0 += cellSize
    }
    if (cellSigmas.isEmpty()) return 0.0
    val sorted = cellSigmas.sorted()
    val n = sorted.size
    return if (n % 2 == 1) sorted[n / 2] else (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
}
