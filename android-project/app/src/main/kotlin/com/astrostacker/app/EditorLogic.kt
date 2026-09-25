package com.astrostacker.app

import android.graphics.Bitmap
import com.astrostacker.core.CropRect
import com.astrostacker.core.EditParams

/**
 * Состояние экрана "Повернуть и обрезать" - общее для вкладок "Астро" и
 * "Панорама". [baseBitmap] - превью, уже повёрнутое на `draft.quarterTurns`;
 * выравнивание горизонта показывается поверх, обрезка - рамкой.
 * [aspectRatio] - зафиксированные пропорции рамки (ширина/высота) или null.
 */
data class EditorUiState(
    val baseBitmap: Bitmap,
    val draft: EditParams,
    val aspectRatio: Float? = null,
    /** Рамка ещё не трогалась руками - её можно пересчитывать автоматически. */
    val cropIsAuto: Boolean = true
)

/** Чистые функции редактора: одинаковое поведение в обеих вкладках. */
object EditorLogic {

    fun open(base: Bitmap, edit: EditParams) =
        EditorUiState(base, edit, cropIsAuto = edit.crop == autoCrop(base, edit.straightenDegrees))

    /** После поворота на 90° рамка задаётся заново - она в долях от повёрнутого кадра. */
    fun rotated(newBase: Bitmap, turns: Int, straighten: Float) =
        EditorUiState(newBase, EditParams(turns, straighten, autoCrop(newBase, straighten)))

    fun straighten(s: EditorUiState, degrees: Float): EditorUiState {
        val inscribed = autoCrop(s.baseBitmap, degrees)
        val crop = when {
            s.aspectRatio != null -> fitAspect(s.baseBitmap, s.aspectRatio, inscribed)
            s.cropIsAuto -> inscribed
            else -> s.draft.crop.intersect(inscribed)
        }
        return s.copy(draft = s.draft.copy(straightenDegrees = degrees, crop = crop))
    }

    fun setCrop(s: EditorUiState, crop: CropRect) = s.copy(draft = s.draft.copy(crop = crop.normalized()), cropIsAuto = false)

    /** [ratio]: null - свободная рамка, 0 - пропорции кадра, иначе ширина/высота. */
    fun setAspect(s: EditorUiState, ratio: Float?): EditorUiState {
        val base = s.baseBitmap
        val resolved = if (ratio == 0f) base.width.toFloat() / base.height else ratio
        val inscribed = autoCrop(base, s.draft.straightenDegrees)
        val crop = if (resolved == null) s.draft.crop else fitAspect(base, resolved, inscribed)
        return s.copy(draft = s.draft.copy(crop = crop), aspectRatio = resolved, cropIsAuto = resolved == null && s.cropIsAuto)
    }

    fun autoCrop(base: Bitmap, degrees: Float): CropRect = EditParams.inscribedCrop(base.width, base.height, degrees)

    /** Наибольшая рамка с пропорциями [ratio] (в пикселях) по центру внутри [bounds]. */
    fun fitAspect(base: Bitmap, ratio: Float, bounds: CropRect): CropRect {
        val bw = (bounds.right - bounds.left) * base.width
        val bh = (bounds.bottom - bounds.top) * base.height
        val (w, h) = if (bw / bh > ratio) (bh * ratio) to bh else bw to (bw / ratio)
        val cx = (bounds.left + bounds.right) / 2f
        val cy = (bounds.top + bounds.bottom) / 2f
        val nw = w / base.width / 2f
        val nh = h / base.height / 2f
        return CropRect(cx - nw, cy - nh, cx + nw, cy + nh)
    }
}
