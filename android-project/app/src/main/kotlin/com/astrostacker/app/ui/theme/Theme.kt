package com.astrostacker.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/**
 * Фиксированная тёмная "космическая" цветовая схема - без учёта системной
 * темы и без Material You (dynamic color, Android 12+). Съёмка и обработка
 * астрофото происходит ночью и часто под открытым небом - светлая тема здесь
 * не нужна ни при каких системных настройках, только мешала бы глазам и
 * засвечивала бы кадрирование на экране в темноте.
 */
private val AstroColorScheme = darkColorScheme(
    primary = NebulaTeal,
    onPrimary = SpaceBlack,
    secondary = NebulaViolet,
    onSecondary = StarWhite,
    tertiary = WarningAmber,
    onTertiary = SpaceBlack,
    background = SpaceBlack,
    onBackground = StarWhite,
    surface = SpaceNavy,
    onSurface = StarWhite,
    error = WarningAmber,
    onError = SpaceBlack
)

@Composable
fun AstroStackerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AstroColorScheme,
        typography = AstroTypography,
        content = content
    )
}
