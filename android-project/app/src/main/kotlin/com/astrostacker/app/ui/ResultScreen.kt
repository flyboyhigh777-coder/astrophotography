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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
 * Экран результата: итоговый снимок без какой-либо постобработки, переключатель
 * "земля из первого кадра" (мгновенно, оба варианта уже посчитаны) и сохранение
 * в галерею того варианта, который сейчас на экране.
 */
@Composable
fun ResultScreen(
    state: ScreenState.Result,
    onFreezeGroundChanged: (Boolean) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    val acceptedCount = state.frameOutcomes.count { it.accepted }
    val totalCount = state.frameOutcomes.size
    val hasRejected = acceptedCount < totalCount
    val shown = state.shownBitmap
    val imageBitmap = remember(shown) { shown.asImageBitmap() }

    Column(modifier = Modifier.fillMaxSize()) {
        // weight - на внешнем непрокручиваемом Column, verticalScroll - на
        // вложенном (сочетание weight+verticalScroll на одном Column падает при замере).
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
                    .aspectRatio(shown.width.toFloat() / shown.height.toFloat())
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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.result_freeze_ground_label), style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.result_freeze_ground_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(checked = state.freezeGround, onCheckedChange = onFreezeGroundChanged)
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
