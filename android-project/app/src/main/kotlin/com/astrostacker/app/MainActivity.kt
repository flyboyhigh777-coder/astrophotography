package com.astrostacker.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.astrostacker.app.ui.AstroStackerRoot
import com.astrostacker.app.ui.PanoramaRoot
import com.astrostacker.app.ui.TrailRoot
import com.astrostacker.app.ui.theme.AstroStackerTheme
import com.astrostacker.app.ui.theme.GlassFill
import com.astrostacker.app.ui.theme.SegmentSelected
import com.astrostacker.app.ui.theme.TextMuted
import com.astrostacker.app.ui.theme.TextWhite
import com.astrostacker.app.ui.theme.VoidIndigo
import com.astrostacker.app.ui.theme.VoidNavy
import kotlin.math.cos
import kotlin.math.sin

/**
 * Единственная Activity. Три независимые вкладки внизу: "Астро" (стекинг
 * ночного неба, звёзды точками), "Панорама" (склейка панорам) и "Треки"
 * (звёздные треки - кадры НЕ совмещаются, вращение неба само рисует дуги) -
 * у каждой свой ViewModel, поэтому переключение вкладок не теряет состояние
 * остальных.
 */
class MainActivity : ComponentActivity() {

    private val astroViewModel: ProcessingViewModel by viewModels()
    private val panoramaViewModel: PanoramaViewModel by viewModels()
    private val trailViewModel: StarTrailViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AstroStackerTheme {
                var tab by rememberSaveable { mutableIntStateOf(0) }
                // Ночное небо: тёмно-синий -> фиолетовый -> почти чёрный градиент
                // вместо плоской чёрной заливки (см. референс) - виден сквозь все
                // экраны, т.к. сами они прозрачные поверх этого фона.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.verticalGradient(listOf(VoidIndigo, VoidNavy, VoidNavy)))
                ) {
                    Column(Modifier.fillMaxSize()) {
                        Box(Modifier.weight(1f)) {
                            when (tab) {
                                0 -> AstroStackerRoot(astroViewModel)
                                1 -> PanoramaRoot(panoramaViewModel)
                                else -> TrailRoot(trailViewModel)
                            }
                        }
                        NavigationBar(
                            containerColor = GlassFill,
                            contentColor = TextWhite
                        ) {
                            NavigationBarItem(
                                selected = tab == 0,
                                onClick = { tab = 0 },
                                icon = { StarIcon() },
                                label = { Text(stringResource(R.string.tab_astro)) },
                                colors = navColors()
                            )
                            NavigationBarItem(
                                selected = tab == 1,
                                onClick = { tab = 1 },
                                icon = { PanoramaIcon() },
                                label = { Text(stringResource(R.string.tab_panorama)) },
                                colors = navColors()
                            )
                            NavigationBarItem(
                                selected = tab == 2,
                                onClick = { tab = 2 },
                                icon = { TrailIcon() },
                                label = { Text(stringResource(R.string.tab_trails)) },
                                colors = navColors()
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun navColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = TextWhite,
    selectedTextColor = TextWhite,
    unselectedIconColor = TextMuted,
    unselectedTextColor = TextMuted,
    indicatorColor = SegmentSelected.copy(alpha = 0.22f)
)

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

@Composable
private fun TrailIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val w = size.width; val h = size.height
        val stroke = 2.dp.toPx()
        // Дуга (звёздный трек) вокруг маленькой неподвижной точки (полюс).
        val arc = Path().apply {
            addArc(androidx.compose.ui.geometry.Rect(w * 0.12f, h * 0.08f, w * 0.88f, h * 0.84f), startAngleDegrees = -150f, sweepAngleDegrees = 210f)
        }
        drawPath(arc, color, style = Stroke(stroke))
        drawCircle(color, radius = 2.dp.toPx(), center = Offset(w / 2, h * 0.46f))
    }
}
