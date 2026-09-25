package com.astrostacker.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.R
import com.astrostacker.app.ScreenState
import com.astrostacker.core.CropRect
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** Экран "Повернуть и обрезать". Вся геометрия - в долях кадра (см. [CropRect]). */
@Composable
fun EditScreen(
    state: ScreenState.Editing,
    onRotateQuarter: (Int) -> Unit,
    onStraighten: (Float) -> Unit,
    onCropChange: (CropRect) -> Unit,
    onAspect: (Float?) -> Unit,
    onReset: () -> Unit,
    onCancel: () -> Unit,
    onApply: () -> Unit
) {
    val base = state.baseBitmap
    val imageBitmap = remember(base) { base.asImageBitmap() }
    val imageAspect = base.width.toFloat() / base.height
    BackHandler(onBack = onCancel)

    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.edit_title), style = MaterialTheme.typography.headlineSmall)

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(imageAspect)
                    .clipToBounds()
                    .background(Color.Black)
            ) {
                Image(
                    bitmap = imageBitmap,
                    contentDescription = stringResource(R.string.edit_title),
                    contentScale = ContentScale.FillBounds,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer { rotationZ = state.draft.straightenDegrees }
                )
                CropOverlay(
                    crop = state.draft.crop,
                    aspectRatio = state.aspectRatio,
                    onCropChange = onCropChange,
                    modifier = Modifier.fillMaxSize()
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { onRotateQuarter(-1) }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.edit_rotate_left))
                }
                OutlinedButton(onClick = { onRotateQuarter(1) }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.edit_rotate_right))
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.edit_straighten, state.draft.straightenDegrees),
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = { onStraighten(0f) }) { Text("0°") }
            }
            Slider(
                value = state.draft.straightenDegrees,
                onValueChange = onStraighten,
                valueRange = -15f..15f,
                modifier = Modifier.fillMaxWidth()
            )

            Text(stringResource(R.string.edit_aspect), style = MaterialTheme.typography.titleSmall)
            val options = listOf(
                stringResource(R.string.edit_aspect_free) to null,
                stringResource(R.string.edit_aspect_original) to 0f,
                "1:1" to 1f, "4:3" to 4f / 3f, "3:2" to 3f / 2f, "16:9" to 16f / 9f
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState())
            ) {
                for ((label, ratio) in options) {
                    val resolved = if (ratio == 0f) imageAspect else ratio
                    val selected = if (resolved == null) state.aspectRatio == null
                    else state.aspectRatio != null && abs(state.aspectRatio - resolved) < 0.01f
                    if (selected) {
                        Button(onClick = { onAspect(ratio) }) { Text(label) }
                    } else {
                        OutlinedButton(onClick = { onAspect(ratio) }) { Text(label) }
                    }
                }
            }
            Text(
                stringResource(R.string.edit_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Row(
            modifier = Modifier.padding(24.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onReset) { Text(stringResource(R.string.edit_reset)) }
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.edit_cancel)) }
            Button(onClick = onApply, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.edit_apply)) }
        }
    }
}

private enum class DragMode { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT, MOVE }

/** Рамка обрезки: затемнение вокруг, сетка третей, углы тянутся, центр - перемещает рамку целиком. */
@Composable
private fun CropOverlay(
    crop: CropRect,
    aspectRatio: Float?,
    onCropChange: (CropRect) -> Unit,
    modifier: Modifier = Modifier
) {
    val currentCrop by rememberUpdatedState(crop)
    val currentRatio by rememberUpdatedState(aspectRatio)
    val currentOnChange by rememberUpdatedState(onCropChange)
    val accent = MaterialTheme.colorScheme.primary

    Canvas(
        modifier = modifier.pointerInput(Unit) {
            var mode: DragMode? = null
            var working = CropRect.FULL
            val touchRadius = 40.dp.toPx()
            detectDragGestures(
                onDragStart = { start ->
                    working = currentCrop
                    mode = pickMode(working, start, size.width.toFloat(), size.height.toFloat(), touchRadius)
                },
                onDragEnd = { mode = null },
                onDragCancel = { mode = null },
                onDrag = { change, drag ->
                    val m = mode ?: return@detectDragGestures
                    change.consume()
                    val w = size.width.toFloat(); val h = size.height.toFloat()
                    working = if (m == DragMode.MOVE) moveRect(working, drag.x / w, drag.y / h)
                    else dragCorner(working, m, drag.x / w, drag.y / h, currentRatio, w, h)
                    currentOnChange(working)
                }
            )
        }
    ) {
        val l = crop.left * size.width; val t = crop.top * size.height
        val r = crop.right * size.width; val b = crop.bottom * size.height
        val shade = Color.Black.copy(alpha = 0.55f)
        drawRect(shade, Offset.Zero, Size(size.width, t))
        drawRect(shade, Offset(0f, b), Size(size.width, size.height - b))
        drawRect(shade, Offset(0f, t), Size(l, b - t))
        drawRect(shade, Offset(r, t), Size(size.width - r, b - t))

        val grid = Color.White.copy(alpha = 0.35f)
        for (k in 1..2) {
            val x = l + (r - l) * k / 3f
            val y = t + (b - t) * k / 3f
            drawLine(grid, Offset(x, t), Offset(x, b), strokeWidth = 1.dp.toPx())
            drawLine(grid, Offset(l, y), Offset(r, y), strokeWidth = 1.dp.toPx())
        }
        drawRect(accent, Offset(l, t), Size(r - l, b - t), style = Stroke(width = 2.dp.toPx()))
        val handle = 7.dp.toPx()
        for (p in listOf(Offset(l, t), Offset(r, t), Offset(l, b), Offset(r, b))) drawCircle(accent, handle, p)
    }
}

private fun pickMode(rect: CropRect, p: Offset, w: Float, h: Float, radius: Float): DragMode? {
    val corners = listOf(
        DragMode.TOP_LEFT to Offset(rect.left * w, rect.top * h),
        DragMode.TOP_RIGHT to Offset(rect.right * w, rect.top * h),
        DragMode.BOTTOM_LEFT to Offset(rect.left * w, rect.bottom * h),
        DragMode.BOTTOM_RIGHT to Offset(rect.right * w, rect.bottom * h)
    )
    val nearest = corners.minByOrNull { (_, c) -> hypot(c.x - p.x, c.y - p.y) }!!
    if (hypot(nearest.second.x - p.x, nearest.second.y - p.y) <= radius) return nearest.first
    val inside = p.x in rect.left * w..rect.right * w && p.y in rect.top * h..rect.bottom * h
    return if (inside) DragMode.MOVE else null
}

private fun moveRect(r: CropRect, dx: Float, dy: Float): CropRect {
    val w = r.right - r.left; val h = r.bottom - r.top
    val left = (r.left + dx).coerceIn(0f, 1f - w)
    val top = (r.top + dy).coerceIn(0f, 1f - h)
    return CropRect(left, top, left + w, top + h)
}

/**
 * Тянем угол [mode], противоположный угол неподвижен. При зафиксированных
 * пропорциях [ratio] (ширина/высота в пикселях) рамка только уменьшается до
 * нужных пропорций - так она никогда не выходит за кадр.
 */
private fun dragCorner(r: CropRect, mode: DragMode, dx: Float, dy: Float, ratio: Float?, w: Float, h: Float): CropRect {
    val right = mode == DragMode.TOP_RIGHT || mode == DragMode.BOTTOM_RIGHT
    val bottom = mode == DragMode.BOTTOM_LEFT || mode == DragMode.BOTTOM_RIGHT
    val fx = if (right) r.left else r.right
    val fy = if (bottom) r.top else r.bottom
    val mx = ((if (right) r.right else r.left) + dx).coerceIn(0f, 1f)
    val my = ((if (bottom) r.bottom else r.top) + dy).coerceIn(0f, 1f)

    val minPx = 0.08f * min(w, h)
    var widthPx = max(minPx, (if (right) mx - fx else fx - mx) * w)
    var heightPx = max(minPx, (if (bottom) my - fy else fy - my) * h)
    widthPx = min(widthPx, (if (right) 1f - fx else fx) * w)
    heightPx = min(heightPx, (if (bottom) 1f - fy else fy) * h)
    if (ratio != null) {
        if (widthPx / heightPx > ratio) widthPx = heightPx * ratio else heightPx = widthPx / ratio
    }
    val nw = widthPx / w; val nh = heightPx / h
    val left = if (right) fx else fx - nw
    val top = if (bottom) fy else fy - nh
    return CropRect(left, top, left + nw, top + nh)
}
