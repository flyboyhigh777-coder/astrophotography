package com.astrostacker.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.ui.AstroStackerRoot
import com.astrostacker.app.ui.PanoramaRoot
import com.astrostacker.app.ui.theme.AstroStackerTheme
import kotlin.math.cos
import kotlin.math.sin

/**
 * Единственная Activity. Две независимые вкладки внизу: "Астро" (стекинг
 * ночного неба) и "Панорама" (склейка панорам) - у каждой свой ViewModel,
 * поэтому переключение вкладок не теряет состояние другой.
 */
class MainActivity : ComponentActivity() {

    private val astroViewModel: ProcessingViewModel by viewModels()
    private val panoramaViewModel: PanoramaViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AstroStackerTheme {
                var tab by rememberSaveable { mutableIntStateOf(0) }
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                    contentColor = MaterialTheme.colorScheme.onBackground
                ) {
                    Column {
                        Box(Modifier.weight(1f)) {
                            when (tab) {
                                0 -> AstroStackerRoot(astroViewModel)
                                else -> PanoramaRoot(panoramaViewModel)
                            }
                        }
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                            NavigationBarItem(
                                selected = tab == 0,
                                onClick = { tab = 0 },
                                icon = { StarIcon() },
                                label = { Text(stringResource(R.string.tab_astro)) }
                            )
                            NavigationBarItem(
                                selected = tab == 1,
                                onClick = { tab = 1 },
                                icon = { PanoramaIcon() },
                                label = { Text(stringResource(R.string.tab_panorama)) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StarIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val c = Offset(size.width / 2, size.height / 2)
        val outer = size.minDimension * 0.46f; val inner = outer * 0.42f
        val path = Path()
        for (k in 0 until 10) {
            val r = if (k % 2 == 0) outer else inner
            val a = Math.toRadians(-90.0 + k * 36.0)
            val p = Offset(c.x + r * cos(a).toFloat(), c.y + r * sin(a).toFloat())
            if (k == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
        }
        path.close()
        drawPath(path, color)
    }
}

@Composable
private fun PanoramaIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val w = size.width; val h = size.height
        val stroke = 2.dp.toPx()
        drawRoundRect(color, Offset(1f, h * 0.25f), Size(w - 2f, h * 0.5f), androidx.compose.ui.geometry.CornerRadius(3.dp.toPx()), style = Stroke(stroke))
        val m = Path().apply {
            moveTo(w * 0.12f, h * 0.68f); lineTo(w * 0.35f, h * 0.42f); lineTo(w * 0.52f, h * 0.6f)
            lineTo(w * 0.68f, h * 0.45f); lineTo(w * 0.88f, h * 0.68f)
        }
        drawPath(m, color, style = Stroke(stroke))
    }
}
