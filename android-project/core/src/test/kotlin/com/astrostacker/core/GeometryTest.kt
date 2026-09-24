package com.astrostacker.core

import org.junit.Assert.assertEquals
import org.junit.Test

class GeometryTest {

    @Test
    fun similarityTransform_inverseRoundTrip() {
        val t = SimilarityTransform(scale = 1.2, rotationRad = 0.3, tx = 5.0, ty = -3.0)
        val p = Vec2(37.0, -12.0)
        val back = t.inverse().apply(t.apply(p))
        assertEquals(p.x, back.x, 1e-9)
        assertEquals(p.y, back.y, 1e-9)
    }

    @Test
    fun similarityTransform_fromTwoPoints_recoversKnownTransform() {
        val truth = SimilarityTransform(scale = 0.97, rotationRad = 0.15, tx = 12.0, ty = -8.0)
        val p1 = Vec2(10.0, 20.0)
        val p2 = Vec2(-5.0, 30.0)
        val fitted = SimilarityTransform.fromTwoPoints(
            PointMatch(p1, truth.apply(p1)),
            PointMatch(p2, truth.apply(p2))
        )!!
        assertEquals(truth.scale, fitted.scale, 1e-9)
        assertEquals(truth.rotationRad, fitted.rotationRad, 1e-9)
        assertEquals(truth.tx, fitted.tx, 1e-6)
        assertEquals(truth.ty, fitted.ty, 1e-6)
    }

    @Test
    fun affineTransform_inverseRoundTrip() {
        val t = AffineTransform(a = 1.1, b = 0.05, c = 3.0, d = -0.05, e = 0.95, f = -2.0)
        val p = Vec2(15.0, 40.0)
        val back = t.inverse().apply(t.apply(p))
        assertEquals(p.x, back.x, 1e-9)
        assertEquals(p.y, back.y, 1e-9)
    }

    @Test
    fun similarityTransform_identityIsNoOp() {
        val p = Vec2(1.0, 2.0)
        val result = SimilarityTransform.IDENTITY.apply(p)
        assertEquals(p.x, result.x, 1e-12)
        assertEquals(p.y, result.y, 1e-12)
    }

    @Test
    fun affineFromSimilarity_agreesWithSimilarity() {
        val s = SimilarityTransform(scale = 1.05, rotationRad = 0.4, tx = 3.0, ty = 7.0)
        val a = AffineTransform.fromSimilarity(s)
        val p = Vec2(-3.0, 9.0)
        val viaSimilarity = s.apply(p)
        val viaAffine = a.apply(p)
        assertEquals(viaSimilarity.x, viaAffine.x, 1e-9)
        assertEquals(viaSimilarity.y, viaAffine.y, 1e-9)
    }
}
