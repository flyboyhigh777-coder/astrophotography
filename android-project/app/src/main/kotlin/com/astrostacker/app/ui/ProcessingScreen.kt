package com.astrostacker.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.R
import com.astrostacker.core.ProgressUpdate
import com.astrostacker.core.Stage

/** Порядок стадий для общего (сквозного по всему пайплайну) прогресс-бара - см. [overallFraction]. */
private val STAGE_ORDER = listOf(
    Stage.LOAD, Stage.DETECT_STARS, Stage.REGISTER, Stage.GROUND, Stage.STACK, Stage.DONE
)

@Composable
fun ProcessingScreen(progress: ProgressUpdate, onCancel: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.processing_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(24.dp))

        Text(stageLabel(progress.stage), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))

        LinearProgressIndicator(
            progress = { overallFraction(progress) },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))

        Text(
            stringResource(R.string.processing_step_progress, progress.current, progress.total),
            style = MaterialTheme.typography.bodyMedium
        )

        Spacer(Modifier.height(32.dp))
        OutlinedButton(onClick = onCancel) {
            Text(stringResource(R.string.processing_cancel))
        }
    }
}

@Composable
private fun stageLabel(stage: Stage): String = when (stage) {
    Stage.LOAD -> stringResource(R.string.stage_load)
    Stage.DETECT_STARS -> stringResource(R.string.stage_detect_stars)
    Stage.REGISTER -> stringResource(R.string.stage_register)
    Stage.STACK -> stringResource(R.string.stage_stack)
    Stage.GROUND -> stringResource(R.string.stage_ground)
    Stage.DONE -> stringResource(R.string.stage_done)
}

/** Доля от 0 до 1 по ВСЕМУ пайплайну (не только по текущей стадии) - индекс стадии + прогресс внутри неё, делённые на общее число стадий. */
private fun overallFraction(progress: ProgressUpdate): Float {
    val stageIndex = STAGE_ORDER.indexOf(progress.stage).coerceAtLeast(0)
    val withinStage = if (progress.total > 0) progress.current.toFloat() / progress.total else 0f
    return ((stageIndex + withinStage) / STAGE_ORDER.size).coerceIn(0f, 1f)
}
