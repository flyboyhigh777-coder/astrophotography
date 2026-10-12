package com.astrostacker.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.astrostacker.app.ProcessingViewModel
import com.astrostacker.app.ScreenState

/**
 * Корневой композабл: подписывается на [ProcessingViewModel.screenState] и
 * переключает экран простым `when` - см. docs/ARCHITECTURE.md §2.2 (почему
 * без Navigation-Compose). Без обёртки в свой Surface - фон (градиент) и
 * цвет текста по умолчанию уже задаёт MainActivity на весь экран, тот же
 * приём, что и у PanoramaRoot/TrailRoot; отдельный Surface здесь поверх
 * перекрывал бы градиент сплошной заливкой.
 */
@Composable
fun AstroStackerRoot(viewModel: ProcessingViewModel) {
    val state by viewModel.screenState.collectAsState()

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
            onReset = viewModel::reset,
            onCardTitleChanged = viewModel::setCardTitle,
            onShareCard = viewModel::shareCard
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
