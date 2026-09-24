package com.astrostacker.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.R
import com.astrostacker.app.SaveState
import com.astrostacker.app.ScreenState

/**
 * Экран результата. Ползунок/переключатель управляют ЛОКАЛЬНЫМ (черновым)
 * состоянием, пока пользователь не нажмёт "Применить" - пересчёт по каждому
 * движению ползунка сознательно не делается, см. docs/ARCHITECTURE.md §2.2.
 * `remember(state.X)` синхронизирует черновик с реально применённым
 * значением всякий раз, когда оно меняется (после завершения пересчёта), но
 * не мешает свободно двигать ползунок ДО нажатия кнопки.
 */
@Composable
fun ResultScreen(
    state: ScreenState.Result,
    onApply: (stretchTarget: Float, noiseReductionEnabled: Boolean) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    var localStretch by remember(state.stretchTarget) { mutableStateOf(state.stretchTarget) }
    var localNoiseReduction by remember(state.noiseReductionEnabled) { mutableStateOf(state.noiseReductionEnabled) }

    val acceptedCount = state.pipelineResult.frameOutcomes.count { it.accepted }
    val totalCount = state.pipelineResult.frameOutcomes.size
    val hasRejected = acceptedCount < totalCount
    val imageBitmap = remember(state.previewBitmap) { state.previewBitmap.asImageBitmap() }

    Column(modifier = Modifier.fillMaxSize()) {
        // Тот же приём, что и в FramePickerScreen: weight - на внешнем
        // непрокручиваемом Column, verticalScroll - на вложенном (иначе
        // сочетание weight+verticalScroll на одном Column падает при замере).
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.result_title), style = MaterialTheme.typography.headlineSmall)

            Image(
                bitmap = imageBitmap,
                contentDescription = stringResource(R.string.result_title),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(state.previewBitmap.width.toFloat() / state.previewBitmap.height.toFloat())
                    .clip(RoundedCornerShape(12.dp))
            )

            Text(
                stringResource(R.string.result_frames_accepted, acceptedCount, totalCount),
                style = MaterialTheme.typography.bodyMedium
            )
            if (hasRejected) {
                Text(
                    stringResource(R.string.result_frames_rejected_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(stringResource(R.string.result_stretch_label), style = MaterialTheme.typography.titleMedium)
            Slider(
                value = localStretch,
                onValueChange = { localStretch = it },
                valueRange = 0.05f..0.6f,
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(stringResource(R.string.result_noise_reduction_label), style = MaterialTheme.typography.titleMedium)
                Switch(checked = localNoiseReduction, onCheckedChange = { localNoiseReduction = it })
            }

            Button(
                onClick = { onApply(localStretch, localNoiseReduction) },
                enabled = !state.isRecomputing,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.result_apply_button))
            }

            when (state.saveState) {
                SaveState.Success -> Text(
                    stringResource(R.string.result_save_success),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodyMedium
                )
                SaveState.Failed -> Text(
                    stringResource(R.string.result_save_error),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
                else -> Unit
            }
        }

        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onSave,
                enabled = state.saveState != SaveState.Saving,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.result_save_button))
            }
            OutlinedButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.result_start_over))
            }
        }
    }
}
