package com.astrostacker.app

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.data.ExportRepository
import com.astrostacker.app.data.ImageDecoding
import com.astrostacker.app.data.MemoryBudget
import com.astrostacker.core.CropRect
import com.astrostacker.core.EditParams
import com.astrostacker.core.ExposureFusion
import com.astrostacker.core.FloatImage
import com.astrostacker.core.FrameWarp
import com.astrostacker.core.HdrAligner
import com.astrostacker.core.Rgb16Image
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class HdrStage { LOAD, FEATURES, ALIGN, FUSE, DONE }

data class HdrProgress(val stage: HdrStage, val current: Int, val total: Int)

sealed interface HdrScreen {
    data class Picking(val photos: List<Uri> = emptyList(), val error: String? = null) : HdrScreen

    data class Processing(val progress: HdrProgress) : HdrScreen

    data class Result(
        val previewBitmap: Bitmap,
        val acceptedCount: Int,
        val totalCount: Int,
        val edit: EditParams = EditParams(),
        // TIFF16 по умолчанию, а не JPEG - см. ProcessingViewModel/StarTrailViewModel:
        // JPEG (8 бит, lossy) режет как раз ту динамику, ради которой собирали HDR.
        val exportFormat: ExportFormat = ExportFormat.TIFF16,
        val saveState: SaveState = SaveState.Idle
    ) : HdrScreen

    data class Editing(val result: Result, val editor: EditorUiState) : HdrScreen
}

/**
 * Вкладка "HDR": серия кадров с разной выдержкой одной и той же (почти)
 * неподвижной сцены -> совмещение по особым точкам ([HdrAligner], терпит
 * небольшой сдвиг руки/штатива) -> слияние экспозиций ([ExposureFusion], без
 * пересвеченных светов и чёрных теней) -> результат с поворотом/обрезкой и
 * сохранением - тот же набор экранов, что у "Панорамы"/"Астро".
 */
class HdrViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<HdrScreen>(HdrScreen.Picking())
    val state: StateFlow<HdrScreen> = _state.asStateFlow()

    private var job: Job? = null
    private var full: Rgb16Image? = null
    private var preview: Rgb16Image? = null

    fun updatePhotos(uris: List<Uri>) {
        (_state.value as? HdrScreen.Picking)?.let { _state.value = it.copy(photos = uris, error = null) }
    }

    fun dismissError() {
        (_state.value as? HdrScreen.Picking)?.let { _state.value = it.copy(error = null) }
    }

    fun start() {
        val picking = _state.value as? HdrScreen.Picking ?: return
        val total = picking.photos.size
        if (total < 2) return
        job = viewModelScope.launch {
            // Первая попытка - с потолком заведомо выше любого реального фото (родное
            // разрешение фото остаётся как есть): не угадываем заранее "безопасный"
            // потолок по объёму памяти - урезаем только если реально не хватило
            // (OutOfMemoryError), и то постепенно (вдвое за раз - конкретное число,
            // а не Long.MAX_VALUE, иначе первый же откат с него ничего не уменьшит,
            // если фото и так меньше последующего потолка).
            var maxTotalPixels = UNLIMITED_PIXELS
            while (true) {
                try {
                    runPipeline(picking, total, maxTotalPixels)
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: OutOfMemoryError) {
                    release()
                    val next = maxTotalPixels / 2
                    if (next < MemoryBudget.MIN_TOTAL_PIXELS) {
                        _state.value = picking.copy(error = "не хватило памяти даже на уменьшенном разрешении - выберите меньше фото")
                        return@launch
                    }
                    maxTotalPixels = next
                } catch (e: Exception) {
                    release()
                    _state.value = picking.copy(error = e.message ?: e.toString())
                    return@launch
                }
            }
        }
    }

    private suspend fun runPipeline(picking: HdrScreen.Picking, total: Int, maxTotalPixels: Long) {
        _state.value = HdrScreen.Processing(HdrProgress(HdrStage.LOAD, 0, total))
        val context = getApplication<Application>()
        val images = ArrayList<FloatImage>()
        for ((i, uri) in picking.photos.withIndex()) {
            val decoded = withContext(Dispatchers.IO) { ImageDecoding.decodeFrame(context, uri, maxTotalPixels) }
            val image = decoded.image ?: throw IllegalStateException("не удалось прочитать фото: ${decoded.displayName}")
            images.add(image)
            _state.value = HdrScreen.Processing(HdrProgress(HdrStage.LOAD, i + 1, total))
        }
        // Кадры одной HDR-серии снимаются с одной и той же точки без смены
        // кадрирования - разный размер означает, что выбраны кадры из разных
        // серий или с цифровым зумом между ними, выравнивание тут бессмысленно.
        val width = images[0].width; val height = images[0].height
        if (images.any { it.width != width || it.height != height }) {
            throw IllegalStateException("фото разного размера - нужна серия с одной точки без смены зума")
        }

        val aligned = withContext(Dispatchers.Default) {
            HdrAligner.align(images) { current, featuresTotal ->
                _state.value = HdrScreen.Processing(HdrProgress(HdrStage.FEATURES, current, featuresTotal))
            }
        }
        if (aligned.frames.size < 2) {
            throw IllegalStateException("не удалось совместить кадры - нужна серия со штатива без смещения кадра")
        }
        _state.value = HdrScreen.Processing(HdrProgress(HdrStage.ALIGN, aligned.frames.size, total))

        val warped = withContext(Dispatchers.Default) { FrameWarp.warpAll(width, height, aligned.frames) }
        val fused = withContext(Dispatchers.Default) {
            ExposureFusion.fuse(warped) { current, fuseTotal ->
                _state.value = HdrScreen.Processing(HdrProgress(HdrStage.FUSE, current, fuseTotal))
            }
        }
        full = Rgb16Image.fromLinear(fused)
        preview = withContext(Dispatchers.Default) { full!!.downscale(PREVIEW_MAX_SIDE) }
        val bitmap = withContext(Dispatchers.Default) { ImageDecoding.rgb16ToBitmap(preview!!) }
        _state.value = HdrScreen.Result(previewBitmap = bitmap, acceptedCount = aligned.frames.size, totalCount = total)
    }

    // ---------- Повернуть и обрезать (общая логика с "Астро"/"Панорамой") ----------

    private fun editorBase(turns: Int): Bitmap = ImageDecoding.rgb16ToBitmap(preview!!.rotateQuarterTurns(turns))

    fun openEditor() {
        val current = _state.value as? HdrScreen.Result ?: return
        if (preview == null) return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(current.edit.quarterTurns) }
            _state.value = HdrScreen.Editing(current, EditorLogic.open(base, current.edit))
        }
    }

    fun editorRotateQuarter(delta: Int) {
        val e = _state.value as? HdrScreen.Editing ?: return
        val turns = ((e.editor.draft.quarterTurns + delta) % 4 + 4) % 4
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(turns) }
            _state.value = e.copy(editor = EditorLogic.rotated(base, turns, e.editor.draft.straightenDegrees))
        }
    }

    fun editorStraighten(degrees: Float) = updateEditor { EditorLogic.straighten(it, degrees) }
    fun editorSetCrop(crop: CropRect) = updateEditor { EditorLogic.setCrop(it, crop) }
    fun editorSetAspect(ratio: Float?) = updateEditor { EditorLogic.setAspect(it, ratio) }

    private fun updateEditor(change: (EditorUiState) -> EditorUiState) {
        val e = _state.value as? HdrScreen.Editing ?: return
        _state.value = e.copy(editor = change(e.editor))
    }

    fun editorReset() {
        val e = _state.value as? HdrScreen.Editing ?: return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(0) }
            _state.value = e.copy(editor = EditorUiState(base, EditParams()))
        }
    }

    fun editorCancel() {
        val e = _state.value as? HdrScreen.Editing ?: return
        _state.value = e.result
    }

    fun editorApply() {
        val e = _state.value as? HdrScreen.Editing ?: return
        viewModelScope.launch { _state.value = withPreview(e.result.copy(edit = e.editor.draft, saveState = SaveState.Idle)) }
    }

    private suspend fun withPreview(r: HdrScreen.Result): HdrScreen.Result {
        val src = preview ?: return r
        val bitmap = withContext(Dispatchers.Default) { ImageDecoding.rgb16ToBitmap(r.edit.applyTo(src)) }
        return r.copy(previewBitmap = bitmap)
    }

    fun setExportFormat(format: ExportFormat) {
        val current = _state.value as? HdrScreen.Result ?: return
        _state.value = current.copy(exportFormat = format, saveState = SaveState.Idle)
    }

    // ---------- Сохранение ----------

    fun save() {
        val current = _state.value as? HdrScreen.Result ?: return
        val image = full ?: return
        _state.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val ok = try {
                withContext(Dispatchers.IO) {
                    ExportRepository.save(getApplication(), current.edit.applyTo(image), current.exportFormat, namePrefix = "hdr").success
                }
            } catch (e: OutOfMemoryError) {
                false
            }
            val latest = _state.value as? HdrScreen.Result ?: return@launch
            _state.value = latest.copy(saveState = if (ok) SaveState.Success else SaveState.Failed)
        }
    }

    fun cancel() {
        job?.cancel()
        release()
        _state.value = HdrScreen.Picking()
    }

    fun reset() = cancel()

    private fun release() {
        full = null; preview = null
    }

    private companion object {
        const val PREVIEW_MAX_SIDE = 2000
        /** Выше разрешения любой реальной камеры - "без потолка" на первой попытке, но конкретное число (см. start()). */
        const val UNLIMITED_PIXELS = 100_000_000L
    }
}
