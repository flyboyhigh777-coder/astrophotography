package com.astrostacker.app.data

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.CornerPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import com.astrostacker.core.SnrEstimator
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Карточка статистики сессии (камера, выдержка, кадры, SNR) над итоговым
 * снимком - один PNG для "Поделиться", в духе карточек в сторонних
 * astro-приложениях (референс, который прислал пользователь). Рисуем через
 * обычный android.graphics.Canvas, а не снимок живого Compose-дерева - тот же
 * приём, что и у рисованных иконок в проекте (см. MainActivity/TrailScreens),
 * не требует зависимости от Compose-версии с поддержкой graphicsLayer-снапшотов.
 *
 * Цвета продублированы из ui/theme/Color.kt (а не импортированы оттуда) -
 * этот файл в data/, без зависимости от Compose; если палитра темы поменяется,
 * стоит обновить и здесь.
 */
object ShareCardRenderer {

    private const val BG = "#0B0B17"
    private const val CARD_BG = "#1C1830"
    private const val ACCENT = "#8A3FE0"
    private const val TEXT_WHITE = "#FFFFFF"
    private const val TEXT_MUTED = "#A9A6C4"

    fun render(title: String, exif: TrailExifSummary, snr: SnrEstimator.Estimate, framesUsed: Int, photo: Bitmap): Bitmap {
        val width = photo.width.coerceAtLeast(480)
        val pad = width * 0.06f
        val titleSize = width * 0.062f
        val subSize = width * 0.028f
        val statLabelSize = width * 0.024f
        val statValueSize = width * 0.05f
        val curveHeight = width * 0.18f

        val titlePaint = textPaint(TEXT_WHITE, titleSize, bold = true)
        val displayTitle = title.ifBlank { "AstroStacker" }
        val cardHeight = (pad * 2.6f + titleSize * 1.3f + subSize * 2.2f + statValueSize * 2.3f + curveHeight + pad * 0.6f)
        val photoHeight = (photo.height.toFloat() * width / photo.width)

        val out = Bitmap.createBitmap(width, (cardHeight + photoHeight).roundToInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(Color.parseColor(BG))

        val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor(CARD_BG) }
        canvas.drawRect(0f, 0f, width.toFloat(), cardHeight, cardPaint)

        var y = pad + titleSize
        canvas.drawText(displayTitle, pad, y, titlePaint)

        y += subSize * 1.7f
        val subPaint = textPaint(TEXT_MUTED, subSize)
        canvas.drawText(equipmentLine(exif), pad, y, subPaint)

        y += subSize * 1.3f
        val dividerPaint = Paint().apply { color = Color.parseColor("#33FFFFFF"); strokeWidth = max(1.5f, width * 0.0022f) }
        canvas.drawLine(pad, y, width - pad, y, dividerPaint)

        y += statValueSize * 1.0f
        val labelPaint = textPaint(TEXT_MUTED, statLabelSize)
        val valuePaint = textPaint(TEXT_WHITE, statValueSize, bold = true)
        val accentValuePaint = textPaint(ACCENT, statValueSize, bold = true)
        val colWidth = (width - 2 * pad) / 3f
        drawStat(canvas, pad, y, "ВЫДЕРЖКА", formatExposureDuration(exif.totalExposureSeconds), labelPaint, accentValuePaint)
        drawStat(canvas, pad + colWidth, y, "КАДРЫ", "$framesUsed/${exif.frameCount}", labelPaint, valuePaint)
        drawStat(canvas, pad + colWidth * 2, y, "SNR", String.format("%.1f", snr.snr), labelPaint, valuePaint)

        y += statValueSize * 1.3f
        drawSnrCurve(canvas, pad, y, width - 2 * pad, curveHeight, snr.snr, exif.frameCount)

        canvas.drawBitmap(Bitmap.createScaledBitmap(photo, width, photoHeight.roundToInt(), true), 0f, cardHeight, null)
        return out
    }

    private fun drawStat(canvas: Canvas, x: Float, y: Float, label: String, value: String, labelPaint: Paint, valuePaint: Paint) {
        canvas.drawText(label, x, y, labelPaint)
        canvas.drawText(value, x, y + valuePaint.textSize * 1.15f, valuePaint)
    }

    private fun drawSnrCurve(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, finalSnr: Double, totalFrames: Int) {
        val curve = SnrEstimator.theoreticalGrowthCurve(finalSnr, totalFrames, steps = min(totalFrames.coerceAtLeast(1), 48))
        val captionPaint = textPaint(TEXT_MUTED, w * 0.028f)
        canvas.drawText("рост SNR, оценка ~√N", x, y, captionPaint)
        if (curve.size < 2) return
        val top = y + captionPaint.textSize * 0.9f
        val bottom = top + h
        val maxValue = curve.last().coerceAtLeast(1e-6)
        val path = Path()
        for (i in curve.indices) {
            val px = x + w * i / (curve.size - 1)
            val py = bottom - (h * (curve[i] / maxValue)).toFloat()
            if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor(ACCENT); style = Paint.Style.STROKE
            strokeWidth = max(2f, w * 0.006f); strokeCap = Paint.Cap.ROUND
            pathEffect = CornerPathEffect(w * 0.02f)
        }
        canvas.drawPath(path, linePaint)
        val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor(ACCENT) }
        canvas.drawCircle(x + w, bottom - h, max(4f, w * 0.012f), dotPaint)
    }

    private fun equipmentLine(exif: TrailExifSummary): String {
        val camera = listOfNotNull(exif.cameraMake, exif.cameraModel).joinToString(" ").ifBlank { null }
        val iso = when {
            exif.isoMin == null || exif.isoMax == null -> null
            exif.isoMin == exif.isoMax -> "ISO ${exif.isoMin}"
            else -> "ISO ${exif.isoMin}–${exif.isoMax}"
        }
        return listOfNotNull(camera, iso).joinToString("  ·  ").ifBlank { "Камера неизвестна" }
    }

    private fun textPaint(colorHex: String, size: Float, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor(colorHex); textSize = size
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }
}
