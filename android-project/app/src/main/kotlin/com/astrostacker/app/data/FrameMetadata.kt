package com.astrostacker.app.data

import android.content.Context
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

/** EXIF одного исходного кадра - см. [ImageDecoding.readFrameExif]. Все поля необязательны. */
data class FrameExif(
    val epochSeconds: Double? = null,
    val cameraMake: String? = null,
    val cameraModel: String? = null,
    val iso: Int? = null,
    val exposureSeconds: Double? = null,
    val latitude: Double? = null,
    val longitude: Double? = null
)

/**
 * Сводка EXIF по всей серии кадров - для экрана "Инфо" на вкладке
 * "Звёздные треки" и для записи в EXIF сохранённого результата (см.
 * [ExifWriter]). Камера/координаты берутся из первого кадра, где они есть
 * (предполагается одна и та же камера/штатив на протяжении всей серии).
 */
data class TrailExifSummary(
    val frameCount: Int,
    val cameraMake: String?,
    val cameraModel: String?,
    val isoMin: Int?,
    val isoMax: Int?,
    /** Сумма выдержек ВСЕХ кадров серии - "суммарная экспозиция" трека (как в референсном приложении). */
    val totalExposureSeconds: Double,
    val framesWithKnownExposure: Int,
    val latitude: Double?,
    val longitude: Double?,
    val firstEpochSeconds: Double?,
    val lastEpochSeconds: Double?
) {
    val hasLocation: Boolean get() = latitude != null && longitude != null
}

fun summarizeTrailExif(frames: List<FrameExif>): TrailExifSummary {
    val isos = frames.mapNotNull { it.iso }
    val exposures = frames.mapNotNull { it.exposureSeconds }
    val epochs = frames.mapNotNull { it.epochSeconds }.sorted()
    val location = frames.firstOrNull { it.latitude != null && it.longitude != null }
    return TrailExifSummary(
        frameCount = frames.size,
        cameraMake = frames.firstNotNullOfOrNull { it.cameraMake },
        cameraModel = frames.firstNotNullOfOrNull { it.cameraModel },
        isoMin = isos.minOrNull(),
        isoMax = isos.maxOrNull(),
        totalExposureSeconds = exposures.sum(),
        framesWithKnownExposure = exposures.size,
        latitude = location?.latitude,
        longitude = location?.longitude,
        firstEpochSeconds = epochs.firstOrNull(),
        lastEpochSeconds = epochs.lastOrNull()
    )
}

/**
 * Пишет сводку по серии в EXIF УЖЕ сохранённого файла (см. `ExportRepository.save`,
 * которое отдаёт `Uri` результата). Только JPEG и PNG: `androidx.exifinterface`
 * умеет писать EXIF именно в эти два формата (и WebP) - у TIFF своя, ручная
 * реализация в `:core` (`TiffWriter`), в него отдельный EXIF не встраивается.
 * Ошибки здесь не фатальны: сам файл к этому моменту уже сохранён, потеря
 * необязательных метаданных не должна выглядеть как "не удалось сохранить".
 */
object ExifWriter {

    fun writeTrailSummary(context: Context, uri: Uri, format: ExportFormat, summary: TrailExifSummary) {
        if (format != ExportFormat.JPEG && format != ExportFormat.PNG) return
        try {
            context.contentResolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val exif = ExifInterface(pfd.fileDescriptor)
                summary.cameraMake?.let { exif.setAttribute(ExifInterface.TAG_MAKE, it) }
                summary.cameraModel?.let { exif.setAttribute(ExifInterface.TAG_MODEL, it) }
                summary.isoMax?.let { exif.setAttribute(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY, it.toString()) }
                if (summary.totalExposureSeconds > 0) {
                    // Рациональная дробь с точностью до миллисекунды - однозначный формат для любого EXIF-ридера.
                    val millis = (summary.totalExposureSeconds * 1000).roundToLong().coerceAtLeast(1)
                    exif.setAttribute(ExifInterface.TAG_EXPOSURE_TIME, "$millis/1000")
                }
                summary.lastEpochSeconds?.let { epoch ->
                    val format2 = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
                    val stamp = format2.format(java.util.Date((epoch * 1000).toLong()))
                    exif.setAttribute(ExifInterface.TAG_DATETIME, stamp)
                    exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, stamp)
                }
                if (summary.hasLocation) exif.setLatLong(summary.latitude!!, summary.longitude!!)
                exif.saveAttributes()
            }
        } catch (e: Exception) {
            // Необязательные метаданные - файл всё равно сохранён, молча пропускаем.
        }
    }
}
