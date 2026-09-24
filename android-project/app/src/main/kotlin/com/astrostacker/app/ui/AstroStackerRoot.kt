package com.astrostacker.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.astrostacker.app.ProcessingViewModel
import com.astrostacker.app.ScreenState

/**
 * Корневой композабл: подписывается на [ProcessingViewModel.screenState] и
 * переключает экран простым `when` - см. docs/ARCHITECTURE.md §2.2 (почему
 * без Navigation-Compose).
 */
@Composable
fun AstroStackerRoot(viewModel: ProcessingViewModel) {
    val state by viewModel.screenState.collectAsState()

    when (val current = state) {
        is ScreenState.Picking -> FramePickerScreen(
            state = current,
            onLightFramesSelected = viewModel::updateLightFrames,
            onDarkFramesSelected = viewModel::updateDarkFrames,
            onStartProcessing = viewModel::startProcessing,
            onDismissError = viewModel::dismissError
        )
        is ScreenState.Processing -> ProcessingScreen(
            progress = current.progress,
            onCancel = viewModel::cancelProcessing
        )
        is ScreenState.Result -> ResultScreen(
            state = current,
            onApply = viewModel::reapplyPostProcessing,
            onSave = viewModel::saveResult,
            onReset = viewModel::reset
        )
    }
}
