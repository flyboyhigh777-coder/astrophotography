package com.astrostacker.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Фиксированная тёмная схема в духе референса (ночное небо: синий/фиолетовый
 * градиент, "стеклянные" полупрозрачные карточки) вместо плоского
 * чёрно-красного. Без учёта системной темы и без Material You.
 *
 * primary/secondary/tertiary = светлый почти-белый тон: это цвет ЗАЛИВКИ
 * выбранного сегмента в группах-переключателях (Button = выбрано,
 * OutlinedButton = нет - см. ChoiceChip и аналогичные пары по вкладкам),
 * как светлая "таблетка" в референсе, а не сплошная яркая кнопка.
 */
private val AstroColorScheme = darkColorScheme(
    primary = SegmentSelected,
    onPrimary = SegmentSelectedText,
    primaryContainer = NightSurfaceHigh,
    onPrimaryContainer = TextWhite,
    secondary = SegmentSelected,
    onSecondary = SegmentSelectedText,
    tertiary = GradientPurple,
    onTertiary = TextWhite,
    background = VoidNavy,
    onBackground = TextWhite,
    surface = NightSurface,
    onSurface = TextWhite,
    surfaceVariant = NightSurfaceHigh,
    onSurfaceVariant = TextMuted,
    outline = OutlineGray,
    error = Color(0xFFFF6B6B),
    onError = TextWhite,
    errorContainer = Color(0xFF4A1F2E),
    onErrorContainer = TextWhite
)

@Composable
fun AstroStackerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AstroColorScheme,
        typography = AstroTypography,
        content = content
    )
}
