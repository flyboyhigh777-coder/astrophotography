package com.astrostacker.core

import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Минимальный baseline-TIFF: RGB, 16 бит на канал, без сжатия, одна полоса.
 * Открывается в Photoshop, Lightroom, GIMP, PixInsight, Siril - все 16 бит
 * сохраняются, никакого сжатия с потерями. В Android API готового кодировщика
 * TIFF нет, поэтому пишем формат сами - он простой.
 */
object TiffWriter {

    private const val TYPE_SHORT = 3
    private const val TYPE_LONG = 4
    private const val TYPE_RATIONAL = 5
    private const val TYPE_ASCII = 2

    fun write(out: OutputStream, image: Rgb16Image, software: String = "AstroStacker") {
        val w = image.width
        val h = image.height
        val pixelBytes = w.toLong() * h * 6
        require(pixelBytes < Int.MAX_VALUE) { "Изображение слишком большое для TIFF без BigTIFF" }

        val softwareBytes = (software + "\u0000").toByteArray(Charsets.US_ASCII)
        val entryCount = 14
        val ifdOffset = 8
        val ifdSize = 2 + entryCount * 12 + 4
        // Данные, не влезающие в 4 байта записи, - сразу за IFD.
        val bitsOffset = ifdOffset + ifdSize
        val xResOffset = bitsOffset + 6
        val yResOffset = xResOffset + 8
        val softwareOffset = yResOffset + 8
        val pixelOffset = softwareOffset + softwareBytes.size + (softwareBytes.size and 1)

        val header = ByteBuffer.allocate(pixelOffset).order(ByteOrder.LITTLE_ENDIAN)
        header.put('I'.code.toByte()).put('I'.code.toByte()).putShort(42).putInt(ifdOffset)

        header.putShort(entryCount.toShort())
        fun entry(tag: Int, type: Int, count: Int, value: Int) {
            header.putShort(tag.toShort()).putShort(type.toShort()).putInt(count)
            if (type == TYPE_SHORT && count == 1) header.putShort(value.toShort()).putShort(0) else header.putInt(value)
        }
        // Теги обязаны идти по возрастанию номера.
        entry(256, TYPE_LONG, 1, w) // ImageWidth
        entry(257, TYPE_LONG, 1, h) // ImageLength
        entry(258, TYPE_SHORT, 3, bitsOffset) // BitsPerSample = 16,16,16
        entry(259, TYPE_SHORT, 1, 1) // Compression = none
        entry(262, TYPE_SHORT, 1, 2) // Photometric = RGB
        entry(273, TYPE_LONG, 1, pixelOffset) // StripOffsets
        entry(277, TYPE_SHORT, 1, 3) // SamplesPerPixel
        entry(278, TYPE_LONG, 1, h) // RowsPerStrip
        entry(279, TYPE_LONG, 1, pixelBytes.toInt()) // StripByteCounts
        entry(282, TYPE_RATIONAL, 1, xResOffset) // XResolution
        entry(283, TYPE_RATIONAL, 1, yResOffset) // YResolution
        entry(284, TYPE_SHORT, 1, 1) // PlanarConfiguration = chunky
        entry(296, TYPE_SHORT, 1, 2) // ResolutionUnit = inch
        entry(305, TYPE_ASCII, softwareBytes.size, softwareOffset) // Software
        header.putInt(0) // следующего IFD нет

        header.putShort(16).putShort(16).putShort(16)
        header.putInt(300).putInt(1)
        header.putInt(300).putInt(1)
        header.put(softwareBytes)
        while (header.position() < pixelOffset) header.put(0)
        out.write(header.array())

        // Пиксели - построчно, чтобы не выделять второй буфер размером с весь кадр.
        val row = ByteBuffer.allocate(w * 6).order(ByteOrder.LITTLE_ENDIAN)
        for (y in 0 until h) {
            row.clear()
            val base = y * w * 3
            for (i in 0 until w * 3) row.putShort(image.data[base + i])
            out.write(row.array(), 0, w * 6)
        }
        out.flush()
    }
}
