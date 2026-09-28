package com.astrostacker.app.data

/**
 * Сколько пикселей на кадр можно позволить исходя из лимита кучи ПРИЛОЖЕНИЯ и
 * числа кадров в серии. См. docs/ARCHITECTURE.md §4 - честная граница
 * текущей реализации: `:core` `Pipeline.run` держит все N кадров разжатыми в
 * `FloatImage` ОДНОВРЕМЕННО (без пофрагментного стриминга - `StackFrame`
 * хранит ссылку на тот же `FloatImage`, не копию, см. `TiledStacker.kt`),
 * поэтому бюджет считается на ВСЮ серию сразу, а не на кадр по отдельности.
 *
 * Используется `Runtime.getRuntime().maxMemory()` (лимит кучи ЭТОГО процесса),
 * а не `ActivityManager.getMemoryInfo()` (свободная ОЗУ ВСЕЙ системы) - первое
 * прямо отвечает на нужный здесь вопрос "сколько мы сами можем выделить,
 * прежде чем упадём с OutOfMemoryError", второе про другое (риск того, что
 * система убьёт наш процесс при системной нехватке памяти) - см.
 * docs/ARCHITECTURE.md §2.2.
 */
object MemoryBudget {

    /** Доля кучи, которую отдаём под буферы кадров - остальное на Compose/Bitmap-декодер/GC-паузы. */
    private const val USABLE_FRACTION = 0.6

    /** Байт на пиксель у одного FloatImage: 3 канала (R,G,B) x 4 байта (Float). */
    private const val BYTES_PER_PIXEL_FLOAT_IMAGE = 12L

    /**
     * Запас на дополнительные полноразмерные буферы, которые Pipeline держит
     * одновременно с исходными N кадрами: стек (stackedLinear), кадр после
     * вычитания градиента/нейтрализации, кадр после растяжки, кадр после
     * шумоподавления, плюс временный ARGB_8888 Bitmap (4 байта/пиксель) во
     * время декодирования очередного кадра. Взято с запасом сверху, а не
     * измерено профайлером на реальном устройстве - см. docs/ARCHITECTURE.md §4.
     */
    private const val EXTRA_WHOLE_IMAGE_BUFFERS = 5L

    /** Нижний предел - ниже него обработка теряет смысл, лучше явно упереться в потолок, чем декодировать в 0 пикселей. */
    const val MIN_TOTAL_PIXELS = 640L * 480L

    /** Верхний потолок (~48 Мп) - выше практического разрешения телефонных камер, так что
     * реальные фото почти никогда не режутся; это лишь страховка от OOM на экстремальных
     * сериях, а не рабочий предел (см. docs/ARCHITECTURE.md §4). */
    const val HARD_CAP_TOTAL_PIXELS = 8000L * 6000L

    data class Budget(val maxTotalPixels: Long, val maxMemoryBytes: Long, val frameCount: Int)

    /** [extraFullFrames] - сколько ещё полноразмерных FloatImage держится параллельно (мастер-кадры калибровки). */
    fun compute(frameCount: Int, extraFullFrames: Int = 0, maxMemoryBytes: Long = Runtime.getRuntime().maxMemory()): Budget {
        val n = frameCount.coerceAtLeast(1).toLong() + extraFullFrames.coerceAtLeast(0)
        val usableBytes = (maxMemoryBytes * USABLE_FRACTION).toLong()
        val bytesPerPixelTotal = (n + EXTRA_WHOLE_IMAGE_BUFFERS) * BYTES_PER_PIXEL_FLOAT_IMAGE
        val rawMaxPixels = if (bytesPerPixelTotal > 0) usableBytes / bytesPerPixelTotal else MIN_TOTAL_PIXELS
        val clamped = rawMaxPixels.coerceIn(MIN_TOTAL_PIXELS, HARD_CAP_TOTAL_PIXELS)
        return Budget(clamped, maxMemoryBytes, n.toInt())
    }
}
