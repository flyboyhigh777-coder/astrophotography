package com.astrostacker.core

import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.abs

/** Точка на плоскости изображения (пиксельные координаты; Double — центроиды звёзд субпиксельные). */
data class Vec2(val x: Double, val y: Double) {
    operator fun plus(o: Vec2) = Vec2(x + o.x, y + o.y)
    operator fun minus(o: Vec2) = Vec2(x - o.x, y - o.y)
    fun distanceTo(o: Vec2): Double = hypot(x - o.x, y - o.y)
}

/** Соответствие одной и той же звезды в двух кадрах: from (текущий кадр) -> to (опорный кадр). */
data class PointMatch(val from: Vec2, val to: Vec2)

/** Минимальная арифметика комплексных чисел — только то, что нужно для Transform2D. */
internal data class Cx(val re: Double, val im: Double) {
    operator fun plus(o: Cx) = Cx(re + o.re, im + o.im)
    operator fun minus(o: Cx) = Cx(re - o.re, im - o.im)
    operator fun times(o: Cx) = Cx(re * o.re - im * o.im, re * o.im + im * o.re)
    operator fun div(o: Cx): Cx {
        val denom = o.re * o.re + o.im * o.im
        return Cx((re * o.re + im * o.im) / denom, (im * o.re - re * o.im) / denom)
    }
    fun abs(): Double = hypot(re, im)
    fun arg(): Double = atan2(im, re)

    companion object {
        fun ofPoint(p: Vec2) = Cx(p.x, p.y)
        fun rotScale(scale: Double, rotationRad: Double) =
            Cx(scale * kotlin.math.cos(rotationRad), scale * kotlin.math.sin(rotationRad))
    }
}

/**
 * Общее 2D-преобразование кадра. [apply] отображает координаты ИЗ этого кадра
 * В опорный кадр (forward). [inverse] — обратное преобразование; им пользуется
 * стекинг (TiledStacker), чтобы для каждого пикселя ВЫХОДНОГО (опорного)
 * изображения найти, откуда его брать в исходном кадре.
 *
 * Оба подкласса намеренно объявлены в этом же файле — в Kotlin 1.3 это
 * требование для исчерпывающего `when` без ветки `else` над sealed-классом.
 */
sealed class Transform2D {
    abstract fun apply(p: Vec2): Vec2
    abstract fun inverse(): Transform2D
}

/**
 * Преобразование подобия: поворот + равномерный масштаб + сдвиг.
 * Комплексная форма: z' = a*z + b, a = scale*e^{i*rotationRad}, b = tx + i*ty.
 * Основная модель регистрации кадров — обоснование в docs/ARCHITECTURE.md §3.
 */
data class SimilarityTransform(
    val scale: Double,
    val rotationRad: Double,
    val tx: Double,
    val ty: Double
) : Transform2D() {

    override fun apply(p: Vec2): Vec2 {
        val a = Cx.rotScale(scale, rotationRad)
        val zPrime = a * Cx.ofPoint(p) + Cx(tx, ty)
        return Vec2(zPrime.re, zPrime.im)
    }

    override fun inverse(): SimilarityTransform {
        val a = Cx.rotScale(scale, rotationRad)
        val b = Cx(tx, ty)
        val invA = Cx(1.0, 0.0) / a
        val negBOverA = Cx(0.0, 0.0) - (b / a)
        return SimilarityTransform(invA.abs(), invA.arg(), negBOverA.re, negBOverA.im)
    }

    companion object {
        val IDENTITY = SimilarityTransform(1.0, 0.0, 0.0, 0.0)

        /**
         * Точное решение по РОВНО ДВУМ соответствиям точек — минимальная выборка
         * для RANSAC (4 неизвестных: scale, rotation, tx, ty <-> 2 комплексных
         * уравнения). Возвращает null для вырожденного случая (совпадающие точки).
         */
        fun fromTwoPoints(m1: PointMatch, m2: PointMatch): SimilarityTransform? {
            val z1 = Cx.ofPoint(m1.from); val z1p = Cx.ofPoint(m1.to)
            val z2 = Cx.ofPoint(m2.from); val z2p = Cx.ofPoint(m2.to)
            val denom = z1 - z2
            if (denom.abs() < 1e-9) return null
            val a = (z1p - z2p) / denom
            val b = z1p - a * z1
            return SimilarityTransform(a.abs(), a.arg(), b.re, b.im)
        }
    }
}

/**
 * Аффинное преобразование: x' = a*x+b*y+c ; y' = d*x+e*y+f. Запасной вариант
 * с 6 степенями свободы — см. docs/ARCHITECTURE.md §3.
 */
data class AffineTransform(
    val a: Double, val b: Double, val c: Double,
    val d: Double, val e: Double, val f: Double
) : Transform2D() {

    override fun apply(p: Vec2): Vec2 = Vec2(a * p.x + b * p.y + c, d * p.x + e * p.y + f)

    override fun inverse(): AffineTransform {
        val det = a * e - b * d
        require(abs(det) > 1e-12) { "Аффинное преобразование не обратимо (det≈0)" }
        val ia = e / det; val ib = -b / det
        val id = -d / det; val ie = a / det
        val ic = -(ia * c + ib * f)
        val iff = -(id * c + ie * f)
        return AffineTransform(ia, ib, ic, id, ie, iff)
    }

    companion object {
        fun fromSimilarity(s: SimilarityTransform): AffineTransform {
            val cosT = kotlin.math.cos(s.rotationRad); val sinT = kotlin.math.sin(s.rotationRad)
            return AffineTransform(
                s.scale * cosT, -s.scale * sinT, s.tx,
                s.scale * sinT, s.scale * cosT, s.ty
            )
        }
    }
}
