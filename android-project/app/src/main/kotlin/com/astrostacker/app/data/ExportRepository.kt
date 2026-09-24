package com.astrostacker.app.data

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Сохранение результата в галерею через `MediaStore`. Формат - PNG (без
 * потерь, 8 бит/канал - предел `Bitmap.compress(PNG,...)` в публичном Android
 * API, см. docs/ARCHITECTURE.md §2.2).
 *
 * На Android 10+ (API 29, Scoped Storage) запись в MediaStore не требует
 * разрешений на хранилище вовсе - используется паттерн `IS_PENDING`
 * (см. `saveScoped`). На Android 9 (API 28, наш `minSdk`) хранилище ещё не
 * "scoped" на уровне ОС независимо от того, что объявляет приложение, поэтому
 * нужен `WRITE_EXTERNAL_STORAGE` (объявлен в манифесте с
 * `maxSdkVersion="28"` - см. `AndroidManifest.xml`, тот же приём, что уже
 * применён там для `READ_EXTERNAL_STORAGE`).
 */
object ExportRepository {

    private const val MIME_TYPE = "image/png"
    private const val RELATIVE_DIR = "AstroStacker"

    fun saveToGallery(context: Context, bitmap: Bitmap): Boolean {
        val displayName = "astrostacker_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".png"
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveScoped(context, bitmap, displayName)
        } else {
            saveLegacy(context, bitmap, displayName)
        }
    }

    private fun saveScoped(context: Context, bitmap: Bitmap, displayName: String): Boolean {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, MIME_TYPE)
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + RELATIVE_DIR)
            // Пока файл не дописан - IS_PENDING=1: приложения-читатели (в том
            // числе сама Галерея) не должны видеть недописанный PNG.
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
        val wrote = writePng(resolver, uri, bitmap)
        if (!wrote) {
            // Не оставляем "призрачную" вечно-pending запись при ошибке записи.
            resolver.delete(uri, null, null)
            return false
        }
        val doneValues = ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }
        resolver.update(uri, doneValues, null, null)
        return true
    }

    private fun saveLegacy(context: Context, bitmap: Bitmap, displayName: String): Boolean {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, MIME_TYPE)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
        val wrote = writePng(resolver, uri, bitmap)
        if (!wrote) resolver.delete(uri, null, null)
        return wrote
    }

    private fun writePng(resolver: ContentResolver, uri: Uri, bitmap: Bitmap): Boolean {
        return try {
            resolver.openOutputStream(uri)?.use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) } ?: false
        } catch (e: Exception) {
            false
        }
    }
}
