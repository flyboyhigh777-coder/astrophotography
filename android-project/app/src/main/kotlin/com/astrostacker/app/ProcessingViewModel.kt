package com.astrostacker.app

import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.data.ExportRepository
import com.astrostacker.app.data.ImageDecoding
import com.astrostacker.app.data.MemoryBudget
import com.astrostacker.app.data.ShareCardRenderer
import com.astrostacker.app.data.TrailExifSummary
import com.astrostacker.app.data.summarizeTrailExif
import com.astrostacker.core.CropRect
import com.astrostacker.core.EditParams
import com.astrostacker.core.FrameCalibration
import com.astrostacker.core.FrameInput
import com.astrostacker.core.FrameOutcome
import com.astrostacker.core.Pipeline
import com.astrostacker.core.PipelineConfig
import com.astrostacker.core.ProgressUpdate
import com.astrostacker.core.Rgb16Image
import com.astrostacker.core.SnrEstimator
import com.astrostacker.core.Stage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Рекомендуемый максимум кадров в одной серии - см. подсказку на экране выбора. */
const val RECOMMENDED_MAX_FRAMES = 30

/**
 * Состояния экрана - единственный источник истины для навигации: вместо
 * Navigation-Compose (см. docs/ARCHITECTURE.md §2.2) `AstroStackerRoot` просто
 * переключает композируемую функцию через `when` по текущему [ScreenState].
 */
sealed interface ScreenState {

    /** Выбор кадров (первый экран). [previousError], если есть - что пошло не так в прошлый раз. */
    data class Picking(
        val lightFrames: List<Uri> = emptyList(),
        val darkFrames: List<Uri> = emptyList(),
        val biasFrames: List<Uri> = emptyList(),
        val flatFrames: List<Uri> = emptyList(),
        /** Отдельные снимки земли с того же штатива (необязательно). */
        val groundFrames: List<Uri> = emptyList(),
        val previousError: ErrorMessage? = null
    ) : ScreenState

    data class Processing(val progress: ProgressUpdate, val totalFrames: Int) : ScreenState

    /** [previewBitmap] - уменьшенный результат (выбранный вариант, с поворотом и обрезкой). */
    data class Result(
        val frameOutcomes: List<FrameOutcome>,
        val previewBitmap: Bitmap,
        val freezeGround: Boolean = true,
        val edit: EditParams = EditParams(),
        val exportFormat: ExportFormat = ExportFormat.TIFF16,
        val saveState: SaveState = SaveState.Idle,
        val calibrationUsed: List<CalibrationKind> = emptyList(),
        /** Из скольких кадров сложена земля и были ли это отдельные снимки земли. */
        val groundFramesUsed: Int = 0,
        val groundFromSeparateFrames: Boolean = false,
        /** EXIF-сводка по кадрам, реально вошедшим в стек (см. [FrameOutcome.accepted]) - для карточки сессии. */
        val exif: TrailExifSummary,
        /** Грубая оценка SNR по стеку неба (см. [SnrEstimator]) - для карточки сессии. */
        val snr: SnrEstimator.Estimate,
        /** Название объекта/места для карточки - вводит пользователь, пусто по умолчанию. */
        val cardTitle: String = ""
    ) : ScreenState

    /** Экран "Повернуть и обрезать" поверх результата - см. [EditorUiState]. */
    data class Editing(val result: Result, val editor: EditorUiState) : ScreenState
}

enum class CalibrationKind { DARK, BIAS, FLAT }

enum class SaveState { Idle, Saving, Success, Failed }

sealed interface ErrorMessage {
    data class Generic(val detail: String) : ErrorMessage
    data class DecodeFailed(val fileName: String) : ErrorMessage
    object TooFewFrames : ErrorMessage
}

/**
 * Оркестрация: чтение и калибровка кадров, `:core` `Pipeline.run` на
 * `Dispatchers.Default`, хранение результата в 16 битах, поворот/обрезка и
 * сохранение. Прогресс и результат публикуются через [StateFlow].
 */
class ProcessingViewModel(application: Application) : AndroidViewModel(application) {

    private val _screenState = MutableStateFlow<ScreenState>(ScreenState.Picking())
    val screenState: StateFlow<ScreenState> = _screenState.asStateFlow()

    private var processingJob: Job? = null

    // Полноразмерные результаты (16 бит) и их уменьшенные копии для экрана.
    // Хранятся здесь, а не в ScreenState: это десятки мегабайт, в состоянии
    // экрана достаточно готового Bitmap превью.
    private var fullGroundFrozen: Rgb16Image? = null
    private var fullSkyOnly: Rgb16Image? = null
    private var previewGroundFrozen: Rgb16Image? = null
    private var previewSkyOnly: Rgb16Image? = null

    fun updateLightFrames(uris: List<Uri>) = updatePicking { it.copy(lightFrames = uris) }
    fun updateDarkFrames(uris: List<Uri>) = updatePicking { it.copy(darkFrames = uris) }
    fun updateBiasFrames(uris: List<Uri>) = updatePicking { it.copy(biasFrames = uris) }
    fun updateFlatFrames(uris: List<Uri>) = updatePicking { it.copy(flatFrames = uris) }
    fun updateGroundFrames(uris: List<Uri>) = updatePicking { it.copy(groundFrames = uris) }

    private fun updatePicking(change: (ScreenState.Picking) -> ScreenState.Picking) {
        (_screenState.value as? ScreenState.Picking)?.let { _screenState.value = change(it) }
    }

    fun startProcessing() {
        val picking = _screenState.value as? ScreenState.Picking ?: return
        if (picking.lightFrames.size < 2) {
            _screenState.value = picking.copy(previousError = ErrorMessage.TooFewFrames)
            return
        }

        val totalFrames = picking.lightFrames.size
        processingJob = viewModelScope.launch {
            _screenState.value = ScreenState.Processing(ProgressUpdate(Stage.LOAD, 0, totalFrames), totalFrames)
            try {
                val context = getApplication<Application>()
                val calibrationTypes = listOf(picking.darkFrames, picking.biasFrames, picking.flatFrames).count { it.isNotEmpty() }
                val budget = MemoryBudget.compute(totalFrames, extraFullFrames = calibrationTypes + picking.groundFrames.size)

                // 1. Мастер-кадры: каждый тип усредняется по одному кадру, без
                //    загрузки всей серии в память.
                val (masters, used) = withContext(Dispatchers.Default) {
                    fun master(uris: List<Uri>) = if (uris.isEmpty()) null else FrameCalibration.MasterAccumulator().also { acc ->
                        for (uri in uris) ImageDecoding.decodeFrame(context, uri, budget.maxTotalPixels).image?.let { acc.add(it) }
                    }.mean()
                    val dark = master(picking.darkFrames)
                    val bias = master(picking.biasFrames)
                    val flat = master(picking.flatFrames)
                    val usedKinds = buildList {
                        if (dark != null) add(CalibrationKind.DARK)
                        if (bias != null) add(CalibrationKind.BIAS)
                        if (flat != null) add(CalibrationKind.FLAT)
                    }
                    FrameCalibration.buildMasters(dark, bias, flat) to usedKinds
                }

                // 2. Световые кадры: чтение + калибровка сразу, по одному.
                val frameInputs = ArrayList<FrameInput>(totalFrames)
                for ((index, uri) in picking.lightFrames.withIndex()) {
                    val decoded = withContext(Dispatchers.IO) { ImageDecoding.decodeFrame(context, uri, budget.maxTotalPixels) }
                    val image = decoded.image
                    if (image == null) {
                        _screenState.value = picking.copy(previousError = ErrorMessage.DecodeFailed(decoded.displayName))
                        return@launch
                    }
                    val calibrated = withContext(Dispatchers.Default) { FrameCalibration.calibrate(image, masters) }
                    frameInputs.add(FrameInput(calibrated, decoded.captureEpochSeconds))
                    _screenState.value = ScreenState.Processing(ProgressUpdate(Stage.LOAD, index + 1, totalFrames), totalFrames)
                }

                // 3. Отдельные снимки земли: та же калибровка, но без дарка
                //    (у них может быть другая выдержка).
                val groundImages = ArrayList<com.astrostacker.core.FloatImage>()
                for (uri in picking.groundFrames) {
                    val image = withContext(Dispatchers.IO) { ImageDecoding.decodeFrame(context, uri, budget.maxTotalPixels).image } ?: continue
                    groundImages.add(withContext(Dispatchers.Default) { FrameCalibration.calibrate(image, masters, subtractDark = false) })
                }

                // 4. Совмещение по звёздам, стек неба, стек земли.
                val result = withContext(Dispatchers.Default) {
                    Pipeline.run(frameInputs, PipelineConfig(), groundImages) { progress ->
                        _screenState.value = ScreenState.Processing(progress, totalFrames)
                    }
                }
                frameInputs.clear()
                groundImages.clear()

                withContext(Dispatchers.Default) {
                    fullGroundFrozen = Rgb16Image.fromLinear(result.finalImage)
                    fullSkyOnly = Rgb16Image.fromLinear(result.stackedLinear)
                    previewGroundFrozen = fullGroundFrozen!!.downscale(PREVIEW_MAX_SIDE)
                    previewSkyOnly = fullSkyOnly!!.downscale(PREVIEW_MAX_SIDE)
                }
                val preview = withContext(Dispatchers.Default) { renderPreview(freezeGround = true, edit = EditParams()) }
                // Сводка EXIF только по кадрам, реально вошедшим в стек (не отклонённым при
                // совмещении) - для карточки сессии (см. ResultScreen "Поделиться").
                val acceptedExif = withContext(Dispatchers.IO) {
                    result.frameOutcomes.filter { it.accepted }.mapNotNull { outcome ->
                        picking.lightFrames.getOrNull(outcome.index)?.let { ImageDecoding.readFrameExif(context, it) }
                    }
                }
                val snr = withContext(Dispatchers.Default) { SnrEstimator.estimate(fullSkyOnly!!) }
                _screenState.value = ScreenState.Result(
                    frameOutcomes = result.frameOutcomes,
                    previewBitmap = preview,
                    calibrationUsed = used,
                    groundFramesUsed = result.groundFramesUsed,
                    groundFromSeparateFrames = result.groundFromSeparateFrames,
                    exif = summarizeTrailExif(acceptedExif),
                    snr = snr
                )
            } catch (e: CancellationException) {
                throw e // отмену корутины нельзя "проглатывать" - см. cancelProcessing()
            } catch (e: OutOfMemoryError) {
                releaseResults()
                _screenState.value = picking.copy(previousError = ErrorMessage.Generic("не хватило памяти - выберите меньше кадров"))
            } catch (e: IllegalArgumentException) {
                // Pipeline.run падает с require() при нехватке успешно совмещённых кадров.
                val message = e.message.orEmpty()
                _screenState.value = if (message.contains("зарегистрировано", ignoreCase = true) ||
                    message.contains("минимум", ignoreCase = true)
                ) {
                    picking.copy(previousError = ErrorMessage.TooFewFrames)
                } else {
                    picking.copy(previousError = ErrorMessage.Generic(message))
                }
            } catch (e: Exception) {
                _screenState.value = picking.copy(previousError = ErrorMessage.Generic(e.message ?: e.toString()))
            }
        }
    }

    fun cancelProcessing() {
        processingJob?.cancel()
        _screenState.value = ScreenState.Picking()
    }

    fun setFreezeGround(enabled: Boolean) {
        val current = _screenState.value as? ScreenState.Result ?: return
        viewModelScope.launch {
            val preview = withContext(Dispatchers.Default) { renderPreview(enabled, current.edit) }
            _screenState.value = current.copy(freezeGround = enabled, previewBitmap = preview, saveState = SaveState.Idle)
        }
    }

    fun setExportFormat(format: ExportFormat) {
        val current = _screenState.value as? ScreenState.Result ?: return
        _screenState.value = current.copy(exportFormat = format, saveState = SaveState.Idle)
    }

    fun setCardTitle(title: String) {
        val current = _screenState.value as? ScreenState.Result ?: return
        _screenState.value = current.copy(cardTitle = title)
    }

    /**
     * Рендерит карточку статистики сессии поверх превью-снимка (см.
     * [ShareCardRenderer]) и открывает системный диалог "Поделиться" -
     * тот же приём FileProvider, что и для кадра с камеры (см.
     * `CameraCapture.kt`), плюс `FLAG_ACTIVITY_NEW_TASK`, т.к. запускаем
     * Intent из `Application`, а не из `Activity`.
     */
    fun shareCard() {
        val current = _screenState.value as? ScreenState.Result ?: return
        viewModelScope.launch {
            try {
                val context = getApplication<Application>()
                val uri = withContext(Dispatchers.IO) {
                    val card = ShareCardRenderer.render(current.cardTitle, current.exif, current.snr, current.frameOutcomes.count { it.accepted }, current.previewBitmap)
                    val dir = File(context.cacheDir, "share").apply { mkdirs() }
                    val file = File(dir, "astro_card_${System.currentTimeMillis()}.png")
                    file.outputStream().use { card.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                }
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) {
                // Шаринг - необязательное действие поверх уже готового результата, не ломаем экран результата из-за него.
            }
        }
    }

    // ---------- Повернуть и обрезать ----------

    fun openEditor() {
        val current = _screenState.value as? ScreenState.Result ?: return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { renderEditorBase(current.freezeGround, current.edit.quarterTurns) }
            _screenState.value = ScreenState.Editing(current, EditorLogic.open(base, current.edit))
        }
    }

    fun editorRotateQuarter(delta: Int) {
        val editing = _screenState.value as? ScreenState.Editing ?: return
        val turns = ((editing.editor.draft.quarterTurns + delta) % 4 + 4) % 4
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { renderEditorBase(editing.result.freezeGround, turns) }
            _screenState.value = editing.copy(editor = EditorLogic.rotated(base, turns, editing.editor.draft.straightenDegrees))
        }
    }

    fun editorStraighten(degrees: Float) = updateEditor { EditorLogic.straighten(it, degrees) }
    fun editorSetCrop(crop: CropRect) = updateEditor { EditorLogic.setCrop(it, crop) }
    /** [ratio] = ширина/высота рамки; null - свободная рамка; 0 - пропорции исходного кадра. */
    fun editorSetAspect(ratio: Float?) = updateEditor { EditorLogic.setAspect(it, ratio) }

    private fun updateEditor(change: (EditorUiState) -> EditorUiState) {
        val editing = _screenState.value as? ScreenState.Editing ?: return
        _screenState.value = editing.copy(editor = change(editing.editor))
    }

    fun editorReset() {
        val editing = _screenState.value as? ScreenState.Editing ?: return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { renderEditorBase(editing.result.freezeGround, 0) }
            _screenState.value = editing.copy(editor = EditorUiState(base, EditParams()))
        }
    }

    fun editorCancel() {
        val editing = _screenState.value as? ScreenState.Editing ?: return
        _screenState.value = editing.result
    }

    fun editorApply() {
        val editing = _screenState.value as? ScreenState.Editing ?: return
        viewModelScope.launch {
            val draft = editing.editor.draft
            val preview = withContext(Dispatchers.Default) { renderPreview(editing.result.freezeGround, draft) }
            _screenState.value = editing.result.copy(edit = draft, previewBitmap = preview, saveState = SaveState.Idle)
        }
    }

    // ---------- Сохранение ----------

    fun saveResult() {
        val current = _screenState.value as? ScreenState.Result ?: return
        val full = (if (current.freezeGround) fullGroundFrozen else fullSkyOnly) ?: return
        _screenState.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val success = try {
                withContext(Dispatchers.IO) {
                    val edited = current.edit.applyTo(full)
                    ExportRepository.save(getApplication<Application>(), edited, current.exportFormat).success
                }
            } catch (e: OutOfMemoryError) {
                false
            }
            val latest = _screenState.value as? ScreenState.Result ?: return@launch
            _screenState.value = latest.copy(saveState = if (success) SaveState.Success else SaveState.Failed)
        }
    }

    fun dismissError() = updatePicking { it.copy(previousError = null) }

    fun reset() {
        processingJob?.cancel()
        releaseResults()
        _screenState.value = ScreenState.Picking()
    }

    private fun releaseResults() {
        fullGroundFrozen = null; fullSkyOnly = null
        previewGroundFrozen = null; previewSkyOnly = null
    }

    private fun previewSource(freezeGround: Boolean): Rgb16Image =
        (if (freezeGround) previewGroundFrozen else previewSkyOnly) ?: error("нет результата")

    private fun renderPreview(freezeGround: Boolean, edit: EditParams): Bitmap =
        ImageDecoding.rgb16ToBitmap(edit.applyTo(previewSource(freezeGround)))

    private fun renderEditorBase(freezeGround: Boolean, quarterTurns: Int): Bitmap =
        ImageDecoding.rgb16ToBitmap(previewSource(freezeGround).rotateQuarterTurns(quarterTurns))

    private companion object {
        const val PREVIEW_MAX_SIDE = 1600
    }
}
