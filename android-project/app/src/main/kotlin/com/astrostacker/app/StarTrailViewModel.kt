package com.astrostacker.app

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astrostacker.app.data.ExifWriter
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.data.ExportRepository
import com.astrostacker.app.data.FrameExif
import com.astrostacker.app.data.ImageDecoding
import com.astrostacker.app.data.MemoryBudget
import com.astrostacker.app.data.TrailExifSummary
import com.astrostacker.app.data.summarizeTrailExif
import com.astrostacker.core.CropRect
import com.astrostacker.core.EditParams
import com.astrostacker.core.Rgb16Image
import com.astrostacker.core.StackingOrder
import com.astrostacker.core.StarTrail
import com.astrostacker.core.StarTrailAccumulator
import com.astrostacker.core.StarTrailConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Этапы склейки треков - для прогресса на экране обработки. */
enum class TrailStage { LOAD, COMBINE, DONE }

data class TrailProgress(val stage: TrailStage, val current: Int, val total: Int)

sealed interface TrailScreen {

    data class Picking(
        val photos: List<Uri> = emptyList(),
        val config: StarTrailConfig = StarTrailConfig(),
        val error: String? = null
    ) : TrailScreen

    data class Processing(val progress: TrailProgress) : TrailScreen

    data class Result(
        val previewBitmap: Bitmap,
        val framesUsed: Int,
        val framesTotal: Int,
        val config: StarTrailConfig,
        val exif: TrailExifSummary,
        /** Все исходные фото, участвовавшие в этой сборке - чтобы "Добавить кадры" знал, к чему дописывать. */
        val sourcePhotos: List<Uri>,
        val edit: EditParams = EditParams(),
        // TIFF16 по умолчанию, а не JPEG: трек - результат стекинга, JPEG (8 бит, lossy)
        // обрежет как раз то, ради чего снимают серию - см. также ProcessingViewModel.
        val exportFormat: ExportFormat = ExportFormat.TIFF16,
        val saveState: SaveState = SaveState.Idle,
        /** Размер файла, который реально сохранится (полное разрешение с учётом поворота/обрезки) - НЕ размер [previewBitmap], который уменьшен для экрана. */
        val outputWidth: Int = 0,
        val outputHeight: Int = 0
    ) : TrailScreen

    data class Editing(val result: Result, val editor: EditorUiState) : TrailScreen
}

/**
 * Вкладка "Звёздные треки": в отличие от "Астро" (совмещение кадров, чтобы
 * погасить вращение неба - звёзды остаются точками), здесь кадры специально
 * НЕ совмещаются - камера неподвижна, и вращение неба само прочерчивает
 * дуги. См. `StarTrail`/`StarTrailAccumulator` в `:core`.
 *
 * Кадры обрабатываются по одному (декодирование + добавление в накопитель),
 * а не все сразу - в памяти никогда не держится больше одного исходного
 * кадра плюс сам накопитель, поэтому серия может быть длинной (десятки-сотни
 * кадров) без риска нехватки памяти на телефоне.
 */
class StarTrailViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<TrailScreen>(TrailScreen.Picking())
    val state: StateFlow<TrailScreen> = _state.asStateFlow()

    private var job: Job? = null
    private var photos: List<Uri> = emptyList()
    private var exifSummary: TrailExifSummary = summarizeTrailExif(emptyList())
    private var full: Rgb16Image? = null
    private var preview: Rgb16Image? = null

    fun updatePhotos(uris: List<Uri>) {
        (_state.value as? TrailScreen.Picking)?.let { _state.value = it.copy(photos = uris, error = null) }
    }

    fun updateConfig(config: StarTrailConfig) {
        (_state.value as? TrailScreen.Picking)?.let { _state.value = it.copy(config = config) }
    }

    fun dismissError() {
        (_state.value as? TrailScreen.Picking)?.let { _state.value = it.copy(error = null) }
    }

    fun start() {
        val picking = _state.value as? TrailScreen.Picking ?: return
        if (picking.photos.size < 2) return
        photos = picking.photos
        process(picking.config)
    }

    /** Пересборка с новыми настройками (кнопка "Начать" в панели настроек на экране результата) - фото уже выбраны. */
    fun reprocess(config: StarTrailConfig) = process(config)

    /** "Добавить кадры" на экране результата - [newUris] дописываются к уже использованным, и трек пересобирается. */
    fun appendPhotosAndReprocess(newUris: List<Uri>) {
        val current = _state.value as? TrailScreen.Result ?: return
        if (newUris.isEmpty()) return
        photos = photos + newUris
        process(current.config)
    }

    private fun process(config: StarTrailConfig) {
        job = viewModelScope.launch {
            val total = photos.size
            _state.value = TrailScreen.Processing(TrailProgress(TrailStage.LOAD, 0, total))
            try {
                val context = getApplication<Application>()
                // Кадры декодируются по одному - бюджет считается на "1 кадр в моменте", а не на всю серию (ср. MemoryBudget.compute для :Астро).
                val budget = MemoryBudget.compute(frameCount = 1, extraFullFrames = 1)

                // 1. EXIF всех кадров - дёшево (без декодирования битмапа), нужен для порядка по времени съёмки и сводки метаданных.
                val exifs = withContext(Dispatchers.IO) { photos.map { ImageDecoding.readFrameExif(context, it) } }
                exifSummary = summarizeTrailExif(exifs)

                val processingOrder = resolveOrder(exifs, config)

                // 2. Декодирование и накопление по одному кадру (поканальный максимум - см. StarTrailAccumulator).
                // Кадры, которые не удалось прочитать или чей размер не совпал с первым, просто
                // пропускаются - экран результата покажет разницу как framesTotal - framesUsed.
                var accumulator: StarTrailAccumulator? = null
                for ((pos, photoIndex) in processingOrder.withIndex()) {
                    val decoded = withContext(Dispatchers.IO) { ImageDecoding.decodeFrame(context, photos[photoIndex], budget.maxTotalPixels) }
                    val image = decoded.image
                    if (image != null) {
                        val acc = accumulator ?: StarTrailAccumulator(image.width, image.height).also { accumulator = it }
                        if (image.width == acc.width && image.height == acc.height) {
                            val (weight, scale) = StarTrail.weightAndScale(pos, processingOrder.size, config)
                            acc.add(image, weight, scale)
                        }
                    }
                    _state.value = TrailScreen.Processing(TrailProgress(TrailStage.COMBINE, pos + 1, processingOrder.size))
                }

                val acc = accumulator
                if (acc == null || acc.framesAdded < 2) {
                    _state.value = TrailScreen.Picking(photos, config, "Слишком мало пригодных кадров (нужно минимум 2 одного размера)")
                    return@launch
                }

                val combined = withContext(Dispatchers.Default) { acc.result() }
                full = withContext(Dispatchers.Default) {
                    val rgb = Rgb16Image.fromLinear(combined)
                    config.maxOutputSide?.let { rgb.downscale(it) } ?: rgb
                }
                preview = withContext(Dispatchers.Default) { full!!.downscale(PREVIEW_MAX_SIDE) }
                val bitmap = withContext(Dispatchers.Default) { ImageDecoding.rgb16ToBitmap(preview!!) }

                _state.value = TrailScreen.Result(
                    previewBitmap = bitmap,
                    framesUsed = acc.framesAdded,
                    framesTotal = total,
                    config = config,
                    exif = exifSummary,
                    sourcePhotos = photos,
                    outputWidth = full!!.width,
                    outputHeight = full!!.height
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: OutOfMemoryError) {
                release()
                _state.value = TrailScreen.Picking(photos, config, "не хватило памяти - выберите меньше кадров")
            } catch (e: Exception) {
                release()
                _state.value = TrailScreen.Picking(photos, config, e.message ?: e.toString())
            }
        }
    }

    /** Порядок обработки: по времени съёмки, если оно известно у всех кадров (иначе как выбраны), затем разворот при [StackingOrder.REVERSE]. */
    private fun resolveOrder(exifs: List<FrameExif>, config: StarTrailConfig): List<Int> {
        val chronological = if (exifs.all { it.epochSeconds != null }) {
            photos.indices.sortedBy { exifs[it].epochSeconds }
        } else {
            photos.indices.toList()
        }
        return StarTrail.orderIndices(chronological.size, config.order).map { chronological[it] }
    }

    fun cancel() {
        job?.cancel()
        release()
        _state.value = TrailScreen.Picking()
    }

    fun reset() = cancel()

    private fun release() {
        full = null; preview = null
    }

    // ---------- Повернуть и обрезать (общая логика с "Астро"/"Панорама") ----------

    fun openEditor() {
        val current = _state.value as? TrailScreen.Result ?: return
        val src = preview ?: return
        val base = withEditorBase(src, current.edit.quarterTurns)
        _state.value = TrailScreen.Editing(current, EditorLogic.open(base, current.edit))
    }

    fun editorRotateQuarter(delta: Int) {
        val e = _state.value as? TrailScreen.Editing ?: return
        val src = preview ?: return
        val turns = ((e.editor.draft.quarterTurns + delta) % 4 + 4) % 4
        val base = withEditorBase(src, turns)
        _state.value = e.copy(editor = EditorLogic.rotated(base, turns, e.editor.draft.straightenDegrees))
    }

    fun editorStraighten(degrees: Float) = updateEditor { EditorLogic.straighten(it, degrees) }
    fun editorSetCrop(crop: CropRect) = updateEditor { EditorLogic.setCrop(it, crop) }
    fun editorSetAspect(ratio: Float?) = updateEditor { EditorLogic.setAspect(it, ratio) }

    private fun updateEditor(change: (EditorUiState) -> EditorUiState) {
        val e = _state.value as? TrailScreen.Editing ?: return
        _state.value = e.copy(editor = change(e.editor))
    }

    fun editorReset() {
        val e = _state.value as? TrailScreen.Editing ?: return
        val src = preview ?: return
        _state.value = e.copy(editor = EditorUiState(withEditorBase(src, 0), EditParams()))
    }

    fun editorCancel() {
        val e = _state.value as? TrailScreen.Editing ?: return
        _state.value = e.result
    }

    fun editorApply() {
        val e = _state.value as? TrailScreen.Editing ?: return
        val draft = e.editor.draft
        val src = preview ?: return
        val fullImage = full ?: return
        val bitmap = ImageDecoding.rgb16ToBitmap(draft.applyTo(src))
        val turned = draft.quarterTurns % 2 == 1
        val baseW = if (turned) fullImage.height else fullImage.width
        val baseH = if (turned) fullImage.width else fullImage.height
        val outW = (baseW * (draft.crop.right - draft.crop.left)).toInt()
        val outH = (baseH * (draft.crop.bottom - draft.crop.top)).toInt()
        _state.value = e.result.copy(edit = draft, previewBitmap = bitmap, saveState = SaveState.Idle, outputWidth = outW, outputHeight = outH)
    }

    private fun withEditorBase(src: Rgb16Image, quarterTurns: Int): Bitmap = ImageDecoding.rgb16ToBitmap(src.rotateQuarterTurns(quarterTurns))

    // ---------- Сохранение ----------

    fun setExportFormat(format: ExportFormat) {
        val current = _state.value as? TrailScreen.Result ?: return
        _state.value = current.copy(exportFormat = format, saveState = SaveState.Idle)
    }

    fun save() {
        val current = _state.value as? TrailScreen.Result ?: return
        val image = full ?: return
        _state.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val context = getApplication<Application>()
            val result = try {
                withContext(Dispatchers.IO) {
                    val edited = current.edit.applyTo(image)
                    ExportRepository.save(context, edited, current.exportFormat, namePrefix = "startrail")
                }
            } catch (e: OutOfMemoryError) {
                null
            }
            if (result?.success == true && result.uri != null) {
                withContext(Dispatchers.IO) { ExifWriter.writeTrailSummary(context, result.uri, current.exportFormat, current.exif) }
            }
            val latest = _state.value as? TrailScreen.Result ?: return@launch
            _state.value = latest.copy(saveState = if (result?.success == true) SaveState.Success else SaveState.Failed)
        }
    }

    private companion object {
        const val PREVIEW_MAX_SIDE = 1800
    }
}
