package com.astrostacker.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.HdrScreen
import com.astrostacker.app.HdrStage
import com.astrostacker.app.HdrViewModel
import com.astrostacker.app.R
import com.astrostacker.app.SaveState
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.ui.theme.GradientTopBar

/** Вкладка "HDR": переключает экраны по [HdrScreen]. */
@Composable
fun HdrRoot(vm: HdrViewModel) {
    val state by vm.state.collectAsState()
    when (val s = state) {
        is HdrScreen.Picking -> HdrPickerScreen(s, vm::updatePhotos, vm::start, vm::dismissError)
        is HdrScreen.Processing -> HdrProcessingScreen(s, vm::cancel)
        is HdrScreen.Result -> HdrResultScreen(s, vm::openEditor, vm::setExportFormat, vm::save, vm::reset)
        is HdrScreen.Editing -> EditScreen(
            state = s.editor,
            onRotateQuarter = vm::editorRotateQuarter,
            onStraighten = vm::editorStraighten,
            onCropChange = vm::editorSetCrop,
            onAspect = vm::editorSetAspect,
            onReset = vm::editorReset,
            onCancel = vm::editorCancel,
            onApply = vm::editorApply
        )
    }
}

@Composable
private fun HdrPickerScreen(
    state: HdrScreen.Picking,
    onPhotos: (List<Uri>) -> Unit,
    onStart: () -> Unit,
    onDismissError: () -> Unit
) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) onPhotos(uris)
    }
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GradientTopBar(stringResource(R.string.hdr_title))
            Text(stringResource(R.string.hdr_instructions), style = MaterialTheme.typography.bodyMedium)

            state.error?.let { error ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.error_generic, error),
                            modifier = Modifier.weight(1f),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        TextButton(onClick = onDismissError) { Text("OK", color = MaterialTheme.colorScheme.onErrorContainer) }
                    }
                }
            }

            Button(
                onClick = { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.hdr_select_photos)) }
            Text(stringResource(R.string.picker_selected_count, state.photos.size), style = MaterialTheme.typography.bodyMedium)

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.hdr_tips_title), style = MaterialTheme.typography.titleSmall)
                    Text(
                        stringResource(R.string.hdr_tips),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        Column(Modifier.padding(24.dp)) {
            if (state.photos.size < 2) {
                Text(
                    stringResource(R.string.hdr_min_photos),
                    color = MaterialTheme.colorScheme.tertiary,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Button(onClick = onStart, enabled = state.photos.size >= 2, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.hdr_start))
            }
        }
    }
}

private val HDR_STAGES = listOf(HdrStage.LOAD, HdrStage.FEATURES, HdrStage.ALIGN, HdrStage.FUSE, HdrStage.DONE)

@Composable
private fun HdrProcessingScreen(state: HdrScreen.Processing, onCancel: () -> Unit) {
    val p = state.progress
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        GradientTopBar(stringResource(R.string.hdr_processing_title))
        Spacer(Modifier.height(24.dp))
        Text(
            stringResource(
                when (p.stage) {
                    HdrStage.LOAD -> R.string.hdr_stage_load
                    HdrStage.FEATURES -> R.string.hdr_stage_features
                    HdrStage.ALIGN -> R.string.hdr_stage_align
                    HdrStage.FUSE -> R.string.hdr_stage_fuse
                    HdrStage.DONE -> R.string.stage_done
                }
            ),
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(8.dp))
        val within = if (p.total > 0) p.current.toFloat() / p.total else 0f
        LinearProgressIndicator(
            progress = { ((HDR_STAGES.indexOf(p.stage).coerceAtLeast(0) + within) / HDR_STAGES.size).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.processing_step_progress, p.current, p.total), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(32.dp))
        OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.processing_cancel)) }
    }
}

@Composable
private fun HdrResultScreen(
    state: HdrScreen.Result,
    onEdit: () -> Unit,
    onFormat: (ExportFormat) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    val bitmap = state.previewBitmap
    val image = remember(bitmap) { bitmap.asImageBitmap() }
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GradientTopBar(stringResource(R.string.hdr_result_title))
            Image(
                bitmap = image,
                contentDescription = stringResource(R.string.hdr_result_title),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(bitmap.width.toFloat() / bitmap.height)
                    .clip(RoundedCornerShape(12.dp))
            )
            Text(
                stringResource(R.string.hdr_result_info, state.acceptedCount, state.totalCount),
                style = MaterialTheme.typography.bodyMedium
            )
            if (state.acceptedCount < state.totalCount) {
                Text(
                    stringResource(R.string.hdr_result_skipped, state.totalCount - state.acceptedCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }

            OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.result_edit_button))
            }

            Text(stringResource(R.string.result_format_label), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                for (format in ExportFormat.values()) {
                    val label = formatLabel(format)
                    if (format == state.exportFormat) Button(onClick = { onFormat(format) }) { Text(label) }
                    else OutlinedButton(onClick = { onFormat(format) }) { Text(label) }
                }
            }
            Text(
                stringResource(
                    when (state.exportFormat) {
                        ExportFormat.TIFF16 -> R.string.result_format_tiff_hint
                        ExportFormat.PNG -> R.string.result_format_png_hint
                        ExportFormat.JPEG -> R.string.result_format_jpeg_hint
                    }
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            when (state.saveState) {
                SaveState.Success -> Text(stringResource(R.string.result_save_success), color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodyMedium)
                SaveState.Failed -> Text(stringResource(R.string.result_save_error), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                else -> Unit
            }
        }
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onSave,
                enabled = state.saveState != SaveState.Saving,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (state.saveState == SaveState.Saving) stringResource(R.string.result_saving)
                    else stringResource(R.string.result_save_button, formatLabel(state.exportFormat))
                )
            }
            OutlinedButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.result_start_over)) }
        }
    }
}
