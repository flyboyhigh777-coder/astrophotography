package com.astrostacker.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import com.astrostacker.app.R
import java.io.File

/** Новый файл для снимка камерой в cacheDir/camera_frames/ и его content:// Uri (см. res/xml/file_paths.xml). */
internal fun newCameraFrameUri(context: Context): Uri {
    val dir = File(context.cacheDir, "camera_frames").apply { mkdirs() }
    val file = File(dir, "shot_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

/**
 * Кнопка "Снять камерой" - общая для вкладок "Панорама" и "Звёздные треки":
 * системное приложение камеры (`ActivityResultContracts.TakePicture()`, без
 * своего экрана камеры и без разрешения CAMERA - см. комментарий в
 * `PanoramaScreens.kt`) пишет кадр в Uri от FileProvider, и он ДОБАВЛЯЕТСЯ к
 * уже накопленным [currentUris] (в отличие от выбора из галереи, который
 * заменяет список целиком). Возвращает обработчик для `onClick` кнопки.
 */
@Composable
fun rememberCameraCapture(currentUris: () -> List<Uri>, onUris: (List<Uri>) -> Unit): () -> Unit {
    val context = LocalContext.current
    val currentUrisState by rememberUpdatedState(currentUris)
    val onUrisState by rememberUpdatedState(onUris)
    // Uri ждущего снимка переживает пересоздание Activity (rememberSaveable).
    var pendingUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val uri = pendingUri
        pendingUri = null
        if (success && uri != null) onUrisState(currentUrisState() + uri)
    }
    return {
        val uri = newCameraFrameUri(context)
        pendingUri = uri
        try {
            launcher.launch(uri)
        } catch (e: ActivityNotFoundException) {
            pendingUri = null
            Toast.makeText(context, R.string.pano_picker_no_camera, Toast.LENGTH_SHORT).show()
        }
    }
}
