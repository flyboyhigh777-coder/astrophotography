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
import com.astrostacker.core.FloatImage
import com.astrostacker.core.FrameInput
import com.astrostacker.core.Pipeline
import com.astrostacker.core.PipelineConfig
import com.astrostacker.core.PipelineResult
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

    data class Result(
        val pipelineResult: PipelineResult,
        val stretchTarget: Float,
        val noiseReductionEnabled: Boolean,
        val previewBitmap: Bitmap,
        val saveState: SaveState = SaveState.Idle,
        val isRecomputing: Boolean = false
    ) : ScreenState
}

enum class SaveState { Idle, Saving, Success, Failed }

sealed interface ErrorMessage {
    data class Generic(val detail: String) : ErrorMessage
    data class DecodeFailed(val fileName: String) : ErrorMessage
    object TooFewFrames : ErrorMessage
}

/**
 * Оркестрация: вызывает `:core` `Pipeline.run`/`Pipeline.postProcess` на
 * `Dispatchers.Default`, публикует прогресс и результат через [StateFlow].
 * Без WorkManager - см. обоснование в docs/ARCHITECTURE.md §2.2.
 */
class ProcessingViewModel(application: Application) : AndroidViewModel(application) {

    private val _screenState = MutableStateFlow<ScreenState>(ScreenState.Picking())
    val screenState: StateFlow<ScreenState> = _screenState.asStateFlow()

    private var processingJob: Job? = null
    private var postProcessJob: Job? = null

    /**
     * Линейный стек, сохранённый после успешного [startProcessing] - позволяет
     * [reapplyPostProcessing] пересчитывать только "художественную" часть
     * (растяжка/шумоподавление), не повторяя детекцию звёзд/регистрацию/сам
     * стекинг (самая долгая часть пайплайна и она не зависит от этих
     * параметров) - см. `Pipeline.postProcess` в `:core`.
     */
    private var cachedStackedLinear: FloatImage? = null

    /** Порядковый номер последнего запроса [reapplyPostProcessing] - см. комментарий там же (защита от гонки при быстрых повторных нажатиях). */
    private var postProcessRequestId = 0

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

                cachedStackedLinear = result.stackedLinear
                val bitmap = withContext(Dispatchers.Default) { ImageDecoding.floatImageToBitmap(result.finalImage) }
                val defaultConfig = PipelineConfig()
                _screenState.value = ScreenState.Result(
                    pipelineResult = result,
                    stretchTarget = defaultConfig.stretchTargetLevel.toFloat(),
                    noiseReductionEnabled = defaultConfig.applyNoiseReduction,
                    previewBitmap = bitmap
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

    /** Кнопка "Применить" на экране результата - пересчитывает только пост-обработку, см. [cachedStackedLinear]. */
    fun reapplyPostProcessing(stretchTarget: Float, noiseReductionEnabled: Boolean) {
        val stacked = cachedStackedLinear ?: return
        val current = _screenState.value as? ScreenState.Result ?: return
        _screenState.value = current.copy(isRecomputing = true)

        // Отменяем предыдущий незавершённый пересчёт - иначе быстрые повторные
        // нажатия "Применить" могут завершиться в другом порядке, чем были
        // запущены, и более старый (медленный) результат перезапишет более
        // новый. `cancel()` кооперативен (не останавливает уже выполняющийся
        // между точками приостановки код мгновенно), поэтому дополнительно
        // сверяем requestId перед финальной записью состояния - без этого
        // теоретически возможен короткий "мигающий" кадр от устаревшего
        // результата даже после отмены его Job.
        postProcessJob?.cancel()
        val requestId = ++postProcessRequestId
        postProcessJob = viewModelScope.launch {
            try {
                val config = PipelineConfig(
                    stretchTargetLevel = stretchTarget.toDouble(),
                    applyNoiseReduction = noiseReductionEnabled
                )
                val finalImage = withContext(Dispatchers.Default) { Pipeline.postProcess(stacked, config) }
                val bitmap = withContext(Dispatchers.Default) { ImageDecoding.floatImageToBitmap(finalImage) }
                if (requestId != postProcessRequestId) return@launch
                val latest = _screenState.value as? ScreenState.Result ?: return@launch
                _screenState.value = latest.copy(
                    pipelineResult = latest.pipelineResult.copy(finalImage = finalImage),
                    stretchTarget = stretchTarget,
                    noiseReductionEnabled = noiseReductionEnabled,
                    previewBitmap = bitmap,
                    isRecomputing = false
                )
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    fun saveResult() {
        val current = _screenState.value as? ScreenState.Result ?: return
        _screenState.value = current.copy(saveState = SaveState.Saving)
        viewModelScope.launch {
            val success = withContext(Dispatchers.IO) {
                ExportRepository.saveToGallery(getApplication<Application>(), current.previewBitmap)
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
        postProcessJob?.cancel()
        cachedStackedLinear = null
        _screenState.value = ScreenState.Picking()
    }
}
