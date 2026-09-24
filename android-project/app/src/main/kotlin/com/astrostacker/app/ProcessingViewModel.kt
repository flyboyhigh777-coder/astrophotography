package com.astrostacker.app

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.astrostacker.app.data.ExportRepository
import com.astrostacker.app.data.ImageDecoding
import com.astrostacker.app.data.MemoryBudget
import com.astrostacker.core.DarkFrameCalibrator
import com.astrostacker.core.FrameInput
import com.astrostacker.core.FrameOutcome
import com.astrostacker.core.Pipeline
import com.astrostacker.core.PipelineConfig
import com.astrostacker.core.ProgressUpdate
import com.astrostacker.core.Stage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Состояния экрана - единственный источник истины для навигации: вместо
 * Navigation-Compose (см. docs/ARCHITECTURE.md §2.2) `AstroStackerRoot` просто
 * переключает композируемую функцию через `when` по текущему [ScreenState].
 */
sealed interface ScreenState {

    /** Выбор кадров (первый экран). [previousError], если есть - что пошло не так в прошлый раз, для показа плашки на этом же экране. */
    data class Picking(
        val lightFrames: List<Uri> = emptyList(),
        val darkFrames: List<Uri> = emptyList(),
        val previousError: ErrorMessage? = null
    ) : ScreenState

    data class Processing(val progress: ProgressUpdate, val totalFrames: Int) : ScreenState

    /**
     * Оба варианта результата посчитаны заранее, переключатель на экране
     * мгновенный: [groundFrozenBitmap] - небо из стека + земля из первого
     * кадра, [skyOnlyBitmap] - просто все кадры, совмещённые по звёздам.
     */
    data class Result(
        val frameOutcomes: List<FrameOutcome>,
        val groundFrozenBitmap: Bitmap,
        val skyOnlyBitmap: Bitmap,
        val freezeGround: Boolean = true,
        val saveState: SaveState = SaveState.Idle
    ) : ScreenState {
        val shownBitmap: Bitmap get() = if (freezeGround) groundFrozenBitmap else skyOnlyBitmap
    }
}

enum class SaveState { Idle, Saving, Success, Failed }

sealed interface ErrorMessage {
    data class Generic(val detail: String) : ErrorMessage
    data class DecodeFailed(val fileName: String) : ErrorMessage
    object TooFewFrames : ErrorMessage
}

/**
 * Оркестрация: вызывает `:core` `Pipeline.run` на
 * `Dispatchers.Default`, публикует прогресс и результат через [StateFlow].
 * Без WorkManager - см. обоснование в docs/ARCHITECTURE.md §2.2.
 */
class ProcessingViewModel(application: Application) : AndroidViewModel(application) {

    private val _screenState = MutableStateFlow<ScreenState>(ScreenState.Picking())
    val screenState: StateFlow<ScreenState> = _screenState.asStateFlow()

    private var processingJob: Job? = null

    fun updateLightFrames(uris: List<Uri>) {
        (_screenState.value as? ScreenState.Picking)?.let { _screenState.value = it.copy(lightFrames = uris) }
    }

    fun updateDarkFrames(uris: List<Uri>) {
        (_screenState.value as? ScreenState.Picking)?.let { _screenState.value = it.copy(darkFrames = uris) }
    }

    fun startProcessing() {
        val picking = _screenState.value as? ScreenState.Picking ?: return
        if (picking.lightFrames.size < 2) {
            _screenState.value = picking.copy(previousError = ErrorMessage.TooFewFrames)
            return
        }

        val totalFrames = picking.lightFrames.size
        processingJob = viewModelScope.launch {
            _screenState.value = ScreenState.Processing(ProgressUpdate(Stage.DETECT_STARS, 0, totalFrames), totalFrames)
            try {
                val context = getApplication<Application>()
                val budget = MemoryBudget.compute(totalFrames)

                val decodedLight = withContext(Dispatchers.IO) {
                    picking.lightFrames.map { uri -> ImageDecoding.decodeFrame(context, uri, budget.maxTotalPixels) }
                }
                val failedFrame = decodedLight.firstOrNull { it.image == null }
                if (failedFrame != null) {
                    _screenState.value = picking.copy(previousError = ErrorMessage.DecodeFailed(failedFrame.displayName))
                    return@launch
                }

                var frameInputs = decodedLight.map { FrameInput(it.image!!, it.captureEpochSeconds) }

                if (picking.darkFrames.isNotEmpty()) {
                    val darkImages = withContext(Dispatchers.IO) {
                        picking.darkFrames.mapNotNull { uri -> ImageDecoding.decodeFrame(context, uri, budget.maxTotalPixels).image }
                    }
                    if (darkImages.isNotEmpty()) {
                        frameInputs = withContext(Dispatchers.Default) {
                            val hotPixelMask = DarkFrameCalibrator.buildHotPixelMask(darkImages.map { it.luminance() })
                            frameInputs.map { it.copy(image = DarkFrameCalibrator.applyCalibration(it.image, hotPixelMask)) }
                        }
                    }
                    // Если ни один тёмный кадр не декодировался - молча
                    // продолжаем БЕЗ калибровки, а не падаем: калибровка по
                    // тёмным кадрам необязательна (см. DarkFrameCalibrator в
                    // :core), тогда как отсутствие светлых кадров - фатально.
                }

                val result = withContext(Dispatchers.Default) {
                    Pipeline.run(frameInputs, PipelineConfig()) { progress ->
                        _screenState.value = ScreenState.Processing(progress, totalFrames)
                    }
                }

                val (frozen, skyOnly) = withContext(Dispatchers.Default) {
                    ImageDecoding.floatImageToBitmap(result.finalImage) to
                        ImageDecoding.floatImageToBitmap(result.stackedLinear)
                }
                _screenState.value = ScreenState.Result(
                    frameOutcomes = result.frameOutcomes,
                    groundFrozenBitmap = frozen,
                    skyOnlyBitmap = skyOnly
                )
            } catch (e: CancellationException) {
                throw e // отмену корутины нельзя "проглатывать" - см. cancelProcessing()
            } catch (e: IllegalArgumentException) {
                // Pipeline.run падает с require() именно с таким текстом при
                // нехватке успешно зарегистрированных кадров - отдельная,
                // осмысленная пользователю ошибка, а не общая "что-то пошло не так".
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
        _screenState.value = current.copy(freezeGround = enabled, saveState = SaveState.Idle)
    }

    fun saveResult() {
        val current = _screenState.value as? ScreenState.Result ?: return
        _screenState.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val success = withContext(Dispatchers.IO) {
                ExportRepository.saveToGallery(getApplication<Application>(), current.shownBitmap)
            }
            val latest = _screenState.value as? ScreenState.Result ?: return@launch
            _screenState.value = latest.copy(saveState = if (success) SaveState.Success else SaveState.Failed)
        }
    }

    fun dismissError() {
        (_screenState.value as? ScreenState.Picking)?.let { _screenState.value = it.copy(previousError = null) }
    }

    fun reset() {
        processingJob?.cancel()
        _screenState.value = ScreenState.Picking()
    }
}
