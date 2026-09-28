package com.astrostacker.app

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astrostacker.app.data.ExportFormat
import com.astrostacker.app.data.ExportRepository
import com.astrostacker.app.data.ImageDecoding
import com.astrostacker.core.CropRect
import com.astrostacker.core.EditParams
import com.astrostacker.core.Rgb16Image
import com.astrostacker.core.pano.PanoAlignment
import com.astrostacker.core.pano.PanoConfig
import com.astrostacker.core.pano.PanoImage
import com.astrostacker.core.pano.PanoProgress
import com.astrostacker.core.pano.PanoProjection
import com.astrostacker.core.pano.PanoRender
import com.astrostacker.core.pano.PanoStage
import com.astrostacker.core.pano.PanoramaStitcher
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface PanoScreen {
    data class Picking(
        val photos: List<Uri> = emptyList(),
        val error: String? = null,
        /** null - "Авто" (выбрать проекцию по фактическому охвату после склейки, как раньше). */
        val preferredProjection: PanoProjection? = null
    ) : PanoScreen

    data class Processing(val progress: PanoProgress) : PanoScreen

    data class Result(
        val previewBitmap: Bitmap,
        val includedCount: Int,
        val totalCount: Int,
        val projection: PanoProjection,
        val horizontalDeg: Double,
        val verticalDeg: Double,
        val autoCropEnabled: Boolean = true,
        val edit: EditParams = EditParams(),
        // TIFF16 по умолчанию, а не JPEG - см. StarTrailViewModel/ProcessingViewModel:
        // JPEG (8 бит, lossy) режет как раз то, ради чего собирали склейку.
        val exportFormat: ExportFormat = ExportFormat.TIFF16,
        val saveState: SaveState = SaveState.Idle,
        val isRendering: Boolean = false,
        val outputWidth: Int = 0,
        val outputHeight: Int = 0
    ) : PanoScreen

    data class Editing(val result: Result, val editor: EditorUiState) : PanoScreen
}

/**
 * Вкладка "Панорама": чтение фото -> склейка (:core PanoramaStitcher) ->
 * результат с обрезкой пустых краёв, поворотом/обрезкой и сохранением.
 * Совмещение кадров сохраняется, поэтому смена проекции - только перерисовка.
 */
class PanoramaViewModel(application: Application) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<PanoScreen>(PanoScreen.Picking())
    val state: StateFlow<PanoScreen> = _state.asStateFlow()

    private var job: Job? = null
    private var images: List<PanoImage> = emptyList()
    private var alignment: PanoAlignment? = null
    private var full: Rgb16Image? = null
    private var autoCrop: CropRect = CropRect.FULL
    private var preview: Rgb16Image? = null

    fun updatePhotos(uris: List<Uri>) {
        (_state.value as? PanoScreen.Picking)?.let { _state.value = it.copy(photos = uris, error = null) }
    }

    fun dismissError() {
        (_state.value as? PanoScreen.Picking)?.let { _state.value = it.copy(error = null) }
    }

    /** [projection] - null возвращает к "Авто" (выбрать по фактическому охвату после склейки). */
    fun setPreferredProjection(projection: PanoProjection?) {
        (_state.value as? PanoScreen.Picking)?.let { _state.value = it.copy(preferredProjection = projection) }
    }

    fun start() {
        val picking = _state.value as? PanoScreen.Picking ?: return
        if (picking.photos.size < 2) return
        val total = picking.photos.size
        job = viewModelScope.launch {
            _state.value = PanoScreen.Processing(PanoProgress(PanoStage.LOAD, 0, total))
            try {
                val context = getApplication<Application>()
                val heap = Runtime.getRuntime().maxMemory()
                // ~55% кучи на входные кадры (4 байта/пиксель), не больше 48 Мп на кадр -
                // выше практического разрешения телефонных камер, так что реальные фото
                // почти никогда не режутся; потолок - лишь страховка от OOM на экстремальных
                // сериях (largeHeap уже включён в манифесте, к тому же выше по коду есть
                // отдельный catch (OutOfMemoryError) с понятным сообщением пользователю).
                val perImage = (heap * 0.55 / 4 / total).toLong().coerceIn(640L * 480, 48_000_000L)
                val loaded = ArrayList<PanoImage>()
                for ((i, uri) in picking.photos.withIndex()) {
                    val img = withContext(Dispatchers.IO) { ImageDecoding.decodePanoImage(context, uri, perImage) }
                        ?: run {
                            _state.value = picking.copy(error = "не удалось прочитать фото №${i + 1}")
                            return@launch
                        }
                    loaded.add(img)
                    _state.value = PanoScreen.Processing(PanoProgress(PanoStage.LOAD, i + 1, total))
                }
                images = loaded
                val config = PanoConfig(maxOutputPixels = outputBudget())
                alignment = withContext(Dispatchers.Default) {
                    PanoramaStitcher.align(images, config) { _state.value = PanoScreen.Processing(it) }
                }
                val (h, v) = PanoRender.angularExtent(images, alignment!!)
                // Пользователь мог выбрать проекцию ДО склейки, когда фактический охват ещё
                // не известен - если выбор оказался слабее нужного (см. clampProjection),
                // подстраховываемся минимально необходимой вместо размазанного результата.
                val projection = picking.preferredProjection
                    ?.let { PanoRender.clampProjection(it, h, v) }
                    ?: PanoRender.autoProjection(h, v)
                renderAndShow(projection, h, v, null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: OutOfMemoryError) {
                release()
                _state.value = picking.copy(error = "не хватило памяти - выберите меньше фото")
            } catch (e: Exception) {
                release()
                _state.value = picking.copy(error = e.message ?: e.toString())
            }
        }
    }

    /** ~35% кучи под результат (6 байт/пиксель), не больше 100 Мп. */
    private fun outputBudget(): Long = (Runtime.getRuntime().maxMemory() * 0.35 / 6).toLong().coerceIn(2_000_000L, 100_000_000L)

    private suspend fun renderAndShow(projection: PanoProjection, hDeg: Double, vDeg: Double, previous: PanoScreen.Result?) {
        val align = alignment ?: return
        if (previous == null) _state.value = PanoScreen.Processing(PanoProgress(PanoStage.RENDER, 0, 100))
        val rendered = withContext(Dispatchers.Default) {
            full = null; preview = null // освобождаем прошлый результат до отрисовки нового
            PanoRender.render(images, align, projection, outputBudget()) { p ->
                if (previous == null) _state.value = PanoScreen.Processing(PanoProgress(PanoStage.RENDER, (p * 100).toInt(), 100))
            }
        }
        full = rendered.image
        autoCrop = rendered.autoCrop
        preview = withContext(Dispatchers.Default) { rendered.image.downscale(PREVIEW_MAX_SIDE) }
        val base = previous?.copy(projection = projection, edit = EditParams(), isRendering = false, saveState = SaveState.Idle)
            ?: PanoScreen.Result(
                previewBitmap = placeholder(),
                includedCount = align.alignedCount,
                totalCount = images.size,
                projection = projection,
                horizontalDeg = hDeg,
                verticalDeg = vDeg
            )
        _state.value = withPreview(base)
    }

    private fun placeholder(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

    /** Пересчитывает превью и размеры итогового файла под текущие настройки результата. */
    private suspend fun withPreview(r: PanoScreen.Result): PanoScreen.Result {
        val src = preview ?: return r
        val bitmap = withContext(Dispatchers.Default) { ImageDecoding.rgb16ToBitmap(r.edit.applyTo(sourceCrop(src, r.autoCropEnabled))) }
        val fw = full?.width ?: 0; val fh = full?.height ?: 0
        val crop = if (r.autoCropEnabled) autoCrop else CropRect.FULL
        val baseW = ((crop.right - crop.left) * fw).toInt(); val baseH = ((crop.bottom - crop.top) * fh).toInt()
        val turned = r.edit.quarterTurns % 2 == 1
        val (w, h) = if (turned) baseH to baseW else baseW to baseH
        val c = r.edit.crop
        return r.copy(
            previewBitmap = bitmap,
            outputWidth = (w * (c.right - c.left)).toInt(),
            outputHeight = (h * (c.bottom - c.top)).toInt()
        )
    }

    private fun sourceCrop(img: Rgb16Image, autoCropEnabled: Boolean) = if (autoCropEnabled) img.crop(autoCrop) else img

    fun setProjection(choice: PanoProjection) {
        val current = _state.value as? PanoScreen.Result ?: return
        if (choice == current.projection || current.isRendering) return
        _state.value = current.copy(isRendering = true)
        viewModelScope.launch {
            try {
                renderAndShow(choice, current.horizontalDeg, current.verticalDeg, current)
            } catch (e: OutOfMemoryError) {
                _state.value = current.copy(isRendering = false)
            }
        }
    }

    fun setAutoCrop(enabled: Boolean) {
        val current = _state.value as? PanoScreen.Result ?: return
        viewModelScope.launch { _state.value = withPreview(current.copy(autoCropEnabled = enabled, edit = EditParams(), saveState = SaveState.Idle)) }
    }

    fun setExportFormat(format: ExportFormat) {
        val current = _state.value as? PanoScreen.Result ?: return
        _state.value = current.copy(exportFormat = format, saveState = SaveState.Idle)
    }

    // ---------- Повернуть и обрезать (общая логика с вкладкой "Астро") ----------

    private fun editorBase(r: PanoScreen.Result, turns: Int): Bitmap =
        ImageDecoding.rgb16ToBitmap(sourceCrop(preview!!, r.autoCropEnabled).rotateQuarterTurns(turns))

    fun openEditor() {
        val current = _state.value as? PanoScreen.Result ?: return
        if (preview == null) return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(current, current.edit.quarterTurns) }
            _state.value = PanoScreen.Editing(current, EditorLogic.open(base, current.edit))
        }
    }

    fun editorRotateQuarter(delta: Int) {
        val e = _state.value as? PanoScreen.Editing ?: return
        val turns = ((e.editor.draft.quarterTurns + delta) % 4 + 4) % 4
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(e.result, turns) }
            _state.value = e.copy(editor = EditorLogic.rotated(base, turns, e.editor.draft.straightenDegrees))
        }
    }

    fun editorStraighten(degrees: Float) = updateEditor { EditorLogic.straighten(it, degrees) }
    fun editorSetCrop(crop: CropRect) = updateEditor { EditorLogic.setCrop(it, crop) }
    fun editorSetAspect(ratio: Float?) = updateEditor { EditorLogic.setAspect(it, ratio) }

    private fun updateEditor(change: (EditorUiState) -> EditorUiState) {
        val e = _state.value as? PanoScreen.Editing ?: return
        _state.value = e.copy(editor = change(e.editor))
    }

    fun editorReset() {
        val e = _state.value as? PanoScreen.Editing ?: return
        viewModelScope.launch {
            val base = withContext(Dispatchers.Default) { editorBase(e.result, 0) }
            _state.value = e.copy(editor = EditorUiState(base, EditParams()))
        }
    }

    fun editorCancel() {
        val e = _state.value as? PanoScreen.Editing ?: return
        _state.value = e.result
    }

    fun editorApply() {
        val e = _state.value as? PanoScreen.Editing ?: return
        viewModelScope.launch { _state.value = withPreview(e.result.copy(edit = e.editor.draft, saveState = SaveState.Idle)) }
    }

    // ---------- Сохранение ----------

    fun save() {
        val current = _state.value as? PanoScreen.Result ?: return
        val image = full ?: return
        _state.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val ok = try {
                withContext(Dispatchers.IO) {
                    val edited = current.edit.applyTo(sourceCrop(image, current.autoCropEnabled))
                    ExportRepository.save(getApplication(), edited, current.exportFormat, namePrefix = "panorama").success
                }
            } catch (e: OutOfMemoryError) {
                false
            }
            val latest = _state.value as? PanoScreen.Result ?: return@launch
            _state.value = latest.copy(saveState = if (ok) SaveState.Success else SaveState.Failed)
        }
    }

    fun cancel() {
        job?.cancel()
        release()
        _state.value = PanoScreen.Picking()
    }

    fun reset() = cancel()

    private fun release() {
        images = emptyList(); alignment = null; full = null; preview = null; autoCrop = CropRect.FULL
    }

    private companion object {
        const val PREVIEW_MAX_SIDE = 2000
    }
}
