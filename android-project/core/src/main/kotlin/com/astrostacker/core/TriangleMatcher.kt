package com.astrostacker.core

import kotlin.math.sqrt

data class TriangleMatcherConfig(
    val neighborsPerStar: Int = 5,
    val ratioTolerance: Double = 0.01,
    val minVotes: Int = 1
)

/**
 * Сопоставление звёзд между двумя кадрами через инварианты треугольников:
 * для каждой звезды и её k ближайших соседей строятся треугольники, отношения
 * длин сторон (инвариантные к повороту/сдвигу/равномерному масштабу) ищутся
 * между кадрами. Идея — Groth (1986); в духе современной реализации Astroalign
 * (Beroiz, Cabral & Sanchez, 2020) — независимая реализация по общему принципу,
 * без заимствования их кода. См. docs/LITERATURE.md §2.2.
 *
 * Упрощение относительно Astroalign: там для звезды и 4 соседей берутся все
 * C(5,3)=10 треугольников из этого 5-точечного набора (включая треугольники,
 * не содержащие саму звезду); здесь для звезды и k соседей берутся все C(k,2)
 * треугольников, каждый раз включающих саму звезду как одну из вершин — проще
 * в реализации, при k=5 даёт то же число треугольников на звезду (10).
 */
object TriangleMatcher {

    private data class TriDescriptor(
        val vShort: Int, val vMid: Int, val vLong: Int,
        val ratioShortLong: Double, val ratioMidLong: Double
    )

    /** Возвращает список кандидатов в соответствия (индекс в [reference], индекс в [target]). */
    fun match(reference: List<Vec2>, target: List<Vec2>, config: TriangleMatcherConfig = TriangleMatcherConfig()): List<Pair<Int, Int>> {
        if (reference.size < 3 || target.size < 3) return emptyList()

        val refTriangles = buildTriangles(reference, config.neighborsPerStar)
        val targetTriangles = buildTriangles(target, config.neighborsPerStar)
        if (refTriangles.isEmpty() || targetTriangles.isEmpty()) return emptyList()

        val votes = HashMap<Pair<Int, Int>, Int>()

        for (tt in targetTriangles) {
            var bestRef: TriDescriptor? = null
            var bestDist = config.ratioTolerance
            for (rt in refTriangles) {
                val dr = rt.ratioShortLong - tt.ratioShortLong
                val dm = rt.ratioMidLong - tt.ratioMidLong
                val dist = sqrt(dr * dr + dm * dm)
                if (dist < bestDist) { bestDist = dist; bestRef = rt }
            }
            val rt = bestRef ?: continue
            addVote(votes, rt.vShort, tt.vShort)
            addVote(votes, rt.vMid, tt.vMid)
            addVote(votes, rt.vLong, tt.vLong)
        }

        // Для каждого target-индекса оставляем ref-индекс с наибольшим числом голосов.
        val bestForTarget = HashMap<Int, Pair<Int, Int>>() // targetIdx -> (refIdx, votes)
        for (entry in votes.entries) {
            val refIdx = entry.key.first
            val targetIdx = entry.key.second
            val count = entry.value
            if (count < config.minVotes) continue
            val current = bestForTarget[targetIdx]
            if (current == null || count > current.second) {
                bestForTarget[targetIdx] = Pair(refIdx, count)
            }
        }

        return bestForTarget.entries.map { Pair(it.value.first, it.key) }
    }

    private fun addVote(votes: HashMap<Pair<Int, Int>, Int>, refIdx: Int, targetIdx: Int) {
        val key = Pair(refIdx, targetIdx)
        votes[key] = (votes[key] ?: 0) + 1
    }

    private fun buildTriangles(points: List<Vec2>, neighborsPerStar: Int): List<TriDescriptor> {
        val n = points.size
        val k = neighborsPerStar.coerceAtMost(n - 1)
        if (k < 2) return emptyList()
        val result = ArrayList<TriDescriptor>()

        for (i in points.indices) {
            val neighborIdx = points.indices.filter { it != i }
                .sortedBy { points[i].distanceTo(points[it]) }
                .take(k)

            for (a in neighborIdx.indices) {
                for (bIdx in (a + 1) until neighborIdx.size) {
                    val d = descriptorFor(points, i, neighborIdx[a], neighborIdx[bIdx])
                    if (d != null) result.add(d)
                }
            }
        }
        return result
    }

    /** Строит инвариантный дескриптор треугольника (i0,i1,i2); null для вырожденных случаев. */
    private fun descriptorFor(points: List<Vec2>, i0: Int, i1: Int, i2: Int): TriDescriptor? {
        val p0 = points[i0]; val p1 = points[i1]; val p2 = points[i2]
        // Сторона напротив вершины i0 — это (p1,p2); напротив i1 — (p0,p2); напротив i2 — (p0,p1).
        val sides = doubleArrayOf(p1.distanceTo(p2), p0.distanceTo(p2), p0.distanceTo(p1))
        val verts = intArrayOf(i0, i1, i2)
        if (sides.any { it < 1e-6 }) return null

        val order = (0..2).sortedBy { sides[it] }
        val shortSide = sides[order[0]]; val midSide = sides[order[1]]; val longSide = sides[order[2]]
        if (longSide < 1e-6) return null

        return TriDescriptor(
            vShort = verts[order[0]], vMid = verts[order[1]], vLong = verts[order[2]],
            ratioShortLong = shortSide / longSide, ratioMidLong = midSide / longSide
        )
    }
}
