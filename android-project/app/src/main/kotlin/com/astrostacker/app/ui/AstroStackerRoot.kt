package com.astrostacker.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.astrostacker.app.ProcessingViewModel
import com.astrostacker.app.ScreenState

/**
 * Корневой композабл: подписывается на [ProcessingViewModel.screenState] и
 * переключает экран простым `when` - см. docs/ARCHITECTURE.md §2.2 (почему
 * без Navigation-Compose).
 *
 * [Surface] обязателен: он задаёт фон и цвет текста по умолчанию
 * (onBackground = белый). Без него `Text` рисуется чёрным поверх тёмного фона.
 */
@Composable
fun AstroStackerRoot(viewModel: ProcessingViewModel) {
    val state by viewModel.screenState.collectAsState()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground
    ) {
        when (val current = state) {
            is ScreenState.Picking -> FramePickerScreen(
                state = current,
                onLightFramesSelected = viewModel::updateLightFrames,
                onDarkFramesSelected = viewModel::updateDarkFrames,
                onBiasFramesSelected = viewModel::updateBiasFrames,
                onFlatFramesSelected = viewModel::updateFlatFrames,
                onGroundFramesSelected = viewModel::updateGroundFrames,
                onStartProcessing = viewModel::startProcessing,
                onDismissError = viewModel::dismissError
            )
            is ScreenState.Processing -> ProcessingScreen(
                progress = current.progress,
                onCancel = viewModel::cancelProcessing
            )
            is ScreenState.Result -> ResultScreen(
                state = current,
                onFreezeGroundChanged = viewModel::setFreezeGround,
                onEdit = viewModel::openEditor,
                onFormatChanged = viewModel::setExportFormat,
                onSave = viewModel::saveResult,
                onReset = viewModel::reset
            )
            is ScreenState.Editing -> EditScreen(
                state = current.editor,
                onRotateQuarter = viewModel::editorRotateQuarter,
                onStraighten = viewModel::editorStraighten,
                onCropChange = viewModel::editorSetCrop,
                onAspect = viewModel::editorSetAspect,
                onReset = viewModel::editorReset,
                onCancel = viewModel::editorCancel,
                onApply = viewModel::editorApply
            )
        }
    }
}
