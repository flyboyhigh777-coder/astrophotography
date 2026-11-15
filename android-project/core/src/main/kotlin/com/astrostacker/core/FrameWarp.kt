package com.astrostacker.core

/**
 * Разворачивает каждый кадр серии В СИСТЕМУ КООРДИНАТ опорного кадра (см.
 * [StackFrame]) - то же обратное отображение и билинейная выборка, что и у
 * [TiledStacker], но результат - готовые выровненные кадры целиком, а не
 * сразу объединённое значение одного пикселя. Нужно там, где объединение
 * само смотрит на соседние пиксели (см. [ExposureFusion] - пирамида Лапласа
 * строится по целому кадру), а не только на один и тот же пиксель всех
 * кадров сразу (как [StackCombiner] в [TiledStacker]).
 *
 * Пиксели за пределами исходного кадра берутся из ближайшего края (без
 * дыр) - кадры одной HDR-серии снимаются почти без смещения, край в один-два
 * пикселя чуть теряет точность, но не оставляет пустых областей, которые
 * пришлось бы потом как-то обрезать или закрашивать.
 */
object FrameWarp {

    fun warpAll(outputWidth: Int, outputHeight: Int, frames: List<StackFrame>): List<FloatImage> =
        frames.map { warp(outputWidth, outputHeight, it) }

    private fun warp(outputWidth: Int, outputHeight: Int, frame: StackFrame): FloatImage {
        val inverse = frame.toReference.inverse()
        val src = frame.image
        val r = FloatArray(outputWidth * outputHeight)
        val g = FloatArray(outputWidth * outputHeight)
        val b = FloatArray(outputWidth * outputHeight)
        for (y in 0 until outputHeight) for (x in 0 until outputWidth) {
            val p = inverse.apply(Vec2(x.toDouble(), y.toDouble()))
            val cx = p.x.coerceIn(0.0, src.width - 1.0)
            val cy = p.y.coerceIn(0.0, src.height - 1.0)
            val sample = src.sampleBilinear(cx, cy)!! // внутри диапазона после coerceIn - не null
            val idx = y * outputWidth + x
            r[idx] = sample[0]; g[idx] = sample[1]; b[idx] = sample[2]
        }
        return FloatImage(outputWidth, outputHeight, r, g, b)
    }
}
