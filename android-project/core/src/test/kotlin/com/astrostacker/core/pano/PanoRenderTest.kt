package com.astrostacker.core.pano

import org.junit.Assert.assertEquals
import org.junit.Test

class PanoRenderTest {

    @Test
    fun autoProjection_picksWeakestProjectionThatFitsTheExtent() {
        assertEquals(PanoProjection.PLANAR, PanoRender.autoProjection(60.0, 40.0))
        assertEquals(PanoProjection.CYLINDRICAL, PanoRender.autoProjection(180.0, 50.0))
        assertEquals(PanoProjection.SPHERICAL, PanoRender.autoProjection(180.0, 90.0))
    }

    @Test
    fun clampProjection_keepsPreferredWhenItsStrongEnough() {
        // Узкий охват - выбор пользователя (в т.ч. более "сильная" проекция, чем нужно) не трогаем.
        assertEquals(PanoProjection.PLANAR, PanoRender.clampProjection(PanoProjection.PLANAR, 60.0, 40.0))
        assertEquals(PanoProjection.SPHERICAL, PanoRender.clampProjection(PanoProjection.SPHERICAL, 60.0, 40.0))
    }

    @Test
    fun clampProjection_upgradesPreferredWhenItsTooWeakForTheExtent() {
        // Пользователь выбрал плоскую ДО склейки, а реальный охват панорамы (известен
        // только после неё) оказался слишком широким - плоская дала бы размазню,
        // подстраховываемся минимально необходимой (см. autoProjection).
        assertEquals(PanoProjection.CYLINDRICAL, PanoRender.clampProjection(PanoProjection.PLANAR, 180.0, 50.0))
        assertEquals(PanoProjection.SPHERICAL, PanoRender.clampProjection(PanoProjection.PLANAR, 180.0, 90.0))
        assertEquals(PanoProjection.SPHERICAL, PanoRender.clampProjection(PanoProjection.CYLINDRICAL, 180.0, 90.0))
    }
}
