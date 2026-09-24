package com.astrostacker.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.ErrorMessage
import com.astrostacker.app.R
import com.astrostacker.app.ScreenState

/**
 * Первый экран: выбор серии световых кадров (обязательно) и, опционально,
 * тёмных кадров для калибровки горячих пикселей (см. `DarkFrameCalibrator` в
 * `:core`). Кнопка "Обработать" внизу закреплена ВНЕ прокручиваемой области -
 * см. комментарий у [Modifier.weight] ниже.
 */
@Composable
fun FramePickerScreen(
    state: ScreenState.Picking,
    onLightFramesSelected: (List<Uri>) -> Unit,
    onDarkFramesSelected: (List<Uri>) -> Unit,
    onStartProcessing: () -> Unit,
    onDismissError: () -> Unit
) {
    val lightPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) onLightFramesSelected(uris) }

    val darkPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) onDarkFramesSelected(uris) }

    val imageOnlyRequest = PickVisualMediaRequest(mediaType = ActivityResultContracts.PickVisualMedia.ImageOnly)

    Column(modifier = Modifier.fillMaxSize()) {
        // Прокручиваемая часть - весь контент, кроме финальной кнопки. ВАЖНО:
        // Modifier.weight() нельзя вешать на сам прокручиваемый Column (в паре
        // с .verticalScroll() он получает неограниченную высоту при замере, и
        // weight внутри нЕ работает/падает) - поэтому weight здесь, на ВНЕШНЕМ,
        // непрокручиваемом Column, а .verticalScroll - только на вложенном.
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.picker_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.picker_instructions), style = MaterialTheme.typography.bodyMedium)

            state.previousError?.let { error -> ErrorBanner(error = error, onDismiss = onDismissError) }

            Button(
                onClick = { lightPickerLauncher.launch(imageOnlyRequest) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.picker_select_frames))
            }
            Text(
                stringResource(R.string.picker_selected_count, state.lightFrames.size),
                style = MaterialTheme.typography.bodyMedium
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(stringResource(R.string.picker_select_dark_frames), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.picker_dark_frames_hint), style = MaterialTheme.typography.bodySmall)
            OutlinedButton(
                onClick = { darkPickerLauncher.launch(imageOnlyRequest) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.picker_select_dark_frames))
            }
            Text(
                stringResource(R.string.picker_dark_selected_count, state.darkFrames.size),
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Column(modifier = Modifier.padding(24.dp)) {
            if (state.lightFrames.size < 2) {
                Text(
                    stringResource(R.string.picker_min_frames_warning),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Button(
                onClick = onStartProcessing,
                enabled = state.lightFrames.size >= 2,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.picker_start_button))
            }
        }
    }
}

@Composable
private fun ErrorBanner(error: ErrorMessage, onDismiss: () -> Unit) {
    val message = when (error) {
        is ErrorMessage.Generic -> stringResource(R.string.error_generic, error.detail)
        is ErrorMessage.DecodeFailed -> stringResource(R.string.error_decode_failed, error.fileName)
        ErrorMessage.TooFewFrames -> stringResource(R.string.error_too_few_frames)
    }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                message,
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(onClick = onDismiss) {
                Text("OK", color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
    }
}
