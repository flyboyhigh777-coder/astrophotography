package com.astrostacker.core

/**
 * Один кадр серии для стекинга: изображение + преобразование В координаты
 * ОПОРНОГО кадра (см. FrameRegistrator: apply(точка_кадра) = точка_в_опорном_кадре).
 */
data class StackFrame(val image: FloatImage, val toReference: Transform2D)

/**
 * Стекинг по горизонтальным полосам выходного изображения — в реальном
 * приложении (см. docs/ARCHITECTURE.md §4) в память одновременно попадает не
 * целый кадр из каждого источника, а только полоса, нужная для текущего
 * тайла. Здесь работает поверх уже загруженных [FloatImage] (в приложении на
 * их месте будет региональный декодер Android — `BitmapRegionDecoder`), но
 * САМА логика тайлинга и её результат идентичны — это же используется для
 * теста "тайлинг не меняет результат" (см. StackCombinerTest).
 */
object TiledStacker {

    fun stack(
        outputWidth: Int,
        outputHeight: Int,
        frames: List<StackFrame>,
        combinerConfig: StackCombinerConfig = StackCombinerConfig(),
        tileHeight: Int = outputHeight
    ): FloatImage {
        val outR = FloatArray(outputWidth * outputHeight)
        val outG = FloatArray(outputWidth * outputHeight)
        val outB = FloatArray(outputWidth * outputHeight)

        val inverses = frames.map { it.toReference.inverse() }

        var y0 = 0
        while (y0 < outputHeight) {
            val y1 = (y0 + tileHeight).coerceAtMost(outputHeight)
            for (y in y0 until y1) {
                for (x in 0 until outputWidth) {
                    val outIdx = y * outputWidth + x
                    val rVals = ArrayList<Float>(frames.size)
                    val gVals = ArrayList<Float>(frames.size)
                    val bVals = ArrayList<Float>(frames.size)
                    for (fi in frames.indices) {
                        val src = inverses[fi].apply(Vec2(x.toDouble(), y.toDouble()))
                        val sample = frames[fi].image.sampleBilinear(src.x, src.y) ?: continue
                        rVals.add(sample[0]); gVals.add(sample[1]); bVals.add(sample[2])
                    }
                    outR[outIdx] = StackCombiner.combine(rVals.toFloatArray(), combinerConfig)
                    outG[outIdx] = StackCombiner.combine(gVals.toFloatArray(), combinerConfig)
                    outB[outIdx] = StackCombiner.combine(bVals.toFloatArray(), combinerConfig)
                }
            }
            y0 = y1
        }

        return FloatImage(outputWidth, outputHeight, outR, outG, outB)
    }
}
