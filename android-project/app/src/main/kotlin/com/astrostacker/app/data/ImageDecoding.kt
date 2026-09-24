package com.astrostacker.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import com.astrostacker.core.ColorSpace
import com.astrostacker.core.FloatImage
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * [image] равен null, если файл не удалось декодировать вовсе (не
 * фотография / повреждён / неподдерживаемый RAW) - вызывающая сторона обязана
 * явно сообщить об этом пользователю с именем файла ([displayName]), а не
 * тихо пропустить кадр (иначе пользователь получит непонятно откуда взявшийся
 * неполный стек без объяснений).
 */
data class DecodedFrame(
    val image: FloatImage?,
    val captureEpochSeconds: Double?,
    val displayName: String
)

/**
 * Зарезервированный интерфейс для будущего настоящего байеровского demosaic
 * (LibRaw/NDK, см. docs/LITERATURE.md §7 и docs/ARCHITECTURE.md §7) - в v1
 * НЕ реализован и нигде не вызывается; отмечает точку расширения, о которой
 * уже сейчас известно, что она понадобится не-Linear RAW.
 */
interface RawDecoder {
    fun decode(context: Context, uri: Uri): FloatImage?
}

/**
 * Декодирование выбранных пользователем изображений (`content://` Uri из
 * системного Photo Picker) в [FloatImage] и обратно, с учётом бюджета памяти
 * ([MemoryBudget]) и перевода sRGB<->линейное (см. `ColorSpace` в `:core` -
 * без этого шага пайплайн статистически некорректен, см. комментарий к
 * `ColorSpace` и docs/ARCHITECTURE.md §2.1/§2.2).
 */
object ImageDecoding {

    fun decodeFrame(context: Context, uri: Uri, maxTotalPixels: Long): DecodedFrame {
        val displayName = queryDisplayName(context, uri)
        val bitmap = decodeBitmap(context, uri, maxTotalPixels)
        val image = if (bitmap != null) {
            try {
                bitmapToFloatImage(bitmap)
            } finally {
                // Освобождаем нативную память Bitmap сразу, не дожидаясь GC -
                // при декодировании 15-20 кадров подряд это заметно снижает
                // пиковое потребление памяти (см. MemoryBudget.kt).
                bitmap.recycle()
            }
        } else {
            null
        }
        val captureEpochSeconds = readCaptureEpochSeconds(context, uri)
        return DecodedFrame(image, captureEpochSeconds, displayName)
    }

    /** Линейный [FloatImage] -> `Bitmap` для превью на экране и последующего сохранения. */
    fun floatImageToBitmap(image: FloatImage): Bitmap {
        val pixels = IntArray(image.width * image.height)
        for (i in pixels.indices) {
            val r = to8Bit(ColorSpace.linearToSrgb(image.r[i]))
            val g = to8Bit(ColorSpace.linearToSrgb(image.g[i]))
            val b = to8Bit(ColorSpace.linearToSrgb(image.b[i]))
            pixels[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        return Bitmap.createBitmap(pixels, image.width, image.height, Bitmap.Config.ARGB_8888)
    }

    private fun to8Bit(value: Float): Int = (value * 255f + 0.5f).toInt().coerceIn(0, 255)

    private fun decodeBitmap(context: Context, uri: Uri, maxTotalPixels: Long): Bitmap? {
        return try {
            val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, boundsOptions)
            }
            if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) return null

            val sampleSize = calculateInSampleSize(boundsOptions.outWidth, boundsOptions.outHeight, maxTotalPixels)
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOptions)
            }
        } catch (e: Exception) {
            // Файл повреждён / не изображение / нет доступа к Uri (грант
            // истёк) - для вызывающей стороны это неотличимо от "не удалось
            // декодировать", возвращаем null и даём ей явно сообщить об ошибке.
            null
        }
    }

    /** Степень двойки, при которой (width/n)*(height/n) не превышает бюджет - совместимо с тем, что понимает `BitmapFactory.Options.inSampleSize`. */
    private fun calculateInSampleSize(width: Int, height: Int, maxTotalPixels: Long): Int {
        var inSampleSize = 1
        while ((width / inSampleSize).toLong() * (height / inSampleSize).toLong() > maxTotalPixels) {
            inSampleSize *= 2
        }
        return inSampleSize
    }

    private fun bitmapToFloatImage(bitmap: Bitmap): FloatImage {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val r = FloatArray(width * height)
        val g = FloatArray(width * height)
        val b = FloatArray(width * height)
        for (i in pixels.indices) {
            val p = pixels[i]
            // getPixels() всегда отдаёт канонический формат 0xAARRGGBB
            // независимо от внутреннего Config исходного Bitmap (см. документацию Bitmap.getPixels).
            r[i] = ColorSpace.srgbByteToLinear((p shr 16) and 0xFF)
            g[i] = ColorSpace.srgbByteToLinear((p shr 8) and 0xFF)
            b[i] = ColorSpace.srgbByteToLinear(p and 0xFF)
        }
        return FloatImage(width, height, r, g, b)
    }

    private fun queryDisplayName(context: Context, uri: Uri): String {
        return try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
            } ?: uri.lastPathSegment ?: uri.toString()
        } catch (e: Exception) {
            uri.lastPathSegment ?: uri.toString()
        }
    }

    /**
     * EXIF `DateTimeOriginal` ("yyyy:MM:dd HH:mm:ss", без часового пояса по
     * стандарту EXIF 2.x) + `SubSecTimeOriginal`, если есть. Часовой пояс
     * парсинга (UTC) выбран ФИКСИРОВАННЫМ и не влияет на корректность: важна
     * только РАЗНИЦА между кадрами одной серии (см. `EarthRotationModel` в
     * `:core`), а не абсолютное время; фиксация на UTC (вместо часового пояса
     * устройства) просто исключает случайную зависимость от перехода на
     * летнее/зимнее время ровно в момент съёмки.
     */
    private fun readCaptureEpochSeconds(context: Context, uri: Uri): Double? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                val exif = ExifInterface(stream)
                val dateStr = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
                    ?: exif.getAttribute(ExifInterface.TAG_DATETIME)
                val subSec = exif.getAttribute(ExifInterface.TAG_SUBSEC_TIME_ORIGINAL)
                    ?: exif.getAttribute(ExifInterface.TAG_SUBSEC_TIME)
                dateStr?.let { parseExifDateTime(it, subSec) }
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun parseExifDateTime(dateStr: String, subSec: String?): Double? {
        return try {
            val format = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
            format.timeZone = TimeZone.getTimeZone("UTC")
            val parsed = format.parse(dateStr) ?: return null
            parsed.time / 1000.0 + fractionalSeconds(subSec)
        } catch (e: Exception) {
            null
        }
    }

    /** EXIF SubSecTime - строка цифр ПОСЛЕ десятичной точки ("5"=0.5с, "050"=0.05с), а не числитель какой-то дроби. */
    private fun fractionalSeconds(subSec: String?): Double {
        val digits = subSec?.trim().orEmpty()
        if (digits.isEmpty()) return 0.0
        val value = digits.toDoubleOrNull() ?: return 0.0
        return value / Math.pow(10.0, digits.length.toDouble())
    }
}
