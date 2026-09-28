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
import androidx.compose.material3.Switch
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
import com.astrostacker.app.PanoScreen
import com.astrostacker.app.PanoramaViewModel
import com.astrostacker.app.R
import com.astrostacker.app.SaveState
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.core.pano.PanoProjection
import com.astrostacker.core.pano.PanoRender
import com.astrostacker.core.pano.PanoStage
import com.astrostacker.app.ui.theme.GlassCard
import com.astrostacker.app.ui.theme.GradientTopBar

/** Вкладка "Панорама": переключает экраны по [PanoScreen]. */
@Composable
fun PanoramaRoot(vm: PanoramaViewModel) {
    val state by vm.state.collectAsState()
    when (val s = state) {
        is PanoScreen.Picking -> PanoPickerScreen(s, vm::updatePhotos, vm::start, vm::dismissError, vm::setPreferredProjection)
        is PanoScreen.Processing -> PanoProcessingScreen(s, vm::cancel)
        is PanoScreen.Result -> PanoResultScreen(
            s, vm::setProjection, vm::setAutoCrop, vm::openEditor, vm::setExportFormat, vm::save, vm::reset
        )
        is PanoScreen.Editing -> EditScreen(
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
private fun PanoPickerScreen(
    state: PanoScreen.Picking,
    onPhotos: (List<Uri>) -> Unit,
    onStart: () -> Unit,
    onDismissError: () -> Unit,
    onProjection: (PanoProjection?) -> Unit
) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) onPhotos(uris)
    }
    val onCameraClick = rememberCameraCapture(currentUris = { state.photos }, onUris = onPhotos)
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GradientTopBar(stringResource(R.string.pano_title))
            Text(stringResource(R.string.pano_instructions), style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(R.string.app_version, com.astrostacker.app.BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

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
            ) { Text(stringResource(R.string.pano_select_photos)) }
            OutlinedButton(onClick = onCameraClick, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.pano_picker_take_photo))
            }
            Text(stringResource(R.string.picker_selected_count, state.photos.size), style = MaterialTheme.typography.bodyMedium)

            GlassCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.pano_projection), style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                        val autoLabel = stringResource(R.string.pano_projection_auto)
                        if (state.preferredProjection == null) Button(onClick = { onProjection(null) }) { Text(autoLabel) }
                        else OutlinedButton(onClick = { onProjection(null) }) { Text(autoLabel) }
                        for (p in PanoProjection.values()) {
                            val label = stringResource(
                                when (p) {
                                    PanoProjection.PLANAR -> R.string.pano_projection_planar
                                    PanoProjection.CYLINDRICAL -> R.string.pano_projection_cylindrical
                                    PanoProjection.SPHERICAL -> R.string.pano_projection_spherical
                                }
                            )
                            if (state.preferredProjection == p) Button(onClick = { onProjection(p) }) { Text(label) }
                            else OutlinedButton(onClick = { onProjection(p) }) { Text(label) }
                        }
                    }
                    Text(
                        stringResource(R.string.pano_projection_picker_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.pano_tips_title), style = MaterialTheme.typography.titleSmall)
                    Text(
                        stringResource(R.string.pano_tips),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        Column(Modifier.padding(24.dp)) {
            if (state.photos.size < 2) {
                Text(
                    stringResource(R.string.pano_min_photos),
                    color = MaterialTheme.colorScheme.tertiary,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Button(onClick = onStart, enabled = state.photos.size >= 2, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.pano_start))
            }
        }
    }
}

private val PANO_STAGES = listOf(PanoStage.LOAD, PanoStage.FEATURES, PanoStage.MATCH, PanoStage.ALIGN, PanoStage.RENDER, PanoStage.DONE)

@Composable
private fun PanoProcessingScreen(state: PanoScreen.Processing, onCancel: () -> Unit) {
    val p = state.progress
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        GradientTopBar(stringResource(R.string.pano_processing_title))
        Spacer(Modifier.height(24.dp))
        Text(
            stringResource(
                when (p.stage) {
                    PanoStage.LOAD -> R.string.pano_stage_load
                    PanoStage.FEATURES -> R.string.pano_stage_features
                    PanoStage.MATCH -> R.string.pano_stage_match
                    PanoStage.ALIGN -> R.string.pano_stage_align
                    PanoStage.RENDER -> R.string.pano_stage_render
                    PanoStage.DONE -> R.string.stage_done
                }
            ),
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(8.dp))
        val within = if (p.total > 0) p.current.toFloat() / p.total else 0f
        LinearProgressIndicator(
            progress = { ((PANO_STAGES.indexOf(p.stage).coerceAtLeast(0) + within) / PANO_STAGES.size).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.processing_step_progress, p.current, p.total), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(32.dp))
        OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.processing_cancel)) }
    }
}

@Composable
private fun PanoResultScreen(
    state: PanoScreen.Result,
    onProjection: (PanoProjection) -> Unit,
    onAutoCrop: (Boolean) -> Unit,
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
            GradientTopBar(stringResource(R.string.pano_result_title))
            Image(
                bitmap = image,
                contentDescription = stringResource(R.string.pano_result_title),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio((bitmap.width.toFloat() / bitmap.height).coerceIn(0.3f, 8f))
                    .clip(RoundedCornerShape(12.dp))
            )
            Text(
                stringResource(R.string.pano_result_info, state.includedCount, state.totalCount, state.horizontalDeg.toInt(), state.verticalDeg.toInt()),
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                stringResource(R.string.pano_result_size, state.outputWidth, state.outputHeight, state.outputWidth.toLong() * state.outputHeight / 1_000_000.0),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (state.includedCount < state.totalCount) {
                Text(
                    stringResource(R.string.pano_result_skipped, state.totalCount - state.includedCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }

            Text(stringResource(R.string.pano_projection), style = MaterialTheme.typography.titleMedium)
            // Плоская/цилиндр математически ломаются на широком угле обзора (тангенс
            // уходит в бесконечность у края) - результат такого выбора не "не идеальная,
            // но узнаваемая" панорама, а размазанное месиво без объяснения причины.
            // Не даём выбрать проекцию, которая заведомо не потянет текущий охват -
            // тот же порог, что и в автовыборе PanoRender.autoProjection.
            val minProjection = PanoRender.autoProjection(state.horizontalDeg, state.verticalDeg)
            val anyDisabled = projectionRank(minProjection) > 0
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                for (p in PanoProjection.values()) {
                    val label = stringResource(
                        when (p) {
                            PanoProjection.PLANAR -> R.string.pano_projection_planar
                            PanoProjection.CYLINDRICAL -> R.string.pano_projection_cylindrical
                            PanoProjection.SPHERICAL -> R.string.pano_projection_spherical
                        }
                    )
                    val usable = projectionRank(p) >= projectionRank(minProjection)
                    if (p == state.projection) Button(onClick = {}, enabled = !state.isRendering) { Text(label) }
                    else OutlinedButton(onClick = { onProjection(p) }, enabled = !state.isRendering && usable) { Text(label) }
                }
            }
            Text(
                stringResource(
                    when {
                        state.isRendering -> R.string.pano_rendering
                        anyDisabled -> R.string.pano_projection_limited
                        else -> R.string.pano_projection_hint
                    }
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.pano_autocrop), style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.pano_autocrop_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(checked = state.autoCropEnabled, onCheckedChange = onAutoCrop, enabled = !state.isRendering)
            }

            OutlinedButton(onClick = onEdit, enabled = !state.isRendering, modifier = Modifier.fillMaxWidth()) {
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
                enabled = state.saveState != SaveState.Saving && !state.isRendering,
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

/** "Сила" проекции по охвату, который она способна представить без вырождения (см. PanoRender.autoProjection). */
private fun projectionRank(p: PanoProjection): Int = when (p) {
    PanoProjection.PLANAR -> 0
    PanoProjection.CYLINDRICAL -> 1
    PanoProjection.SPHERICAL -> 2
}
