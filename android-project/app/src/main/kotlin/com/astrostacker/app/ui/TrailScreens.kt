package com.astrostacker.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.astrostacker.app.R
import com.astrostacker.app.SaveState
import com.astrostacker.app.StarTrailViewModel
import com.astrostacker.app.TrailScreen
import com.astrostacker.app.TrailStage
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.data.TrailExifSummary
import com.astrostacker.core.StackingOrder
import com.astrostacker.core.StarTrailConfig
import com.astrostacker.core.TrailStyle
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Вкладка "Звёздные треки": переключает экраны по [TrailScreen]. */
@Composable
fun TrailRoot(vm: StarTrailViewModel) {
    val state by vm.state.collectAsState()
    when (val s = state) {
        is TrailScreen.Picking -> TrailPickerScreen(s, vm)
        is TrailScreen.Processing -> TrailProcessingScreen(s, vm::cancel)
        is TrailScreen.Result -> TrailResultScreenRoot(s, vm)
        is TrailScreen.Editing -> EditScreen(
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

// ---------- Выбор кадров ----------

@Composable
private fun TrailPickerScreen(state: TrailScreen.Picking, vm: StarTrailViewModel) {
    var showOptions by remember { mutableStateOf(false) }
    if (showOptions) {
        TrailOptionsScreen(initial = state.config, onApply = { vm.updateConfig(it); showOptions = false }, onCancel = { showOptions = false })
        return
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) vm.updatePhotos(uris)
    }
    val onCameraClick = rememberCameraCapture(currentUris = { state.photos }, onUris = vm::updatePhotos)

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.trail_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.trail_instructions), style = MaterialTheme.typography.bodyMedium)
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
                        TextButton(onClick = vm::dismissError) { Text("OK", color = MaterialTheme.colorScheme.onErrorContainer) }
                    }
                }
            }

            Button(
                onClick = { galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.trail_select_photos)) }
            OutlinedButton(onClick = onCameraClick, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.trail_take_photo))
            }
            Text(stringResource(R.string.picker_selected_count, state.photos.size), style = MaterialTheme.typography.bodyMedium)

            OutlinedButton(onClick = { showOptions = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.trail_options_button) + ": " + trailStyleLabel(state.config.style))
            }
        }
        Column(modifier = Modifier.padding(24.dp)) {
            if (state.photos.size < 2) {
                Text(
                    stringResource(R.string.trail_min_photos),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Button(onClick = vm::start, enabled = state.photos.size >= 2, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.trail_start))
            }
        }
    }
}

// ---------- Обработка ----------

private val TRAIL_STAGES = listOf(TrailStage.LOAD, TrailStage.COMBINE, TrailStage.DONE)

@Composable
private fun TrailProcessingScreen(state: TrailScreen.Processing, onCancel: () -> Unit) {
    val p = state.progress
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.trail_processing_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(24.dp))
        Text(
            stringResource(if (p.stage == TrailStage.LOAD) R.string.trail_stage_load else R.string.trail_stage_combine),
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(8.dp))
        val within = if (p.total > 0) p.current.toFloat() / p.total else 0f
        LinearProgressIndicator(
            progress = { ((TRAIL_STAGES.indexOf(p.stage).coerceAtLeast(0) + within) / TRAIL_STAGES.size).coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.processing_step_progress, p.current, p.total), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(32.dp))
        OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.processing_cancel)) }
    }
}

// ---------- Результат ----------

@Composable
private fun TrailResultScreenRoot(state: TrailScreen.Result, vm: StarTrailViewModel) {
    var showOptions by remember { mutableStateOf(false) }
    var showInfo by remember { mutableStateOf(false) }
    if (showOptions) {
        TrailOptionsScreen(initial = state.config, onApply = { vm.reprocess(it); showOptions = false }, onCancel = { showOptions = false })
        return
    }
    if (showInfo) {
        TrailInfoScreen(state, onClose = { showInfo = false })
        return
    }
    TrailResultScreen(
        state = state,
        onOpenOptions = { showOptions = true },
        onOpenInfo = { showInfo = true },
        onAddPhotos = vm::appendPhotosAndReprocess,
        onEdit = vm::openEditor,
        onFormat = vm::setExportFormat,
        onSave = vm::save,
        onReset = vm::reset
    )
}

@Composable
private fun TrailResultScreen(
    state: TrailScreen.Result,
    onOpenOptions: () -> Unit,
    onOpenInfo: () -> Unit,
    onAddPhotos: (List<Uri>) -> Unit,
    onEdit: () -> Unit,
    onFormat: (ExportFormat) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    val bitmap = state.previewBitmap
    val image = remember(bitmap) { bitmap.asImageBitmap() }
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (uris.isNotEmpty()) onAddPhotos(uris)
    }
    // currentUris={emptyList} - каждый снимок камерой отдаётся отдельным добавлением, а не заменой списка.
    val onCameraAdd = rememberCameraCapture(currentUris = { emptyList() }, onUris = onAddPhotos)

    Column(modifier = Modifier.fillMaxSize()) {
        // Верхняя панель значков - как в референсном приложении: добавить кадры
        // (из галереи и камерой), настройки трека, поделиться (прокрутка к
        // сохранению) и инфо о снимке.
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TrailIconButton(
                R.string.trail_add_photos,
                onClick = { galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            ) { AddPhotoIcon() }
            TrailIconButton(R.string.trail_take_photo, onClick = onCameraAdd) { CameraIcon() }
            TrailIconButton(R.string.trail_options_button, onClick = onOpenOptions) { OptionsIcon() }
            TrailIconButton(R.string.trail_share_button, onClick = { scope.launch { scrollState.animateScrollTo(scrollState.maxValue) } }) { ShareIcon() }
            TrailIconButton(R.string.trail_info_button, onClick = onOpenInfo) { InfoIcon() }
        }

        Column(
            modifier = Modifier.weight(1f).verticalScroll(scrollState).padding(horizontal = 24.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.trail_result_title), style = MaterialTheme.typography.headlineSmall)
            Image(
                bitmap = image,
                contentDescription = stringResource(R.string.trail_result_title),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio((bitmap.width.toFloat() / bitmap.height).coerceIn(0.3f, 8f))
                    .clip(RoundedCornerShape(12.dp))
            )
            Text(stringResource(R.string.trail_result_info, state.framesUsed, state.framesTotal), style = MaterialTheme.typography.bodyMedium)
            if (state.framesUsed < state.framesTotal) {
                Text(
                    stringResource(R.string.trail_result_skipped, state.framesTotal - state.framesUsed),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                stringResource(R.string.trail_options_button) + ": " + trailStyleLabel(state.config.style),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            OutlinedButton(onClick = onEdit, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.result_edit_button)) }

            Text(stringResource(R.string.result_format_label), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                for (format in ExportFormat.values()) {
                    val label = formatLabel(format)
                    if (format == state.exportFormat) Button(onClick = { onFormat(format) }) { Text(label) }
                    else OutlinedButton(onClick = { onFormat(format) }) { Text(label) }
                }
            }
            when (state.saveState) {
                SaveState.Success -> Text(stringResource(R.string.result_save_success), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
                SaveState.Failed -> Text(stringResource(R.string.result_save_error), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                else -> Unit
            }
        }
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onSave, enabled = state.saveState != SaveState.Saving, modifier = Modifier.fillMaxWidth()) {
                Text(
                    if (state.saveState == SaveState.Saving) stringResource(R.string.result_saving)
                    else stringResource(R.string.result_save_button, formatLabel(state.exportFormat))
                )
            }
            OutlinedButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.result_start_over)) }
        }
    }
}

// ---------- Настройки трека ----------

@Composable
private fun TrailOptionsScreen(initial: StarTrailConfig, onApply: (StarTrailConfig) -> Unit, onCancel: () -> Unit) {
    var draft by remember(initial) { mutableStateOf(initial) }
    BackHandler(onBack = onCancel)

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text(stringResource(R.string.trail_options_title), style = MaterialTheme.typography.headlineSmall)

            Text(stringResource(R.string.trail_order_title), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChoiceChip(stringResource(R.string.trail_order_chronological), draft.order == StackingOrder.CHRONOLOGICAL) {
                    draft = draft.copy(order = StackingOrder.CHRONOLOGICAL)
                }
                ChoiceChip(stringResource(R.string.trail_order_reverse), draft.order == StackingOrder.REVERSE) {
                    draft = draft.copy(order = StackingOrder.REVERSE)
                }
            }

            Text(stringResource(R.string.trail_style_title), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                for (style in TrailStyle.values()) {
                    ChoiceChip(trailStyleLabel(style), draft.style == style) { draft = draft.copy(style = style) }
                }
            }
            Text(trailStyleHint(draft.style), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Text(stringResource(R.string.trail_resolution_title), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                val presets = listOf<Int?>(null, 2048, 1536, 1024)
                for (preset in presets) {
                    val label = preset?.let { "$it " + stringResource(R.string.px_suffix) } ?: stringResource(R.string.trail_resolution_original)
                    ChoiceChip(label, draft.maxOutputSide == preset) { draft = draft.copy(maxOutputSide = preset) }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.trail_warp_title), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.trail_warp_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = draft.warpZoom, onCheckedChange = { draft = draft.copy(warpZoom = it) })
            }
        }
        Row(
            modifier = Modifier.padding(24.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.trail_options_cancel)) }
            Button(onClick = { onApply(draft) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.trail_options_apply)) }
        }
    }
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) Button(onClick = onClick) { Text(label) } else OutlinedButton(onClick = onClick) { Text(label) }
}

@Composable
private fun trailStyleLabel(style: TrailStyle): String = stringResource(
    when (style) {
        TrailStyle.FULL -> R.string.trail_style_full
        TrailStyle.FADE -> R.string.trail_style_fade
        TrailStyle.SHOOTING_STAR -> R.string.trail_style_shooting_star
        TrailStyle.JAVELIN -> R.string.trail_style_javelin
    }
)

@Composable
private fun trailStyleHint(style: TrailStyle): String = stringResource(
    when (style) {
        TrailStyle.FULL -> R.string.trail_style_hint_full
        TrailStyle.FADE -> R.string.trail_style_hint_fade
        TrailStyle.SHOOTING_STAR -> R.string.trail_style_hint_shooting_star
        TrailStyle.JAVELIN -> R.string.trail_style_hint_javelin
    }
)

// ---------- Инфо о снимке ----------

@Composable
private fun TrailInfoScreen(state: TrailScreen.Result, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val context = LocalContext.current
    val exif = state.exif

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(stringResource(R.string.trail_info_title), style = MaterialTheme.typography.headlineSmall)
            InfoRow(stringResource(R.string.trail_info_frames, state.framesUsed))
            val camera = listOfNotNull(exif.cameraMake, exif.cameraModel).joinToString(" ").ifBlank { "—" }
            InfoRow(stringResource(R.string.trail_info_camera, camera))
            InfoRow(
                stringResource(
                    R.string.trail_info_resolution,
                    state.outputWidth, state.outputHeight,
                    state.outputWidth.toLong() * state.outputHeight / 1_000_000.0
                )
            )
            val iso = when {
                exif.isoMin == null || exif.isoMax == null -> "—"
                exif.isoMin == exif.isoMax -> exif.isoMin.toString()
                else -> stringResource(R.string.trail_info_iso_range, exif.isoMin, exif.isoMax)
            }
            InfoRow(stringResource(R.string.trail_info_iso, iso))
            InfoRow(stringResource(R.string.trail_info_exposure, formatDuration(exif.totalExposureSeconds)))

            if (exif.hasLocation) {
                InfoRow(stringResource(R.string.trail_info_location, exif.latitude!!, exif.longitude!!))
                OutlinedButton(onClick = {
                    val uri = Uri.parse("geo:${exif.latitude},${exif.longitude}?q=${exif.latitude},${exif.longitude}")
                    val intent = Intent(Intent.ACTION_VIEW, uri)
                    if (intent.resolveActivity(context.packageManager) != null) context.startActivity(intent)
                }) { Text(stringResource(R.string.trail_info_open_maps)) }
            } else {
                Text(stringResource(R.string.trail_info_no_location), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(Modifier.padding(24.dp)) {
            OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.trail_info_close)) }
        }
    }
}

@Composable
private fun InfoRow(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium)
}

/** [seconds] -> "47 мин 32 с" / "2 ч 15 мин" - без привязки к локали (используется и в RU, и в EN строках как готовое число+единицы через отдельный ресурс не заводим, форматируем здесь). */
private fun formatDuration(seconds: Double): String {
    if (seconds <= 0) return "0 s"
    val total = seconds.roundToInt()
    val h = total / 3600; val m = (total % 3600) / 60; val s = total % 60
    return when {
        h > 0 -> "${h}h ${m}m ${s}s"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

// ---------- Значки верхней панели (см. StarIcon/PanoramaIcon в MainActivity.kt - тот же приём) ----------

@Composable
private fun TrailIconButton(labelRes: Int, onClick: () -> Unit, icon: @Composable () -> Unit) {
    val label = stringResource(labelRes)
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
        Box(
            modifier = Modifier.size(40.dp).clip(RoundedCornerShape(20.dp)),
            contentAlignment = Alignment.Center
        ) {
            // contentDescription - и для читалок экрана, и чтобы кнопку можно
            // было однозначно найти в UI-тестах (соседний текст-подпись сам по
            // себе не кликабелен).
            androidx.compose.material3.IconButton(
                onClick = onClick,
                modifier = Modifier.semantics { contentDescription = label }
            ) { icon() }
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AddPhotoIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(22.dp)) {
        val stroke = 2.dp.toPx()
        drawCircle(color, radius = size.minDimension / 2 - stroke, style = Stroke(stroke))
        drawLine(color, Offset(size.width * 0.3f, size.height / 2), Offset(size.width * 0.7f, size.height / 2), strokeWidth = stroke)
        drawLine(color, Offset(size.width / 2, size.height * 0.3f), Offset(size.width / 2, size.height * 0.7f), strokeWidth = stroke)
    }
}

@Composable
private fun CameraIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(22.dp)) {
        val stroke = 2.dp.toPx()
        val w = size.width; val h = size.height
        drawRoundRect(color, Offset(1f, h * 0.28f), androidx.compose.ui.geometry.Size(w - 2f, h * 0.58f), androidx.compose.ui.geometry.CornerRadius(3.dp.toPx()), style = Stroke(stroke))
        drawRect(color, Offset(w * 0.36f, h * 0.14f), androidx.compose.ui.geometry.Size(w * 0.28f, h * 0.16f), style = Stroke(stroke))
        drawCircle(color, radius = h * 0.16f, center = Offset(w / 2, h * 0.56f), style = Stroke(stroke))
    }
}

@Composable
private fun OptionsIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(22.dp)) {
        val stroke = 1.8.dp.toPx()
        val ys = listOf(size.height * 0.25f, size.height * 0.5f, size.height * 0.75f)
        val knobX = listOf(size.width * 0.65f, size.width * 0.35f, size.width * 0.55f)
        for ((i, y) in ys.withIndex()) {
            drawLine(color, Offset(0f, y), Offset(size.width, y), strokeWidth = stroke)
            drawCircle(color, radius = 3.dp.toPx(), center = Offset(knobX[i], y))
        }
    }
}

@Composable
private fun ShareIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(22.dp)) {
        val stroke = 2.dp.toPx()
        val w = size.width; val h = size.height
        drawLine(color, Offset(w / 2, h * 0.08f), Offset(w / 2, h * 0.62f), strokeWidth = stroke)
        val arrow = androidx.compose.ui.graphics.Path().apply {
            moveTo(w * 0.28f, h * 0.32f); lineTo(w / 2, h * 0.06f); lineTo(w * 0.72f, h * 0.32f)
        }
        drawPath(arrow, color, style = Stroke(stroke))
        val tray = androidx.compose.ui.graphics.Path().apply {
            moveTo(w * 0.12f, h * 0.55f); lineTo(w * 0.12f, h * 0.92f); lineTo(w * 0.88f, h * 0.92f); lineTo(w * 0.88f, h * 0.55f)
        }
        drawPath(tray, color, style = Stroke(stroke))
    }
}

@Composable
private fun InfoIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(22.dp)) {
        val stroke = 2.dp.toPx()
        drawCircle(color, radius = size.minDimension / 2 - stroke, style = Stroke(stroke))
        drawCircle(color, radius = 1.6.dp.toPx(), center = Offset(size.width / 2, size.height * 0.32f))
        drawLine(color, Offset(size.width / 2, size.height * 0.46f), Offset(size.width / 2, size.height * 0.74f), strokeWidth = stroke)
    }
}
