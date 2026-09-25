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
import androidx.compose.material3.HorizontalDivider
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
import com.astrostacker.app.RECOMMENDED_MAX_FRAMES
import com.astrostacker.app.ScreenState

/**
 * Первый экран: серия световых кадров (обязательно) и, по желанию,
 * калибровочные кадры - дарки, биасы, флэты (см. `FrameCalibration` в `:core`).
 * Кнопка "Обработать" закреплена внизу ВНЕ прокручиваемой области.
 */
@Composable
fun FramePickerScreen(
    state: ScreenState.Picking,
    onLightFramesSelected: (List<Uri>) -> Unit,
    onDarkFramesSelected: (List<Uri>) -> Unit,
    onBiasFramesSelected: (List<Uri>) -> Unit,
    onFlatFramesSelected: (List<Uri>) -> Unit,
    onGroundFramesSelected: (List<Uri>) -> Unit,
    onStartProcessing: () -> Unit,
    onDismissError: () -> Unit
) {
    val lightPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) onLightFramesSelected(uris) }

    Column(modifier = Modifier.fillMaxSize()) {
        // weight - на внешнем непрокручиваемом Column, verticalScroll - на
        // вложенном (weight+verticalScroll на одном Column падает при замере).
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
                onClick = { lightPickerLauncher.launch(imageOnlyRequest()) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.picker_select_frames))
            }
            Text(
                stringResource(R.string.picker_selected_count, state.lightFrames.size),
                style = MaterialTheme.typography.bodyMedium
            )
            if (state.lightFrames.size > RECOMMENDED_MAX_FRAMES) {
                Text(
                    stringResource(R.string.picker_too_many_frames, RECOMMENDED_MAX_FRAMES),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            CalibrationPicker(
                title = stringResource(R.string.picker_ground_title),
                hint = stringResource(R.string.picker_ground_hint),
                count = state.groundFrames.size,
                onSelected = onGroundFramesSelected
            )

            Spacer(Modifier.height(4.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Text(stringResource(R.string.picker_calibration_title), style = MaterialTheme.typography.titleMedium)
            Text(
                stringResource(R.string.picker_calibration_intro),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            CalibrationPicker(
                title = stringResource(R.string.picker_darks_title),
                hint = stringResource(R.string.picker_darks_hint),
                count = state.darkFrames.size,
                onSelected = onDarkFramesSelected
            )
            CalibrationPicker(
                title = stringResource(R.string.picker_bias_title),
                hint = stringResource(R.string.picker_bias_hint),
                count = state.biasFrames.size,
                onSelected = onBiasFramesSelected
            )
            CalibrationPicker(
                title = stringResource(R.string.picker_flats_title),
                hint = stringResource(R.string.picker_flats_hint),
                count = state.flatFrames.size,
                onSelected = onFlatFramesSelected
            )
        }

        Column(modifier = Modifier.padding(24.dp)) {
            if (state.lightFrames.size < 2) {
                Text(
                    stringResource(R.string.picker_min_frames_warning),
                    color = MaterialTheme.colorScheme.primary,
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

private fun imageOnlyRequest() = PickVisualMediaRequest(mediaType = ActivityResultContracts.PickVisualMedia.ImageOnly)

@Composable
private fun CalibrationPicker(title: String, hint: String, count: Int, onSelected: (List<Uri>) -> Unit) {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) onSelected(uris) }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(
                    stringResource(R.string.picker_calibration_count, count),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (count > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { launcher.launch(imageOnlyRequest()) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.picker_calibration_select))
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
