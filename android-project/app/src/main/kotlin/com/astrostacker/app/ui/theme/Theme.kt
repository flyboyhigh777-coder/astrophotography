package com.astrostacker.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * Фиксированная тёмная схема: почти чёрный фон, белый текст, ярко-красный
 * акцент (красный меньше всего сбивает ночное зрение). Без учёта системной
 * темы и без Material You (dynamic color).
 */
private val AstroColorScheme = darkColorScheme(
    primary = AccentRed,
    onPrimary = TextWhite,
    primaryContainer = AccentRedDark,
    onPrimaryContainer = TextWhite,
    secondary = AccentRed,
    onSecondary = TextWhite,
    tertiary = AccentRed,
    onTertiary = TextWhite,
    background = NightBlack,
    onBackground = TextWhite,
    surface = NightSurface,
    onSurface = TextWhite,
    surfaceVariant = NightSurfaceHigh,
    onSurfaceVariant = TextMuted,
    outline = OutlineGray,
    error = AccentRed,
    onError = TextWhite,
    errorContainer = AccentRedDark,
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
