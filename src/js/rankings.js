/**
 * DU Physics 104 - Peer Perception Rankings (Measurement Table)
 */
import { getState } from "./state.js";

/**
 * Compute sorted rankings for active students based on arithmetic overall average
 */
export function calculateRankings() {
  const { students, aggregates } = getState();

  const activeStudents = students.filter((s) => s.active);

  const enriched = activeStudents.map((student) => {
    const agg = aggregates[student.id] || {
      overallAverage: null,
      ratingCount: 0,
      reviewCount: 0,
    };

    return {
      student,
      overallAverage: agg.overallAverage,
      ratingCount: agg.ratingCount || 0,
      reviewCount: agg.reviewCount || 0,
    };
  });

  // Stable sorting strategy:
  // 1. Rated students first
  // 2. Highest overallAverage desc
  // 3. Higher ratingCount desc (more consensus)
  // 4. Stable tie-break by roll ascending
  enriched.sort((a, b) => {
    const aRated = a.overallAverage !== null;
    const bRated = b.overallAverage !== null;

    if (aRated && !bRated) return -1;
    if (!aRated && bRated) return 1;
    if (!aRated && !bRated) return (a.student.roll || "").localeCompare(b.student.roll || "");

    if (b.overallAverage !== a.overallAverage) {
      return b.overallAverage - a.overallAverage;
    }

    if (b.ratingCount !== a.ratingCount) {
      return b.ratingCount - a.ratingCount;
    }

    return (a.student.roll || "").localeCompare(b.student.roll || "");
  });

  return enriched;
}
