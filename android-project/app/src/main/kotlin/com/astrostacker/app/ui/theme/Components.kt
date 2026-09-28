package com.astrostacker.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp

/**
 * Заголовок экрана на сине-фиолетовой градиентной "таблетке" вместо голого
 * текста на чёрном фоне (см. Options/Share-панель в референсе). Замена
 * "Text(title, headlineSmall)" 1-в-1: тот же текст в Text - существующие
 * UI-тесты, которые ищут заголовок по строке, продолжают работать.
 */
@Composable
fun GradientTopBar(title: String, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(GradientBlue, GradientPurple)))
            .padding(vertical = 16.dp, horizontal = 20.dp)
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = TextWhite)
    }
}

/**
 * "Стеклянная" карточка для группы настроек (Порядок кадров/Стиль/Разрешение
 * и т.п.) - полупрозрачная заливка + тонкая обводка поверх градиентного фона,
 * как сгруппированные блоки в референсе, вместо голых заголовков прямо на
 * фоне.
 */
@Composable
fun GlassCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(GlassFill)
            .border(1.dp, GlassBorder, RoundedCornerShape(20.dp))
            .padding(16.dp)
    ) {
        content()
    }
}
