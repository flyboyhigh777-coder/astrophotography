package com.astrostacker.app.data

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.astrostacker.core.Rgb16Image
import com.astrostacker.core.TiffWriter
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Формат сохранения результата. */
enum class ExportFormat(val extension: String, val mimeType: String) {
    /** 16 бит на канал, без сжатия — максимум данных для дальнейшей обработки (Photoshop, Lightroom, PixInsight). */
    TIFF16("tif", "image/tiff"),
    /** 8 бит на канал, сжатие без потерь. */
    PNG("png", "image/png"),
    /** 8 бит, качество 100 — файл в разы меньше, открывается везде. */
    JPEG("jpg", "image/jpeg")
}

/**
 * Сохранение результата в `Pictures/AstroStacker` через `MediaStore`.
 *
 * На Android 10+ (API 29, Scoped Storage) запись в MediaStore не требует
 * разрешений - используется паттерн `IS_PENDING`. На Android 9 (API 28,
 * наш `minSdk`) нужен `WRITE_EXTERNAL_STORAGE` (объявлен в манифесте с
 * `maxSdkVersion="28"`).
 *
 * TIFF: если коллекция изображений откажется принять `image/tiff` (зависит
 * от прошивки), файл кладётся в `Download/AstroStacker`.
 */
object ExportRepository {

    private const val RELATIVE_DIR = "AstroStacker"
    private const val JPEG_QUALITY = 100

    fun save(context: Context, image: Rgb16Image, format: ExportFormat, namePrefix: String = "astrostacker"): Boolean {
        val displayName = namePrefix + "_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "." + format.extension
        val writer: (OutputStream) -> Unit = when (format) {
            ExportFormat.TIFF16 -> { out -> TiffWriter.write(out, image) }
            ExportFormat.PNG -> { out -> compress(image, Bitmap.CompressFormat.PNG, 100, out) }
            ExportFormat.JPEG -> { out -> compress(image, Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out) }
        }
        if (saveTo(context, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_PICTURES, displayName, format.mimeType, writer)) {
            return true
        }
        if (format == ExportFormat.TIFF16 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return saveTo(context, MediaStore.Downloads.EXTERNAL_CONTENT_URI, Environment.DIRECTORY_DOWNLOADS, displayName, format.mimeType, writer)
        }
        return false
    }

    private fun compress(image: Rgb16Image, format: Bitmap.CompressFormat, quality: Int, out: OutputStream) {
        val bitmap = Bitmap.createBitmap(image.toArgb8(), image.width, image.height, Bitmap.Config.ARGB_8888)
        try {
            check(bitmap.compress(format, quality, out)) { "Bitmap.compress вернул false" }
        } finally {
            bitmap.recycle()
        }
    }

    private fun saveTo(
        context: Context,
        collection: Uri,
        directory: String,
        displayName: String,
        mimeType: String,
        writer: (OutputStream) -> Unit
    ): Boolean {
        val resolver = context.contentResolver
        val scoped = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            if (scoped) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$directory/$RELATIVE_DIR")
                // Пока файл не дописан - IS_PENDING=1: другие приложения его не видят.
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }
        val uri = try {
            resolver.insert(collection, values)
        } catch (e: Exception) {
            null
        } ?: return false

        val wrote = try {
            resolver.openOutputStream(uri)?.use { writer(it); true } ?: false
        } catch (e: Exception) {
            false
        }
        if (!wrote) {
            // Не оставляем "призрачную" недописанную запись.
            resolver.delete(uri, null, null)
            return false
        }
        if (scoped) {
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        }
        return true
    }
}
